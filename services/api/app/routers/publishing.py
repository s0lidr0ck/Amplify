"""Publishing routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.lib.wix_blog import WixPublishError, publish_wix_blog_post, upload_wix_media_bytes
from app.models import Project

router = APIRouter(prefix="/api/publishing", tags=["publishing"])


class WixConfigRead(BaseModel):
    configured: bool
    api_base: str
    site_id: str
    default_writer_member_id: str


class WixImageUploadResponse(BaseModel):
    id: str
    url: str
    altText: str
    filename: str


class WixBlogPublishRequest(BaseModel):
    blog_title: str
    blog_markdown: str
    featured_image_source: str | None = None
    featured_image_id: str | None = None
    featured_image_url: str | None = None
    publish_date: str | None = None
    writer_member_id: str | None = None
    excerpt: str
    title_tag: str
    meta_description: str
    og_title: str
    og_description: str


@router.get("/wix/config", response_model=WixConfigRead)
async def get_wix_config():
    return WixConfigRead(
        configured=bool(settings.wix_api_base.strip() and settings.wix_bearer_token.strip() and settings.wix_site_id.strip()),
        api_base=settings.wix_api_base,
        site_id=settings.wix_site_id,
        default_writer_member_id=settings.wix_blog_member_id,
    )


@router.post("/projects/{project_id}/wix-image", response_model=WixImageUploadResponse)
async def upload_project_image_to_wix(
    project_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    filename = file.filename or "featured-image"
    try:
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Image upload was empty")
        return await upload_wix_media_bytes(
            image_bytes=image_bytes,
            filename=filename,
            alt_text=project.title,
        )
    except WixPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/wix-blog")
async def publish_project_to_wix_blog(
    project_id: str,
    body: WixBlogPublishRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        return await publish_wix_blog_post(
            project_title=project.title,
            blog_title=body.blog_title,
            blog_markdown=body.blog_markdown,
            featured_image_source=(body.featured_image_source or body.featured_image_url or "").strip() or None,
            featured_image_id=(body.featured_image_id or "").strip() or None,
            publish_date=body.publish_date,
            writer_member_id=(body.writer_member_id or settings.wix_blog_member_id).strip(),
            excerpt=body.excerpt,
            title_tag=body.title_tag,
            meta_description=body.meta_description,
            og_title=body.og_title,
            og_description=body.og_description,
        )
    except WixPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
