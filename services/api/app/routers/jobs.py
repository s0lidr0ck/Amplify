"""Job routes."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.lib.job_events import append_job_event
from app.models import ProcessingJob, ProcessingJobEvent
from app.schemas import ProcessingJobRead

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=ProcessingJobRead)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get job status."""
    result = await db.execute(select(ProcessingJob).where(ProcessingJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/project/{project_id}", response_model=list[ProcessingJobRead])
async def list_project_jobs(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = None,
    limit: int = 20,
):
    """List jobs for a project."""
    q = select(ProcessingJob).where(ProcessingJob.project_id == project_id)
    if status:
        q = q.where(ProcessingJob.status == status)
    q = q.order_by(ProcessingJob.created_at.desc()).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/{job_id}/events")
async def get_job_events(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    after_sequence: Optional[int] = None,
):
    """Get events for a job (for polling/SSE)."""
    q = select(ProcessingJobEvent).where(ProcessingJobEvent.processing_job_id == job_id)
    if after_sequence is not None:
        q = q.where(ProcessingJobEvent.sequence_no > after_sequence)
    q = q.order_by(ProcessingJobEvent.sequence_no)
    result = await db.execute(q)
    events = result.scalars().all()
    return [
        {
            "id": e.id,
            "sequence_no": e.sequence_no,
            "event_type": e.event_type,
            "message": e.message,
            "progress_percent": e.progress_percent,
            "payload": e.payload_json,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]


@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Cancel a queued or running job."""
    result = await db.execute(select(ProcessingJob).where(ProcessingJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status in ("completed", "failed", "cancelled"):
        return {"ok": True, "status": job.status}

    job.status = "cancelled"
    job.current_message = "Cancelled by user"
    job.current_step = "cancelled"
    job.error_text = "Job cancelled by user."
    job.completed_at = datetime.now(timezone.utc)
    await append_job_event(
        db,
        job_id,
        "error",
        "Job cancelled by user.",
        progress_percent=job.progress_percent,
        step_code="cancelled",
    )
    await db.flush()
    return {"ok": True, "status": "cancelled"}
