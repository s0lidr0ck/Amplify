"""Job routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
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
