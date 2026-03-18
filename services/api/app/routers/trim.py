"""Trim routes - sermon trim operations."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import MediaAsset, ProcessingJob, Project, TrimOperation

router = APIRouter(prefix="/api/trim", tags=["trim"])


class TrimRequestBody(BaseModel):
    project_id: str
    source_asset_id: str
    start_seconds: float
    end_seconds: float
    use_full_file: bool = False


class TrimResponse(BaseModel):
    job_id: str
    status: str
    message: str


@router.post("/start", response_model=TrimResponse)
async def start_trim(
    body: TrimRequestBody,
    db: AsyncSession = Depends(get_db),
):
    """
    Start a sermon trim job.
    Creates a processing job; worker will run FFmpeg to produce sermon master.
    In dev (no worker): creates placeholder sermon_master asset.
    """
    from app.config import settings

    result = await db.execute(select(Project).where(Project.id == body.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(select(MediaAsset).where(MediaAsset.id == body.source_asset_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source asset not found")

    job_id = str(uuid.uuid4())
    job = ProcessingJob(
        id=job_id,
        project_id=body.project_id,
        job_type="trim_sermon",
        subject_type="media_asset",
        subject_id=body.source_asset_id,
        status="queued",
        current_message="Trim job queued",
    )
    db.add(job)

    trim_op_id = str(uuid.uuid4())
    trim_op = TrimOperation(
        id=trim_op_id,
        project_id=body.project_id,
        source_asset_id=body.source_asset_id,
        start_seconds=body.start_seconds,
        end_seconds=body.end_seconds,
        status="pending",
    )
    db.add(trim_op)
    await db.flush()

    # Dev mode: create placeholder sermon_master so transcript flow works without worker
    if settings.sync_transcript_dev or settings.sync_trim_dev:
        duration = (body.end_seconds - body.start_seconds) if not body.use_full_file else (source.duration_seconds or 60)
        sermon = MediaAsset(
            id=str(uuid.uuid4()),
            project_id=body.project_id,
            asset_kind="sermon_master",
            source_type=source.source_type,
            storage_key=f"projects/{body.project_id}/sermon/{job_id}",
            mime_type=source.mime_type,
            filename=f"sermon_{source.filename}",
            duration_seconds=duration,
            width=source.width,
            height=source.height,
            status="ready",
            parent_asset_id=source.id,
        )
        db.add(sermon)
        trim_op.output_asset_id = sermon.id
        trim_op.status = "ready"
        job.status = "completed"
        job.current_message = "Sermon master ready"
        await db.flush()
        return TrimResponse(
            job_id=job_id,
            status="completed",
            message="Sermon master ready (dev mode).",
        )

    # Enqueue for worker
    from app.queue import get_queue

    try:
        queue = await get_queue()
        await queue.enqueue_job("trim_sermon", job_id, trim_op_id)
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning("Redis unavailable, creating placeholder sermon master: %s", e)
        # Fallback: create placeholder when Redis/worker unavailable (no Docker phase)
        duration = (body.end_seconds - body.start_seconds) if not body.use_full_file else (source.duration_seconds or 60)
        sermon = MediaAsset(
            id=str(uuid.uuid4()),
            project_id=body.project_id,
            asset_kind="sermon_master",
            source_type=source.source_type,
            storage_key=f"projects/{body.project_id}/sermon/{job_id}",
            mime_type=source.mime_type,
            filename=f"sermon_{source.filename}",
            duration_seconds=duration,
            width=source.width,
            height=source.height,
            status="ready",
            parent_asset_id=source.id,
        )
        db.add(sermon)
        trim_op.output_asset_id = sermon.id
        trim_op.status = "ready"
        job.status = "completed"
        job.current_message = "Sermon master ready (Redis unavailable, placeholder created)"
        await db.flush()
        return TrimResponse(
            job_id=job_id,
            status="completed",
            message="Sermon master ready (Redis unavailable, placeholder created).",
        )

    return TrimResponse(
        job_id=job_id,
        status="queued",
        message="Trim job queued. Worker will process when available.",
    )
