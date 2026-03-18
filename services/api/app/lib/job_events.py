"""Shared helpers for processing job status updates and event logging."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProcessingJob, ProcessingJobEvent


async def next_event_sequence(db: AsyncSession, job_id: str) -> int:
    result = await db.execute(
        select(ProcessingJobEvent.sequence_no)
        .where(ProcessingJobEvent.processing_job_id == job_id)
        .order_by(ProcessingJobEvent.sequence_no.desc())
        .limit(1)
    )
    current = result.scalar_one_or_none()
    pending = [
        int(event.sequence_no)
        for event in db.new
        if isinstance(event, ProcessingJobEvent) and str(event.processing_job_id) == str(job_id)
    ]
    max_pending = max(pending) if pending else 0
    return max(int(current or 0), max_pending) + 1


async def append_job_event(
    db: AsyncSession,
    job_id: str,
    event_type: str,
    message: str,
    progress_percent: int | None = None,
    step_code: str | None = None,
    payload_json: dict | None = None,
):
    db.add(
        ProcessingJobEvent(
            id=str(uuid.uuid4()),
            processing_job_id=job_id,
            sequence_no=await next_event_sequence(db, job_id),
            event_type=event_type,
            step_code=step_code,
            level="info" if event_type != "error" else "error",
            message=message[:500],
            progress_percent=progress_percent,
            payload_json=payload_json,
        )
    )


async def set_job_status(
    db: AsyncSession,
    job_id: str,
    status: str,
    message: str,
    progress_percent: int | None = None,
    error_text: str | None = None,
    step_code: str | None = None,
):
    job = await db.get(ProcessingJob, job_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")
    job.status = status
    job.current_message = message
    job.current_step = step_code
    job.progress_percent = progress_percent
    job.error_text = error_text
    if status == "running" and not job.started_at:
        job.started_at = datetime.now(timezone.utc)
    if status in ("completed", "failed"):
        job.completed_at = datetime.now(timezone.utc)
