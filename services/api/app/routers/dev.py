"""Dev-only routes for seeding data."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.auth_deps import ApprovedUser
from app.lib.scoped_route import ScopedRoute, require_body_project
from app.db import get_db
from app.models import MediaAsset, Project

router = APIRouter(prefix="/api/dev", tags=["dev"], route_class=ScopedRoute)


class SeedSourceBody(BaseModel):
    project_id: str
    filename: str = "sample-sermon.mp4"
    duration_seconds: float = 600


@router.post("/seed-source")
async def seed_source(
    body: SeedSourceBody,
    user: ApprovedUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a placeholder source asset for testing (dev only)."""
    # 404 if it is not this church's project, indistinguishable from one
    # that does not exist.
    await require_body_project(db, body.project_id, user)

    asset = MediaAsset(
        id=str(uuid.uuid4()),
        project_id=body.project_id,
        asset_kind="source_video",
        source_type="upload",
        storage_key=f"projects/{body.project_id}/source/{uuid.uuid4()}",
        mime_type="video/mp4",
        filename=body.filename,
        duration_seconds=body.duration_seconds,
        status="ready",
    )
    db.add(asset)
    await db.flush()
    return {"asset_id": asset.id, "filename": asset.filename}
