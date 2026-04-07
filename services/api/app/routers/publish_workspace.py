"""Publishing Workspace routes — bundles, variants, and calendar."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Project, ProjectContentDraft, PublishBundle, PublishVariant
from app.routers.projects import DEFAULT_ORG_ID
from app.schemas import (
    CalendarBundleRead,
    PublishBundleCreate,
    PublishBundleRead,
    PublishBundleUpdate,
    PublishVariantRead,
    PublishVariantUpsert,
)

router = APIRouter(prefix="/api/publish", tags=["publish_workspace"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _week_bounds(week_date: date) -> tuple[date, date]:
    """Return the Monday and Sunday of the ISO week containing *week_date*."""
    monday = week_date - timedelta(days=week_date.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


async def _get_bundle_or_404(bundle_id: str, db: AsyncSession) -> PublishBundle:
    bundle = await db.get(PublishBundle, bundle_id)
    if not bundle or bundle.organization_id != DEFAULT_ORG_ID:
        raise HTTPException(status_code=404, detail="Publish bundle not found")
    return bundle


# ---------------------------------------------------------------------------
# Bundle CRUD
# ---------------------------------------------------------------------------

@router.post("/bundles", response_model=PublishBundleRead, status_code=201)
async def create_bundle(
    body: PublishBundleCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new publish bundle."""
    bundle = PublishBundle(
        id=str(uuid.uuid4()),
        project_id=body.project_id,
        organization_id=body.organization_id,
        bundle_type=body.bundle_type,
        label=body.label,
        thumbnail_asset_id=body.thumbnail_asset_id,
        status=body.status,
        week_date=body.week_date,
        notes=body.notes,
    )
    db.add(bundle)
    await db.flush()
    await db.refresh(bundle)
    return bundle


@router.get("/bundles", response_model=list[PublishBundleRead])
async def list_bundles_for_week(
    week: date,
    db: AsyncSession = Depends(get_db),
):
    """List all publish bundles whose week_date falls within the Mon-Sun week of *week*."""
    monday, sunday = _week_bounds(week)
    result = await db.execute(
        select(PublishBundle).where(
            and_(
                PublishBundle.organization_id == DEFAULT_ORG_ID,
                PublishBundle.week_date >= monday,
                PublishBundle.week_date <= sunday,
            )
        ).order_by(PublishBundle.week_date.asc(), PublishBundle.created_at.asc())
    )
    return list(result.scalars().all())


@router.get("/bundles/{bundle_id}", response_model=PublishBundleRead)
async def get_bundle(
    bundle_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single publish bundle (with its variants)."""
    return await _get_bundle_or_404(bundle_id, db)


@router.patch("/bundles/{bundle_id}", response_model=PublishBundleRead)
async def update_bundle(
    bundle_id: str,
    body: PublishBundleUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Partially update a publish bundle."""
    bundle = await _get_bundle_or_404(bundle_id, db)

    if body.label is not None:
        bundle.label = body.label
    if body.thumbnail_asset_id is not None:
        bundle.thumbnail_asset_id = body.thumbnail_asset_id
    if body.status is not None:
        bundle.status = body.status
    if body.notes is not None:
        bundle.notes = body.notes
    if body.week_date is not None:
        bundle.week_date = body.week_date

    await db.flush()
    await db.refresh(bundle)
    return bundle


@router.delete("/bundles/{bundle_id}", status_code=204)
async def delete_bundle(
    bundle_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a publish bundle and all its variants (cascade)."""
    bundle = await _get_bundle_or_404(bundle_id, db)
    await db.delete(bundle)
    await db.flush()


# ---------------------------------------------------------------------------
# Variant upsert
# ---------------------------------------------------------------------------

@router.put("/bundles/{bundle_id}/variants/{platform}", response_model=PublishVariantRead)
async def upsert_variant(
    bundle_id: str,
    platform: str,
    body: PublishVariantUpsert,
    db: AsyncSession = Depends(get_db),
):
    """Insert or update a variant for a given bundle + platform combination."""
    # Ensure the bundle exists and belongs to this org
    await _get_bundle_or_404(bundle_id, db)

    result = await db.execute(
        select(PublishVariant).where(
            and_(
                PublishVariant.bundle_id == bundle_id,
                PublishVariant.platform == platform,
            )
        )
    )
    variant = result.scalar_one_or_none()

    if variant is None:
        variant = PublishVariant(
            id=str(uuid.uuid4()),
            bundle_id=bundle_id,
            platform=platform,
        )
        db.add(variant)

    variant.title = body.title
    variant.description = body.description
    variant.tags = body.tags
    variant.hashtags = body.hashtags
    variant.extra_json = body.extra_json
    variant.media_asset_id = body.media_asset_id
    variant.scheduled_at = body.scheduled_at
    variant.published_at = body.published_at
    variant.publish_status = body.publish_status
    variant.ai_generated = body.ai_generated

    await db.flush()
    await db.refresh(variant)
    return variant


# ---------------------------------------------------------------------------
# Publish stub
# ---------------------------------------------------------------------------

@router.post("/bundles/{bundle_id}/variants/{platform}/publish", response_model=PublishVariantRead)
async def publish_variant(
    bundle_id: str,
    platform: str,
    db: AsyncSession = Depends(get_db),
):
    """Stub: mark a variant as published (real platform posting TBD)."""
    await _get_bundle_or_404(bundle_id, db)

    result = await db.execute(
        select(PublishVariant).where(
            and_(
                PublishVariant.bundle_id == bundle_id,
                PublishVariant.platform == platform,
            )
        )
    )
    variant = result.scalar_one_or_none()
    if variant is None:
        raise HTTPException(status_code=404, detail=f"Variant for platform '{platform}' not found on this bundle")

    variant.publish_status = "published"
    variant.published_at = datetime.now(tz=timezone.utc)

    await db.flush()
    await db.refresh(variant)
    return variant


# ---------------------------------------------------------------------------
# AI harvest: create bundle from project drafts
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/create-bundle", response_model=PublishBundleRead, status_code=201)
async def create_bundle_from_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    AI harvest: read existing project content drafts and auto-populate a
    publish bundle with platform-specific variants.

    Draft kinds read:
      - packaging  → YouTube (title, description)
      - reel       → Instagram, TikTok, Facebook (platforms.instagram / .tiktok / .facebook)
      - facebook   → Facebook variant text (post field → description)
      - blog       → Wix Blog variant
      - metadata   → tags for YouTube (metadata.tags or keywords list)
    """
    # Verify project exists
    project = await db.get(Project, project_id)
    if not project or project.organization_id != DEFAULT_ORG_ID:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load all drafts for this project
    result = await db.execute(
        select(ProjectContentDraft).where(ProjectContentDraft.project_id == project_id)
    )
    drafts = result.scalars().all()
    drafts_by_kind: dict[str, dict] = {d.draft_kind: d.payload_json for d in drafts}

    # Create the bundle
    week_date: date = project.sermon_date
    bundle = PublishBundle(
        id=str(uuid.uuid4()),
        project_id=project_id,
        organization_id=DEFAULT_ORG_ID,
        bundle_type="sermon_full",
        label=project.title,
        status="draft",
        week_date=week_date,
    )
    db.add(bundle)
    await db.flush()

    # ------------------------------------------------------------------ #
    # YouTube — from packaging draft
    # ------------------------------------------------------------------ #
    packaging = drafts_by_kind.get("packaging", {})
    yt_title = packaging.get("title") or None
    yt_description = packaging.get("description") or None

    # Enrich YouTube tags from metadata draft
    metadata_draft = drafts_by_kind.get("metadata", {})
    yt_tags: list | None = None
    if metadata_draft:
        inner_meta = metadata_draft.get("metadata") or metadata_draft
        raw_tags = inner_meta.get("tags") or inner_meta.get("keywords")
        if isinstance(raw_tags, list):
            yt_tags = raw_tags
        elif isinstance(raw_tags, str):
            yt_tags = [t.strip() for t in raw_tags.split(",") if t.strip()]

    if yt_title or yt_description:
        yt_variant = PublishVariant(
            id=str(uuid.uuid4()),
            bundle_id=bundle.id,
            platform="youtube",
            title=yt_title,
            description=yt_description,
            tags=yt_tags,
            ai_generated=True,
        )
        db.add(yt_variant)

    # ------------------------------------------------------------------ #
    # Instagram / TikTok / Facebook (social) — from reel draft
    # Accumulate into a dict keyed by platform to avoid duplicate inserts.
    # ------------------------------------------------------------------ #
    reel_draft = drafts_by_kind.get("reel", {})
    reel_platforms: dict = reel_draft.get("platforms", {})

    # platform_key -> variant kwargs
    social_variants: dict[str, dict] = {}

    for platform_key in ("instagram", "tiktok", "facebook"):
        plat_data = reel_platforms.get(platform_key) or {}
        p_title = plat_data.get("title") or None
        p_description = plat_data.get("description") or None
        p_tags_raw = plat_data.get("tags")
        p_tags: list | None = None
        if isinstance(p_tags_raw, list):
            p_tags = p_tags_raw
        elif isinstance(p_tags_raw, str):
            p_tags = [t.strip() for t in p_tags_raw.split(",") if t.strip()]

        if p_title or p_description:
            social_variants[platform_key] = dict(title=p_title, description=p_description, tags=p_tags)

    # NOTE: The facebook text post draft (drafts_by_kind["facebook"]) is intentionally
    # NOT included here. Text posts (facebook/instagram/tiktok) are a separate
    # variant type from reels and will be handled in a future schema update.

    # Add all social variants (deduplicated by platform)
    for platform_key, kwargs in social_variants.items():
        db.add(PublishVariant(
            id=str(uuid.uuid4()),
            bundle_id=bundle.id,
            platform=platform_key,
            ai_generated=True,
            **kwargs,
        ))

    # ------------------------------------------------------------------ #
    # Wix Blog — from blog draft
    # ------------------------------------------------------------------ #
    blog_draft = drafts_by_kind.get("blog", {})
    blog_title = blog_draft.get("title") or yt_title or None
    blog_markdown = blog_draft.get("markdown") or blog_draft.get("content") or None
    if blog_title or blog_markdown:
        db.add(PublishVariant(
            id=str(uuid.uuid4()),
            bundle_id=bundle.id,
            platform="wix_blog",
            title=blog_title,
            description=blog_markdown,
            ai_generated=True,
        ))

    await db.flush()
    await db.refresh(bundle)
    return bundle


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------

@router.get("/calendar", response_model=list[CalendarBundleRead])
async def get_calendar(
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Return all publish bundles whose week_date falls within [from, to]."""
    filters = [PublishBundle.organization_id == DEFAULT_ORG_ID]
    if from_ is not None:
        filters.append(PublishBundle.week_date >= from_)
    if to is not None:
        filters.append(PublishBundle.week_date <= to)

    result = await db.execute(
        select(PublishBundle)
        .where(and_(*filters))
        .order_by(PublishBundle.week_date.asc(), PublishBundle.created_at.asc())
    )
    return list(result.scalars().all())
