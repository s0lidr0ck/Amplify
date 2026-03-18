"""Project routes."""

import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import (
    ClipAnalysisRun,
    ClipCandidate,
    MediaAsset,
    Organization,
    ProcessingJob,
    ProcessingJobEvent,
    Project,
    Transcript,
    TrimOperation,
)
from app.schemas import ProjectCreate, ProjectRead

router = APIRouter(prefix="/api/projects", tags=["projects"])

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"


@router.post("", response_model=ProjectRead)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new sermon project."""
    # Ensure default org exists
    org_result = await db.execute(select(Organization).where(Organization.id == DEFAULT_ORG_ID))
    if not org_result.scalar_one_or_none():
        db.add(Organization(id=DEFAULT_ORG_ID, name="Default", slug="default"))
        await db.flush()

    project = Project(
        id=str(uuid.uuid4()),
        organization_id=DEFAULT_ORG_ID,
        title=body.title,
        speaker=body.speaker,
        sermon_date=body.sermon_date,
        status="draft",
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return project


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    """List projects for the organization."""
    result = await db.execute(
        select(Project)
        .where(Project.organization_id == DEFAULT_ORG_ID)
        .order_by(Project.sermon_date.desc(), Project.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("/{project_id}/upload")
async def upload_source(
    project_id: str,
    file: UploadFile = File(...),
    asset_kind: str = Form("source_video"),
    db: AsyncSession = Depends(get_db),
):
    """Direct multipart upload for source video (local dev)."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    content_type = file.content_type or "video/mp4"
    asset_id = str(uuid.uuid4())
    asset_folder = {
        "source_video": "source",
        "sermon_master": "sermon",
        "final_reel": "reel",
    }.get(asset_kind, asset_kind)
    storage_key = f"projects/{project_id}/{asset_folder}/{asset_id}"
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    dest_dir = upload_dir / storage_key
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / file.filename
    with open(dest_path, "wb") as f:
        while chunk := await file.read(8192):
            f.write(chunk)

    if asset_kind == "final_reel":
        existing_assets = (
            await db.execute(
                select(MediaAsset).where(
                    MediaAsset.project_id == project_id,
                    MediaAsset.asset_kind == "final_reel",
                )
            )
        ).scalars().all()
        for existing_asset in existing_assets:
            existing_asset.status = "replaced"

        existing_reel_transcripts = (
            await db.execute(
                select(Transcript).where(
                    Transcript.project_id == project_id,
                    Transcript.transcript_scope == "reel",
                    Transcript.is_current == True,
                )
            )
        ).scalars().all()
        for existing_transcript in existing_reel_transcripts:
            existing_transcript.is_current = False
            if existing_transcript.status == "ready":
                existing_transcript.status = "replaced"

    asset = MediaAsset(
        id=asset_id,
        project_id=project_id,
        asset_kind=asset_kind,
        source_type="upload",
        storage_key=storage_key,
        mime_type=content_type,
        filename=file.filename,
        status="ready",
    )
    db.add(asset)
    await db.flush()
    return {"asset_id": asset_id, "filename": file.filename}


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a project by ID."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a project and its related records/files."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    job_ids = (
        select(ProcessingJob.id)
        .where(ProcessingJob.project_id == project_id)
        .scalar_subquery()
    )

    await db.execute(delete(ProcessingJobEvent).where(ProcessingJobEvent.processing_job_id.in_(job_ids)))
    await db.execute(delete(ProcessingJob).where(ProcessingJob.project_id == project_id))
    await db.execute(delete(ClipCandidate).where(ClipCandidate.project_id == project_id))
    await db.execute(delete(ClipAnalysisRun).where(ClipAnalysisRun.project_id == project_id))
    await db.execute(delete(Transcript).where(Transcript.project_id == project_id))
    await db.execute(delete(TrimOperation).where(TrimOperation.project_id == project_id))
    await db.execute(delete(MediaAsset).where(MediaAsset.project_id == project_id))
    await db.execute(delete(Project).where(Project.id == project_id))
    await db.flush()

    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    project_dir = upload_dir / "projects" / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir, ignore_errors=True)

    return Response(status_code=204)


@router.get("/{project_id}/sermon-asset", response_model=Optional[dict])
async def get_sermon_asset(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the sermon master media asset for a project."""
    result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.project_id == project_id, MediaAsset.asset_kind == "sermon_master")
        .order_by(MediaAsset.created_at.desc())
        .limit(1)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        return None
    return {
        "id": asset.id,
        "project_id": asset.project_id,
        "asset_kind": asset.asset_kind,
        "filename": asset.filename,
        "duration_seconds": asset.duration_seconds,
        "status": asset.status,
        "storage_key": asset.storage_key,
    }


@router.get("/{project_id}/source-asset", response_model=Optional[dict])
async def get_source_asset(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the source media asset for a project."""
    result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.project_id == project_id, MediaAsset.asset_kind == "source_video")
        .order_by(MediaAsset.created_at.desc())
        .limit(1)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        return None
    playback_url = f"{settings.api_url}/api/media/asset/{asset.id}"
    return {
        "id": asset.id,
        "project_id": asset.project_id,
        "asset_kind": asset.asset_kind,
        "filename": asset.filename,
        "duration_seconds": asset.duration_seconds,
        "status": asset.status,
        "storage_key": asset.storage_key,
        "playback_url": playback_url,
    }


@router.get("/{project_id}/reel-asset", response_model=Optional[dict])
async def get_reel_asset(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the uploaded final reel asset for a project."""
    result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.project_id == project_id, MediaAsset.asset_kind == "final_reel")
        .order_by(MediaAsset.created_at.desc())
        .limit(1)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        return None
    playback_url = f"{settings.api_url}/api/media/asset/{asset.id}"
    return {
        "id": asset.id,
        "project_id": asset.project_id,
        "asset_kind": asset.asset_kind,
        "filename": asset.filename,
        "duration_seconds": asset.duration_seconds,
        "status": asset.status,
        "storage_key": asset.storage_key,
        "playback_url": playback_url,
    }
