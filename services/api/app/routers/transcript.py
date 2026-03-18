"""Transcript routes."""

import asyncio
import logging
import queue
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import async_session, get_db
from app.lib.job_events import append_job_event, set_job_status
from app.lib.transcript_analysis import generate_transcript_analysis_artifacts, get_analysis_artifact_status
from app.models import MediaAsset, ProcessingJob, Project, Transcript

router = APIRouter(prefix="/api/transcript", tags=["transcript"])

logger = logging.getLogger(__name__)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class StartTranscriptionBody(BaseModel):
    project_id: str
    sermon_asset_id: str
    transcript_scope: str = "sermon"


class StartTranscriptionResponse(BaseModel):
    job_id: str
    status: str
    message: str


class StartArtifactGenerationResponse(BaseModel):
    job_id: str
    status: str
    message: str


async def _create_placeholder_transcript(
    db: AsyncSession,
    job_id: str,
    project_id: str,
    asset_id: str,
    transcript_scope: str = "sermon",
):
    """Create a placeholder transcript (dev mode when worker not running)."""
    from sqlalchemy import update

    t = Transcript(
        id=str(uuid.uuid4()),
        project_id=project_id,
        asset_id=asset_id,
        transcript_scope=transcript_scope,
        status="ready",
        language="en",
        raw_text="[Placeholder transcript - run worker with Faster-Whisper for real transcription]",
        cleaned_text="[Placeholder transcript]",
        segments_json=[{"start": 0, "end": 5, "text": "Placeholder segment."}],
        word_timestamps_json=None,
        is_current=True,
    )
    db.add(t)
    await db.flush()

    await db.execute(
        update(ProcessingJob)
        .where(ProcessingJob.id == job_id)
        .values(status="completed", current_message="Transcript ready")
    )
    await db.flush()


def _resolve_upload_path(storage_key: str, filename: str) -> Path:
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    return upload_dir / storage_key / filename


async def _run_local_transcription(job_id: str, project_id: str, asset_id: str, transcript_scope: str = "sermon"):
    """Fallback path: transcribe in-process when Redis/worker is unavailable."""
    from faster_whisper import WhisperModel

    async with async_session() as db:
        try:
            result = await db.execute(
                select(MediaAsset).where(
                    MediaAsset.id == asset_id,
                    MediaAsset.project_id == project_id,
                )
            )
            asset = result.scalar_one_or_none()
            if not asset:
                raise ValueError(f"Media asset {asset_id} not found")

            job = await db.get(ProcessingJob, job_id)
            if not job:
                raise ValueError(f"Transcription job {job_id} not found")

            await set_job_status(
                db,
                job_id,
                "running",
                "Loading Faster-Whisper model...",
                5,
                step_code="load_model",
            )
            await append_job_event(
                db,
                job_id,
                "status",
                "Redis unavailable, running transcription inside the API process.",
                progress_percent=1,
                step_code="fallback_local",
            )
            await append_job_event(
                db,
                job_id,
                "status",
                "Loading Faster-Whisper model...",
                progress_percent=5,
                step_code="load_model",
            )
            await db.flush()
            await db.commit()

            source_path = _resolve_upload_path(asset.storage_key, asset.filename)
            if not source_path.exists():
                raise FileNotFoundError(f"Media file not found: {source_path}")

            def run_transcription() -> dict:
                model = WhisperModel("base", device="cpu", compute_type="int8")
                _record_transcription_event(job_id, "Starting full-sermon transcription...", 10, "transcribe")
                segments, info = model.transcribe(
                    str(source_path),
                    language="en",
                    word_timestamps=True,
                )

                raw_parts: list[str] = []
                segments_list: list[dict] = []
                word_timestamps_list: list[dict] = []

                total_duration = float(getattr(info, "duration", 0.0) or 0.0)
                last_reported = -1
                for seg in segments:
                    raw_parts.append(seg.text)
                    segments_list.append(
                        {
                            "start": seg.start,
                            "end": seg.end,
                            "text": seg.text,
                        }
                    )
                    if seg.words:
                        for word in seg.words:
                            word_timestamps_list.append(
                                {
                                    "word": word.word,
                                    "start": word.start,
                                    "end": word.end,
                                }
                            )
                    if total_duration > 0:
                        progress = min(90, max(10, int((float(seg.end) / total_duration) * 90)))
                        if progress >= last_reported + 5:
                            last_reported = progress
                            _record_transcription_event(
                                job_id,
                                f"Transcribing... {progress}% ({_format_progress_time(float(seg.end))} / {_format_progress_time(total_duration)})",
                                progress,
                                "transcribe",
                            )

                raw_text = " ".join(raw_parts).strip()
                return {
                    "raw_text": raw_text,
                    "cleaned_text": raw_text,
                    "language": info.language or "en",
                    "segments": segments_list,
                    "word_timestamps": word_timestamps_list,
                }

            transcription = await asyncio.to_thread(run_transcription)

            result = await db.execute(
                select(Transcript).where(
                    Transcript.project_id == project_id,
                    Transcript.transcript_scope == transcript_scope,
                )
            )
            for transcript in result.scalars().all():
                transcript.is_current = False

            db.add(
                Transcript(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    asset_id=asset_id,
                    transcript_scope=transcript_scope,
                    status="ready",
                    language=transcription.get("language", "en"),
                    raw_text=transcription["raw_text"],
                    cleaned_text=transcription.get("cleaned_text") or transcription["raw_text"],
                    segments_json=transcription.get("segments"),
                    word_timestamps_json=transcription.get("word_timestamps"),
                    is_current=True,
                )
            )
            await db.flush()
            current_transcript = (
                await db.execute(
                    select(Transcript)
                    .where(
                        Transcript.project_id == project_id,
                        Transcript.asset_id == asset_id,
                        Transcript.transcript_scope == transcript_scope,
                        Transcript.is_current == True,
                    )
                    .order_by(Transcript.created_at.desc())
                    .limit(1)
                )
            ).scalar_one()

            if transcript_scope == "sermon":
                await set_job_status(
                    db,
                    job_id,
                    "running",
                    "Preparing clip analysis artifacts...",
                    92,
                    step_code="prepare_analysis",
                )
                await append_job_event(
                    db,
                    job_id,
                    "status",
                    "Transcript complete. Preparing FastCap analysis artifacts for clip ranking.",
                    progress_percent=92,
                    step_code="prepare_analysis",
                )
                await db.flush()
                await db.commit()

                def analysis_logger(message: str) -> None:
                    _record_transcription_event(job_id, message, None, "prepare_analysis")

                def analysis_progress(message: str, progress_percent: int) -> None:
                    _record_transcription_event(job_id, message, progress_percent, "prepare_analysis")

                await asyncio.to_thread(
                    generate_transcript_analysis_artifacts,
                    project_id=project_id,
                    transcript_id=current_transcript.id,
                    sermon_path=source_path,
                    media_name=asset.filename,
                    duration_seconds=asset.duration_seconds or 0.0,
                    transcript_text=transcription["raw_text"],
                    word_timestamps=transcription.get("word_timestamps"),
                    logger=analysis_logger,
                    progress_callback=analysis_progress,
                )

            await set_job_status(
                db,
                job_id,
                "completed",
                "Transcript ready",
                100,
                step_code="completed",
            )
            await append_job_event(
                db,
                job_id,
                "status",
                "Transcript and clip-analysis bundle are ready." if transcript_scope == "sermon" else "Reel transcript is ready.",
                progress_percent=100,
                step_code="completed",
                payload_json={"transcript_id": str(current_transcript.id)},
            )
            await db.flush()
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.exception("Local transcription fallback failed for job %s", job_id)

            job = await db.get(ProcessingJob, job_id)
            if job:
                await set_job_status(
                    db,
                    job_id,
                    "failed",
                    "Transcription failed",
                    error_text=str(exc),
                    step_code="failed",
                )
                await append_job_event(
                    db,
                    job_id,
                    "error",
                    f"Transcription failed: {exc}",
                    step_code="failed",
                )
                await db.flush()
                await db.commit()


async def _run_artifact_generation(job_id: str, transcript_id: str):
    """Generate transcript-side clip artifacts without rerunning transcription."""
    async with async_session() as db:
        try:
            transcript = await db.get(Transcript, transcript_id)
            if not transcript:
                raise ValueError(f"Transcript {transcript_id} not found")

            asset = await db.get(MediaAsset, transcript.asset_id)
            if not asset:
                raise ValueError(f"Sermon asset {transcript.asset_id} not found")

            source_path = _resolve_upload_path(asset.storage_key, asset.filename)

            await set_job_status(
                db,
                job_id,
                "running",
                "Loading transcript-side FastCap artifacts...",
                5,
                step_code="prepare_analysis",
            )
            await append_job_event(
                db,
                job_id,
                "status",
                "Preparing clip-analysis bundle from the existing transcript.",
                progress_percent=5,
                step_code="prepare_analysis",
                payload_json={"transcript_id": str(transcript.id), "asset_id": str(asset.id)},
            )
            await db.flush()
            await db.commit()

            transcript_text = transcript.raw_text or transcript.cleaned_text or ""
            if not transcript_text.strip():
                raise ValueError("Transcript text is empty, so clip artifacts cannot be generated yet.")

            progress_queue: queue.Queue[tuple[str, int | None]] = queue.Queue()
            result_holder: dict[str, object] = {}
            error_holder: dict[str, Exception] = {}

            def analysis_logger(message: str) -> None:
                progress_queue.put((message, None))

            def analysis_progress(message: str, progress_percent: int) -> None:
                progress_queue.put((message, progress_percent))

            def run_generation() -> None:
                try:
                    result_holder["result"] = generate_transcript_analysis_artifacts(
                        project_id=str(transcript.project_id),
                        transcript_id=str(transcript.id),
                        sermon_path=source_path,
                        media_name=asset.filename,
                        duration_seconds=asset.duration_seconds or 0.0,
                        transcript_text=transcript_text,
                        word_timestamps=transcript.word_timestamps_json,
                        logger=analysis_logger,
                        progress_callback=analysis_progress,
                    )
                except Exception as exc:
                    error_holder["error"] = exc

            worker = threading.Thread(target=run_generation, daemon=True)
            worker.start()

            while worker.is_alive() or not progress_queue.empty():
                drained = False
                while True:
                    try:
                        message, progress_percent = progress_queue.get_nowait()
                    except queue.Empty:
                        break
                    drained = True
                    await set_job_status(
                        db,
                        job_id,
                        "running",
                        message,
                        progress_percent,
                        step_code="prepare_analysis",
                    )
                    await append_job_event(
                        db,
                        job_id,
                        "status",
                        message,
                        progress_percent=progress_percent,
                        step_code="prepare_analysis",
                    )
                    await db.flush()
                    await db.commit()

                if worker.is_alive():
                    await asyncio.sleep(0.1 if drained else 0.2)

            if error_holder.get("error"):
                raise error_holder["error"]

            await set_job_status(
                db,
                job_id,
                "completed",
                "Clip artifacts ready",
                100,
                step_code="completed",
            )
            await append_job_event(
                db,
                job_id,
                "status",
                "Clip-analysis bundle rebuilt from the current transcript.",
                progress_percent=100,
                step_code="completed",
                payload_json={"transcript_id": str(transcript.id)},
            )
            await db.flush()
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.exception("Artifact generation failed for job %s", job_id)

            job = await db.get(ProcessingJob, job_id)
            if job:
                await set_job_status(
                    db,
                    job_id,
                    "failed",
                    "Artifact generation failed",
                    error_text=str(exc),
                    step_code="failed",
                )
                await append_job_event(
                    db,
                    job_id,
                    "error",
                    f"Artifact generation failed: {exc}",
                    step_code="failed",
                )
                await db.flush()
                await db.commit()


def _record_transcription_event(
    job_id: str,
    message: str,
    progress_percent: int | None,
    step_code: str,
) -> None:
    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    def _run_in_new_loop() -> None:
        async def _write():
            async with async_session() as event_db:
                await set_job_status(
                    event_db,
                    job_id,
                    "running",
                    message,
                    progress_percent,
                    step_code=step_code,
                )
                await append_job_event(
                    event_db,
                    job_id,
                    "status",
                    message,
                    progress_percent=progress_percent,
                    step_code=step_code,
                )
                await event_db.flush()
                await event_db.commit()

        asyncio.run(_write())

    if running_loop and running_loop.is_running():
        import threading

        thread = threading.Thread(target=_run_in_new_loop, daemon=True)
        thread.start()
        thread.join()
        return

    _run_in_new_loop()


def _format_progress_time(seconds: float) -> str:
    total = max(0, int(seconds))
    if total >= 3600:
        return f"{total // 3600}:{(total % 3600) // 60:02d}:{total % 60:02d}"
    return f"{total // 60}:{total % 60:02d}"


@router.post("/start", response_model=StartTranscriptionResponse)
async def start_transcription(
    body: StartTranscriptionBody,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Start sermon transcription job."""
    result = await db.execute(select(Project).where(Project.id == body.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    allowed_asset_kind = "sermon_master" if body.transcript_scope == "sermon" else "final_reel"
    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.id == body.sermon_asset_id,
            MediaAsset.asset_kind == allowed_asset_kind,
        )
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Transcript source asset not found")

    job_id = str(uuid.uuid4())
    job = ProcessingJob(
        id=job_id,
        project_id=body.project_id,
        job_type="transcribe_sermon",
        subject_type="media_asset",
        subject_id=body.sermon_asset_id,
        status="queued",
        current_message="Transcription queued",
    )
    db.add(job)
    await db.flush()
    await append_job_event(
        db,
        job_id,
        "status",
        "Transcription queued",
        progress_percent=0,
        step_code="queued",
        payload_json={"asset_id": body.sermon_asset_id},
    )

    if settings.sync_transcript_dev:
        await set_job_status(db, job_id, "running", "Transcribing...", 10, step_code="transcribe")
        await db.flush()
        await _create_placeholder_transcript(
            db,
            job_id,
            body.project_id,
            body.sermon_asset_id,
            transcript_scope=body.transcript_scope,
        )
        await db.commit()
        return StartTranscriptionResponse(
            job_id=job_id,
            status="completed",
            message="Transcript ready (dev mode).",
        )

    # Enqueue for worker
    from app.queue import get_queue

    try:
        queue = await get_queue()
        await queue.enqueue_job("transcribe_sermon", job_id)
        await append_job_event(
            db,
            job_id,
            "status",
            "Queued for worker transcription.",
            progress_percent=1,
            step_code="queued_worker",
        )
        await db.commit()
    except Exception as e:
        logger.warning(
            "Redis unavailable, falling back to local transcription: %s", e
        )
        await db.commit()
        background_tasks.add_task(
            _run_local_transcription,
            job_id,
            body.project_id,
            body.sermon_asset_id,
            body.transcript_scope,
        )
        return StartTranscriptionResponse(
            job_id=job_id,
            status="queued",
            message="Redis unavailable. Running transcription locally.",
        )

    return StartTranscriptionResponse(
        job_id=job_id,
        status="queued",
        message="Transcription queued. Worker will process when available.",
    )


@router.get("/project/{project_id}")
async def get_project_transcript(
    project_id: str,
    scope: str = "sermon",
    db: AsyncSession = Depends(get_db),
):
    """Get the current transcript for a project by scope."""
    result = await db.execute(
        select(Transcript)
        .where(
            Transcript.project_id == project_id,
            Transcript.transcript_scope == scope,
            Transcript.is_current == True,
        )
        .order_by(Transcript.created_at.desc())
        .limit(1)
    )
    t = result.scalar_one_or_none()
    if not t:
        return None
    return {
        "id": t.id,
        "project_id": t.project_id,
        "asset_id": t.asset_id,
        "status": t.status,
        "raw_text": t.raw_text,
        "cleaned_text": t.cleaned_text,
        "segments": t.segments_json,
        "word_timestamps": t.word_timestamps_json,
        "approved_at": t.approved_at.isoformat() if t.approved_at else None,
        "created_at": t.created_at.isoformat(),
    }


@router.post("/{transcript_id}/approve")
async def approve_transcript(
    transcript_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Mark transcript as approved."""
    from datetime import datetime, timezone

    result = await db.execute(select(Transcript).where(Transcript.id == transcript_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Transcript not found")
    t.approved_at = datetime.now(timezone.utc)
    t.status = "approved"
    await db.flush()
    return {"status": "approved"}


@router.post("/{transcript_id}/artifacts", response_model=StartArtifactGenerationResponse)
async def generate_transcript_artifacts(
    transcript_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Rebuild transcript-side clip artifacts from an existing transcript."""
    result = await db.execute(select(Transcript).where(Transcript.id == transcript_id))
    transcript = result.scalar_one_or_none()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.id == transcript.asset_id,
            MediaAsset.project_id == transcript.project_id,
        )
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Sermon master not found for this transcript")

    job_id = str(uuid.uuid4())
    job = ProcessingJob(
        id=job_id,
        project_id=str(transcript.project_id),
        job_type="prepare_clip_artifacts",
        subject_type="transcript",
        subject_id=str(transcript.id),
        status="queued",
        current_message="Artifact generation queued",
    )
    db.add(job)
    await db.flush()
    await append_job_event(
        db,
        job_id,
        "status",
        "Artifact generation queued",
        progress_percent=0,
        step_code="queued",
        payload_json={"transcript_id": str(transcript.id), "asset_id": str(asset.id)},
    )
    await db.commit()

    background_tasks.add_task(_run_artifact_generation, job_id, str(transcript.id))

    return StartArtifactGenerationResponse(
        job_id=job_id,
        status="queued",
        message="Artifact generation queued. Preparing clip-analysis bundle from the existing transcript.",
    )


@router.get("/{transcript_id}/artifacts/status")
async def get_transcript_artifact_status(
    transcript_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return readiness details for transcript-side clip artifacts."""
    result = await db.execute(select(Transcript).where(Transcript.id == transcript_id))
    transcript = result.scalar_one_or_none()
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")

    status = get_analysis_artifact_status(str(transcript.project_id), str(transcript.id))
    return {
        "transcript_id": str(transcript.id),
        "project_id": str(transcript.project_id),
        **status,
    }
