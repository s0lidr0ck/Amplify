"""Upload routes - signed URLs for future S3 uploads."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import MediaAsset, Project

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


class RequestUploadBody(BaseModel):
    project_id: str
    filename: str
    content_type: str
    file_size_bytes: int


class RequestUploadResponse(BaseModel):
    upload_url: str
    asset_id: str
    storage_key: str


@router.post("/request", response_model=RequestUploadResponse)
async def request_upload(
    body: RequestUploadBody,
    db: AsyncSession = Depends(get_db),
):
    """
    Request a signed URL for direct upload to object storage.
    Client uploads via PUT to the returned URL, then calls confirm_upload.
    """
    # Verify project exists
    result = await db.execute(select(Project).where(Project.id == body.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    asset_id = str(uuid.uuid4())
    storage_key = f"projects/{body.project_id}/source/{asset_id}"

    # For MVP without S3 configured, return a placeholder URL
    # In production, generate presigned PUT URL via boto3
    upload_url = f"/api/uploads/placeholder/{asset_id}"

    asset = MediaAsset(
        id=asset_id,
        project_id=body.project_id,
        asset_kind="source_video",
        source_type="upload",
        storage_key=storage_key,
        mime_type=body.content_type,
        filename=body.filename,
        status="pending",
    )
    db.add(asset)
    await db.flush()

    return RequestUploadResponse(
        upload_url=upload_url,
        asset_id=asset_id,
        storage_key=storage_key,
    )
