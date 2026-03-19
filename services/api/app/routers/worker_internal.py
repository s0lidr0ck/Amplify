"""Internal API for worker to update jobs and create transcripts."""

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.lib.job_events import append_job_event, set_job_status
from app.lib.transcript_analysis import generate_transcript_analysis_artifacts
from app.models import MediaAsset, ProcessingJob, Transcript, TrimOperation

router = APIRouter(prefix="/api/internal", tags=["internal"])

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _resolve_upload_path(storage_key: str, filename: str) -> Path:
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    return upload_dir / storage_key / filename


class JobUpdateBody(BaseModel):
    status: str
    progress_percent: int | None = None
    current_step: str | None = None
    current_message: str | None = None
    error_text: str | None = None
    error_code: str | None = None


class CreateTranscriptBody(BaseModel):
    job_id: str
    project_id: str
    asset_id: str
    transcript_scope: str = "sermon"
    raw_text: str
    cleaned_text: str | None = None
    segments: list[dict] | None = None
    word_timestamps: list[dict] | None = None
    language: str = "en"


@router.post("/jobs/{job_id}/update")
async def update_job(
    job_id: str,
    body: JobUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    """Worker updates job status."""
    result = await db.execute(select(ProcessingJob).where(ProcessingJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status == "cancelled" and body.status != "cancelled":
        return {"ok": True, "ignored": True}
    await set_job_status(
        db,
        job_id,
        body.status,
        body.current_message or job.current_message or body.status,
        body.progress_percent,
        error_text=body.error_text,
        step_code=body.current_step,
    )
    job.error_code = body.error_code
    if body.current_message:
        await append_job_event(
            db,
            job_id,
            "error" if body.status == "failed" else "status",
            body.current_message,
            progress_percent=body.progress_percent,
            step_code=body.current_step,
        )
    await db.flush()
    return {"ok": True}


@router.post("/transcript")
async def create_transcript(
    body: CreateTranscriptBody,
    db: AsyncSession = Depends(get_db),
):
    """Worker creates transcript after transcription completes."""
    result = await db.execute(select(ProcessingJob).where(ProcessingJob.id == body.job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status == "cancelled":
        return {"transcript_id": None, "ignored": True}

    # Persist the transcript first so prep-step failures do not roll back completed transcription.
    await db.execute(
        update(Transcript)
        .where(Transcript.project_id == body.project_id, Transcript.transcript_scope == body.transcript_scope)
        .values(is_current=False)
    )

    t = Transcript(
        id=str(uuid.uuid4()),
        project_id=body.project_id,
        asset_id=body.asset_id,
        transcript_scope=body.transcript_scope,
        status="ready",
        language=body.language,
        raw_text=body.raw_text,
        cleaned_text=body.cleaned_text or body.raw_text,
        segments_json=body.segments,
        word_timestamps_json=body.word_timestamps,
        is_current=True,
    )
    db.add(t)
    await db.flush()
    transcript_id = str(t.id)
    await db.commit()

    analysis_error: str | None = None
    asset_result = await db.execute(select(MediaAsset).where(MediaAsset.id == body.asset_id))
    asset = asset_result.scalar_one_or_none()
    if asset and body.transcript_scope == "sermon":
        sermon_path = _resolve_upload_path(asset.storage_key, asset.filename)
        try:
            await set_job_status(
                db,
                body.job_id,
                "running",
                "Preparing clip analysis artifacts...",
                92,
                step_code="prepare_analysis",
            )
            await append_job_event(
                db,
                body.job_id,
                "status",
                "Transcript created. Generating FastCap analysis bundle.",
                progress_percent=92,
                step_code="prepare_analysis",
                payload_json={"transcript_id": transcript_id},
            )
            await db.commit()

            def analysis_logger(message: str) -> None:
                asyncio.run(
                    _append_internal_event(
                        body.job_id,
                        "status",
                        message,
                        step_code="prepare_analysis",
                    )
                )

            def analysis_progress(message: str, progress_percent: int) -> None:
                asyncio.run(
                    _append_internal_event(
                        body.job_id,
                        "status",
                        message,
                        progress_percent=progress_percent,
                        step_code="prepare_analysis",
                        update_status=True,
                    )
                )

            if not sermon_path.exists():
                await append_job_event(
                    db,
                    body.job_id,
                    "status",
                    "Sermon media file is not available locally. Building transcript-only analysis artifacts.",
                    progress_percent=93,
                    step_code="prepare_analysis",
                )
                await db.commit()

            await asyncio.to_thread(
                generate_transcript_analysis_artifacts,
                project_id=body.project_id,
                transcript_id=transcript_id,
                sermon_path=sermon_path,
                media_name=asset.filename,
                duration_seconds=asset.duration_seconds or 0.0,
                transcript_text=body.raw_text,
                word_timestamps=body.word_timestamps,
                logger=analysis_logger,
                progress_callback=analysis_progress,
            )
        except Exception as exc:
            analysis_error = str(exc)
            await db.rollback()
            await append_job_event(
                db,
                body.job_id,
                "error",
                f"Clip-analysis artifact prep failed, but transcript was saved: {exc}",
                progress_percent=92,
                step_code="prepare_analysis_failed",
            )
            await db.commit()

    await set_job_status(
        db,
        body.job_id,
        "completed",
        "Transcript ready",
        100,
        step_code="completed",
    )
    await append_job_event(
        db,
        body.job_id,
        "status",
        (
            "Transcript is ready."
            if body.transcript_scope != "sermon"
            else "Transcript is ready." if not analysis_error else "Transcript is ready, but clip-analysis artifacts need attention."
        ),
        progress_percent=100,
        step_code="completed",
        payload_json={
            "transcript_id": transcript_id,
            "analysis_error": analysis_error,
        },
    )
    await db.commit()

    return {"transcript_id": transcript_id}


async def _append_internal_event(
    job_id: str,
    event_type: str,
    message: str,
    progress_percent: int | None = None,
    step_code: str | None = None,
    update_status: bool = False,
) -> None:
    from app.db import async_session

    async with async_session() as event_db:
        if update_status:
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
            event_type,
            message,
            progress_percent=progress_percent,
            step_code=step_code,
        )
        await event_db.flush()
        await event_db.commit()


class TrimCompleteBody(BaseModel):
    job_id: str
    trim_op_id: str
    output_filename: str
    duration_seconds: float | None = None


class YoutubeImportCompleteBody(BaseModel):
    job_id: str
    asset_id: str
    filename: str
    mime_type: str = "video/mp4"
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None


@router.post("/trim-complete")
async def trim_complete(
    body: TrimCompleteBody,
    db: AsyncSession = Depends(get_db),
):
    """Worker reports trim completed; creates sermon_master asset and marks job done."""
    result = await db.execute(select(ProcessingJob).where(ProcessingJob.id == body.job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    result = await db.execute(select(TrimOperation).where(TrimOperation.id == body.trim_op_id))
    trim_op = result.scalar_one_or_none()
    if not trim_op or trim_op.project_id != job.project_id:
        raise HTTPException(status_code=404, detail="Trim operation not found")

    result = await db.execute(select(MediaAsset).where(MediaAsset.id == trim_op.source_asset_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source asset not found")

    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    storage_key = f"projects/{job.project_id}/sermon/{body.job_id}"
    file_path = upload_dir / storage_key / body.output_filename
    if not file_path.exists():
        raise HTTPException(status_code=400, detail=f"Output file not found: {file_path}")

    sermon_id = str(uuid.uuid4())
    sermon = MediaAsset(
        id=sermon_id,
        project_id=job.project_id,
        asset_kind="sermon_master",
        source_type=source.source_type,
        storage_key=storage_key,
        mime_type=source.mime_type,
        filename=body.output_filename,
        duration_seconds=body.duration_seconds,
        width=source.width,
        height=source.height,
        status="ready",
        parent_asset_id=source.id,
    )
    db.add(sermon)
    await db.flush()

    trim_op.output_asset_id = sermon_id
    trim_op.status = "ready"
    job.status = "completed"
    job.completed_at = datetime.now(timezone.utc)
    job.current_message = "Sermon master ready"
    await db.flush()

    return {"asset_id": sermon_id}


@router.post("/youtube-import-complete")
async def youtube_import_complete(
    body: YoutubeImportCompleteBody,
    db: AsyncSession = Depends(get_db),
):
    """Worker reports YouTube source import completed; marks source asset ready."""
    job = await db.get(ProcessingJob, body.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    asset = await db.get(MediaAsset, body.asset_id)
    if not asset or asset.project_id != job.project_id:
        raise HTTPException(status_code=404, detail="Source asset not found")

    asset.filename = body.filename
    asset.mime_type = body.mime_type
    asset.duration_seconds = body.duration_seconds
    asset.width = body.width
    asset.height = body.height
    asset.status = "ready"

    await set_job_status(
        db,
        body.job_id,
        "completed",
        "YouTube source ready",
        100,
        step_code="completed",
    )
    await append_job_event(
        db,
        body.job_id,
        "status",
        "YouTube source import completed",
        progress_percent=100,
        step_code="completed",
        payload_json={"asset_id": body.asset_id, "filename": body.filename},
    )
    await db.flush()
    return {"asset_id": asset.id}
