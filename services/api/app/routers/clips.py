"""Clip Lab routes."""

import asyncio
import logging
import queue
import re
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from app.config import settings
from app.db import async_session, get_db
from app.lib.fastcap_bridge import rank_clips_from_analysis_dir
from app.lib.job_events import append_job_event, set_job_status
from app.lib.transcript_analysis import get_analysis_artifact_status, transcript_analysis_dir
from app.models import ClipAnalysisRun, ClipCandidate, MediaAsset, ProcessingJob, ProcessingJobEvent, Project, Transcript

router = APIRouter(prefix="/api/clips", tags=["clips"])
logger = logging.getLogger(__name__)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class StartAnalysisBody(BaseModel):
    project_id: str
    sermon_asset_id: str
    transcript_id: str
    model: str | None = None
    host: str | None = None
    candidate_limit: int = 24
    output_count: int = 10


class UpdateClipBody(BaseModel):
    title: Optional[str] = None
    start_seconds: Optional[float] = None
    end_seconds: Optional[float] = None


def _serialize_clip_candidate(c: ClipCandidate) -> dict:
    payload = c.analysis_payload_json or {}
    return {
        "id": c.id,
        "project_id": c.project_id,
        "analysis_run_id": c.analysis_run_id,
        "title": c.title,
        "hook_text": c.hook_text,
        "start_seconds": c.start_seconds,
        "end_seconds": c.end_seconds,
        "duration_seconds": c.duration_seconds,
        "score": c.score,
        "status": c.status,
        "analysis_payload": payload,
    }


def _candidate_sort_key(candidate: ClipCandidate) -> tuple[int, float, datetime]:
    payload = candidate.analysis_payload_json or {}
    raw_rank = payload.get("rank")
    try:
        rank = int(raw_rank)
    except (TypeError, ValueError):
        rank = 10**9
    score = float(candidate.score or 0.0)
    created_at = candidate.created_at or datetime.min.replace(tzinfo=timezone.utc)
    return (rank, -score, created_at)


async def _run_clip_analysis(
    job_id: str,
    run_id: str,
    project_id: str,
    transcript_id: str,
    model: str,
    host: str,
    candidate_limit: int,
    output_count: int,
):
    async with async_session() as db:
        try:
            job = await db.get(ProcessingJob, job_id)
            run = await db.get(ClipAnalysisRun, run_id)
            transcript = await db.get(Transcript, transcript_id)
            if not job or not run or not transcript:
                raise ValueError("Clip analysis records could not be loaded.")
            analysis_dir = transcript_analysis_dir(project_id, transcript_id)
            artifact_status = get_analysis_artifact_status(project_id, transcript_id)
            if not artifact_status["ready"]:
                missing = ", ".join(artifact_status["missing_files"])
                raise ValueError(
                    f"Transcript analysis artifacts are missing ({missing}). Generate clip artifacts from the transcript page or Clip Lab first."
                )

            await set_job_status(db, job_id, "running", "Loading transcript analysis bundle...", 5, step_code="load_analysis_bundle")
            await append_job_event(
                db,
                job_id,
                "status",
                f"Loading prepared transcript analysis artifacts from {analysis_dir}",
                progress_percent=5,
                step_code="load_analysis_bundle",
            )
            run.status = "running"
            run.started_at = datetime.now(timezone.utc)
            run.model_version = model
            await db.flush()
            await db.commit()

            event_queue: queue.Queue[tuple[str, str, int | None, str | None]] = queue.Queue()

            def progress_callback(current: int, total: int, label: str):
                mapped = min(95, max(10, int((current / max(total, 1)) * 85)))
                event_queue.put(("status", label, mapped, f"pass_{current}"))

            def logger_callback(message: str):
                event_queue.put(("log", message, None, None))

            rank_task = asyncio.create_task(
                rank_clips_from_analysis_dir(
                    analysis_dir=analysis_dir,
                    model=model,
                    host=host,
                    candidate_limit=candidate_limit,
                    output_count=output_count,
                    logger=logger_callback,
                    progress=progress_callback,
                )
            )

            while not rank_task.done() or not event_queue.empty():
                drained = False
                while True:
                    try:
                        event_type, message, progress_percent, step_code = event_queue.get_nowait()
                    except queue.Empty:
                        break
                    drained = True
                    if event_type == "status":
                        await set_job_status(db, job_id, "running", message, progress_percent, step_code=step_code)
                    await append_job_event(
                        db,
                        job_id,
                        event_type,
                        message,
                        progress_percent=progress_percent,
                        step_code=step_code,
                    )
                    await db.flush()
                    await db.commit()

                if not rank_task.done():
                    await asyncio.sleep(0.1 if drained else 0.2)

            rank_result = await rank_task
            ranked_clips = list(rank_result.get("clips", []) or [])
            if not ranked_clips:
                raise ValueError("Clip ranker returned no clip candidates.")

            async with async_session() as write_db:
                write_run = await write_db.get(ClipAnalysisRun, run_id)
                if not write_run:
                    raise ValueError("Clip analysis records disappeared during processing.")

                await set_job_status(
                    write_db,
                    job_id,
                    "running",
                    "Saving ranked clip candidates...",
                    96,
                    step_code="persist_ranked_clips",
                )
                await append_job_event(
                    write_db,
                    job_id,
                    "status",
                    f"Persisting {len(ranked_clips)} ranked clips from FastCap analysis",
                    progress_percent=96,
                    step_code="persist_ranked_clips",
                    payload_json={"candidate_count": len(ranked_clips)},
                )
                await write_db.flush()

                for idx, clip in enumerate(ranked_clips, start=1):
                    editorial_scores = clip.get("editorial_scores", {}) if isinstance(clip.get("editorial_scores"), dict) else {}
                    feature_scores = clip.get("feature_scores", {}) if isinstance(clip.get("feature_scores"), dict) else {}
                    start_time = str(clip.get("start_time", "00:00:00.000"))
                    end_time = str(clip.get("end_time", "00:00:00.000"))
                    start_seconds = _parse_timestamp_to_seconds(start_time)
                    end_seconds = _parse_timestamp_to_seconds(end_time)
                    cadence_marker = str(clip.get("cadence_marker") or "").strip()
                    clip_type = str(clip.get("clip_type") or "").strip()
                    analysis_payload = {
                        "rank": idx,
                        "strategy": "fastcap_rank_sermon_moments",
                        "clip_type": clip_type,
                        "cadence_marker": cadence_marker,
                        "editor_reason": clip.get("editor_reason"),
                        "editorial_scores": editorial_scores,
                        "feature_scores": feature_scores,
                        "scroll_stopping_strength": clip.get("scroll_stopping_strength"),
                        "best_platform_fit": clip.get("best_platform_fit"),
                        "personal_fit_score": clip.get("personal_fit_score"),
                        "final_rank_score": clip.get("final_rank_score"),
                        "reasoning_consistency": clip.get("reasoning_consistency"),
                        "source_result": clip,
                    }
                    write_db.add(
                        ClipCandidate(
                            id=str(uuid.uuid4()),
                            project_id=project_id,
                            analysis_run_id=run_id,
                            title=(clip_type + (f" - {cadence_marker}" if cadence_marker else "")).strip(" -") or f"Clip {idx}",
                            hook_text=str(clip.get("opening_hook") or "").strip() or str(clip.get("editor_reason") or "").strip(),
                            start_seconds=start_seconds,
                            end_seconds=end_seconds,
                            duration_seconds=max(0.0, end_seconds - start_seconds),
                            score=float(
                                clip.get("final_rank_score")
                                or clip.get("editor_score")
                                or editorial_scores.get("editor")
                                or 0.0
                            ),
                            status="draft",
                            analysis_payload_json=analysis_payload,
                        )
                    )

                write_run.status = "completed"
                write_run.completed_at = datetime.now(timezone.utc)
                write_run.summary_json = rank_result
                await set_job_status(
                    write_db,
                    job_id,
                    "completed",
                    f"Clips ready ({len(ranked_clips)} candidates)",
                    100,
                    step_code="completed",
                )
                await append_job_event(
                    write_db,
                    job_id,
                    "status",
                    f"Clip analysis completed with {len(ranked_clips)} ranked candidates",
                    progress_percent=100,
                    step_code="completed",
                )
                await write_db.flush()
                await write_db.commit()
        except Exception as exc:
            logger.exception("Clip analysis failed for job %s", job_id)
            async with async_session() as error_db:
                error_job = await error_db.get(ProcessingJob, job_id)
                error_run = await error_db.get(ClipAnalysisRun, run_id)
                if error_job:
                    await set_job_status(
                        error_db,
                        job_id,
                        "failed",
                        "Clip analysis failed",
                        error_text=str(exc),
                        step_code="failed",
                    )
                    await append_job_event(
                        error_db,
                        job_id,
                        "error",
                        f"Clip analysis failed: {exc}",
                        step_code="failed",
                    )
                if error_run:
                    error_run.status = "failed"
                    error_run.completed_at = datetime.now(timezone.utc)
                await error_db.flush()
                await error_db.commit()


def _parse_timestamp_to_seconds(ts: str) -> float:
    parts = ts.split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])


def _resolve_upload_path(storage_key: str, filename: str) -> Path:
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    return upload_dir / storage_key / filename


def _ffmpeg_binary() -> str:
    local_binary = _PROJECT_ROOT / "services" / "api" / "ffmpeg.exe"
    return str(local_binary) if local_binary.exists() else "ffmpeg"


def _safe_filename_fragment(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return cleaned or "clip"


def _delete_file(path: str) -> None:
    try:
        Path(path).unlink(missing_ok=True)
    except Exception:
        logger.warning("Failed to delete temporary exported clip %s", path, exc_info=True)


def _export_clip_file(
    source_path: Path,
    output_path: Path,
    start_seconds: float,
    duration_seconds: float,
) -> None:
    cmd = [
        _ffmpeg_binary(),
        "-y",
        "-ss",
        f"{start_seconds:.3f}",
        "-i",
        str(source_path),
        "-t",
        f"{duration_seconds:.3f}",
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"ffmpeg failed with code {result.returncode}")


@router.post("/analyze")
async def start_clip_analysis(
    body: StartAnalysisBody,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Start clip analysis job."""
    result = await db.execute(select(Project).where(Project.id == body.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    run_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    run = ClipAnalysisRun(
        id=run_id,
        project_id=body.project_id,
        sermon_asset_id=body.sermon_asset_id,
        transcript_id=body.transcript_id,
        status="pending",
    )
    db.add(run)

    job = ProcessingJob(
        id=job_id,
        project_id=body.project_id,
        job_type="analyze_clips",
        subject_type="clip_analysis_run",
        subject_id=run_id,
        status="queued",
        current_message="Clip analysis queued",
    )
    db.add(job)
    await db.flush()
    await append_job_event(
        db,
        job_id,
        "status",
        "Clip analysis queued",
        progress_percent=0,
        step_code="queued",
        payload_json={"run_id": run_id},
    )

    background_tasks.add_task(
        _run_clip_analysis,
        job_id,
        run_id,
        body.project_id,
        body.transcript_id,
        body.model or settings.clip_analysis_model,
        body.host or settings.clip_analysis_host,
        body.candidate_limit,
        body.output_count,
    )
    await db.commit()

    return {
        "job_id": job_id,
        "run_id": run_id,
        "status": "completed" if settings.sync_transcript_dev else "queued",
        "message": "Clips ready" if settings.sync_transcript_dev else "Analysis queued",
    }


@router.get("/project/{project_id}/candidates")
async def list_clip_candidates(
    project_id: str,
    run_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List clip candidates for a project."""
    q = select(ClipCandidate).where(ClipCandidate.project_id == project_id)
    if run_id:
        q = q.where(ClipCandidate.analysis_run_id == run_id)
    result = await db.execute(q)
    candidates = sorted(result.scalars().all(), key=_candidate_sort_key)
    return [_serialize_clip_candidate(c) for c in candidates]


@router.get("/candidates/{candidate_id}")
async def get_clip_candidate(
    candidate_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single clip candidate with full analysis payload."""
    result = await db.execute(select(ClipCandidate).where(ClipCandidate.id == candidate_id))
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Clip not found")
    return _serialize_clip_candidate(candidate)


@router.patch("/candidates/{candidate_id}")
async def update_clip_candidate(
    candidate_id: str,
    body: UpdateClipBody,
    db: AsyncSession = Depends(get_db),
):
    """Update clip candidate timing or title."""
    result = await db.execute(select(ClipCandidate).where(ClipCandidate.id == candidate_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Clip not found")
    if body.title is not None:
        c.title = body.title
    if body.start_seconds is not None:
        c.start_seconds = body.start_seconds
    if body.end_seconds is not None:
        c.end_seconds = body.end_seconds
        c.duration_seconds = body.end_seconds - c.start_seconds
    await db.flush()
    return {"ok": True}


@router.post("/candidates/{candidate_id}/export")
async def export_clip(
    candidate_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Export a clip candidate as a downloadable media file."""
    result = await db.execute(select(ClipCandidate).where(ClipCandidate.id == candidate_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Clip not found")
    project = await db.get(Project, c.project_id)

    run_result = await db.execute(select(ClipAnalysisRun).where(ClipAnalysisRun.id == c.analysis_run_id))
    run = run_result.scalar_one_or_none()
    sermon_asset: MediaAsset | None = None
    if run:
        sermon_asset = await db.get(MediaAsset, run.sermon_asset_id)
    if sermon_asset is None:
        sermon_result = await db.execute(
            select(MediaAsset)
            .where(MediaAsset.project_id == c.project_id, MediaAsset.asset_kind == "sermon_master")
            .order_by(MediaAsset.created_at.desc())
        )
        sermon_asset = sermon_result.scalars().first()
    if sermon_asset is None:
        raise HTTPException(status_code=404, detail="Sermon master asset not found for this clip")

    source_path = _resolve_upload_path(sermon_asset.storage_key, sermon_asset.filename)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail="Sermon master file is missing on disk")

    duration_seconds = max(0.001, c.end_seconds - c.start_seconds)
    ext = source_path.suffix or ".mp4"
    temp_dir = Path(tempfile.gettempdir()) / "amplify_clip_exports"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_name = f"{uuid.uuid4()}{ext}"
    output_path = temp_dir / temp_name

    try:
        _export_clip_file(
            source_path=source_path,
            output_path=output_path,
            start_seconds=max(0.0, c.start_seconds),
            duration_seconds=duration_seconds,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Clip export failed: {exc}") from exc

    clip_number = c.analysis_payload_json.get("rank") if isinstance(c.analysis_payload_json, dict) else None
    if not isinstance(clip_number, int):
        clip_number = 1
    project_name = _safe_filename_fragment(project.title if project else c.project_id)
    download_name = f"{project_name}_clip-{clip_number:02d}{ext}"

    return FileResponse(
        path=output_path,
        filename=download_name,
        media_type=sermon_asset.mime_type or "video/mp4",
        background=BackgroundTask(_delete_file, str(output_path)),
    )


@router.get("/project/{project_id}/runs")
async def list_analysis_runs(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """List clip analysis runs for a project."""
    result = await db.execute(
        select(ClipAnalysisRun)
        .where(ClipAnalysisRun.project_id == project_id)
        .order_by(ClipAnalysisRun.created_at.desc())
        .limit(10)
    )
    runs = result.scalars().all()
    return [{"id": r.id, "status": r.status, "created_at": r.created_at.isoformat()} for r in runs]
