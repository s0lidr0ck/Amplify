"""Publishing Workspace routes — bundles, variants, and calendar."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import async_session as AsyncSessionLocal, get_db
from app.lib.facebook import FacebookPublishError, upload_reel as fb_upload_reel
from app.lib.instagram import InstagramPublishError, upload_reel as ig_upload_reel
from app.lib.tiktok import TikTokPublishError, upload_video as tt_upload_video
from app.lib.wix_blog import WixPublishError, publish_wix_blog_post
from app.lib.youtube import YouTubePublishError, upload_thumbnail, upload_video
from app.models import MediaAsset, Project, ProjectContentDraft, PublishBundle, PublishVariant
from app.routers.projects import DEFAULT_ORG_ID

logger = logging.getLogger(__name__)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
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
# Publish — real platform uploads
# ---------------------------------------------------------------------------

def _resolve_asset_path(asset: MediaAsset) -> Path:
    """Resolve the filesystem path for a media asset."""
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    return upload_dir / asset.storage_key / asset.filename


async def _do_youtube_upload(
    variant_id: str,
    bundle_id: str,
    title: str,
    description: str,
    tags: list[str] | None,
    video_path: Path,
    thumbnail_path: Path | None,
) -> None:
    """Background task: upload video + thumbnail to YouTube and update DB."""
    # Step 1: immediately mark as processing so the UI reflects progress
    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(select(PublishVariant).where(PublishVariant.id == variant_id))
            variant = result.scalar_one_or_none()
            if variant is None:
                logger.error("YouTube upload: variant %s not found", variant_id)
                return
            variant.publish_status = "processing"

    # Step 2: perform the upload outside any DB transaction (can take minutes)
    final_status: str
    result_json: dict
    published_at = None
    try:
        video_resource = await upload_video(
            file_path=video_path,
            title=title,
            description=description,
            tags=tags,
            privacy_status="public",
            notify_subscribers=True,
        )
        video_id = video_resource.get("id")
        if not video_id:
            raise YouTubePublishError(f"YouTube response missing video ID: {video_resource}")

        # Upload thumbnail if available
        if thumbnail_path and thumbnail_path.exists():
            try:
                await upload_thumbnail(video_id=video_id, file_path=thumbnail_path)
            except YouTubePublishError as thumb_err:
                logger.warning("Thumbnail upload failed (video still published): %s", thumb_err)

        final_status = "published"
        published_at = datetime.now(tz=timezone.utc)
        result_json = {
            "video_id": video_id,
            "url": f"https://youtu.be/{video_id}",
            "title": video_resource.get("snippet", {}).get("title"),
        }
    except Exception as exc:
        logger.exception("YouTube upload failed for variant %s", variant_id)
        final_status = "failed"
        result_json = {"error": str(exc)}

    # Step 3: commit final status
    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(select(PublishVariant).where(PublishVariant.id == variant_id))
            variant = result.scalar_one_or_none()
            if variant is not None:
                variant.publish_status = final_status
                variant.published_at = published_at
                variant.publish_result_json = result_json


async def _do_facebook_upload(
    variant_id: str,
    bundle_id: str,
    title: str,
    description: str,
    hashtags: list[str] | None,
    video_path: Path,
) -> None:
    """Background task: upload reel to Facebook Page and update DB."""
    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(select(PublishVariant).where(PublishVariant.id == variant_id))
            variant = result.scalar_one_or_none()
            if variant is None:
                return
            variant.publish_status = "processing"

    final_status: str
    result_json: dict
    published_at = None
    try:
        response = await fb_upload_reel(
            file_path=video_path,
            title=title,
            description=description,
            hashtags=hashtags,
        )
        final_status = "published"
        published_at = datetime.now(tz=timezone.utc)
        result_json = response
    except Exception as exc:
        logger.exception("Facebook upload failed for variant %s", variant_id)
        final_status = "failed"
        result_json = {"error": str(exc)}

    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(select(PublishVariant).where(PublishVariant.id == variant_id))
            variant = result.scalar_one_or_none()
            if variant is not None:
                variant.publish_status = final_status
                variant.published_at = published_at
                variant.publish_result_json = result_json


async def _do_instagram_upload(
    variant_id: str,
    bundle_id: str,
    media_asset_id: str,
    title: str,
    description: str,
    hashtags: list[str] | None,
) -> None:
    """Background task: upload reel to Instagram and update DB."""
    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(select(PublishVariant).where(PublishVariant.id == variant_id))
            variant = result.scalar_one_or_none()
            if variant is None:
                return
            variant.publish_status = "processing"

    final_status: str
    result_json: dict
    published_at = None
    try:
        response = await ig_upload_reel(
            media_asset_id=media_asset_id,
            title=title,
            description=description,
            hashtags=hashtags,
        )
        final_status = "published"
        published_at = datetime.now(tz=timezone.utc)
        result_json = response
    except Exception as exc:
        logger.exception("Instagram upload failed for variant %s", variant_id)
        final_status = "failed"
        result_json = {"error": str(exc)}

    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(select(PublishVariant).where(PublishVariant.id == variant_id))
            variant = result.scalar_one_or_none()
            if variant is not None:
                variant.publish_status = final_status
                variant.published_at = published_at
                variant.publish_result_json = result_json


async def _do_tiktok_upload(
    variant_id: str,
    bundle_id: str,
    media_asset_id: str,
    title: str,
    description: str,
    hashtags: list[str] | None,
) -> None:
    """Background task: upload video to TikTok and update DB."""
    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(select(PublishVariant).where(PublishVariant.id == variant_id))
            variant = result.scalar_one_or_none()
            if variant is None:
                return
            variant.publish_status = "processing"

    final_status: str
    result_json: dict
    published_at = None
    try:
        response = await tt_upload_video(
            media_asset_id=media_asset_id,
            title=title,
            description=description,
            hashtags=hashtags,
        )
        final_status = "published"
        published_at = datetime.now(tz=timezone.utc)
        result_json = response
    except Exception as exc:
        logger.exception("TikTok upload failed for variant %s", variant_id)
        final_status = "failed"
        result_json = {"error": str(exc)}

    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(select(PublishVariant).where(PublishVariant.id == variant_id))
            variant = result.scalar_one_or_none()
            if variant is not None:
                variant.publish_status = final_status
                variant.published_at = published_at
                variant.publish_result_json = result_json


async def _do_wix_blog_publish(
    variant_id: str,
    bundle_id: str,
    bundle_thumbnail_asset_id: str | None,
    title: str,
    description: str,
    tags: list[str] | None,
) -> None:
    """Background task: publish blog post to Wix and update DB."""
    from app.config import settings as _settings

    async with AsyncSessionLocal() as db:
        async with db.begin():
            result = await db.execute(select(PublishVariant).where(PublishVariant.id == variant_id))
            variant = result.scalar_one_or_none()
            if variant is None:
                return

            try:
                # Resolve thumbnail URL if available
                featured_image_source: str | None = None
                if bundle_thumbnail_asset_id:
                    featured_image_source = (
                        f"{_settings.api_url.rstrip('/')}/api/media/asset/{bundle_thumbnail_asset_id}"
                    )

                # Build a reasonable excerpt from the description
                excerpt = (description or "").strip()
                if len(excerpt) > 300:
                    excerpt = excerpt[:297] + "…"

                response = await publish_wix_blog_post(
                    project_title=title,
                    blog_title=title,
                    blog_markdown=description or "",
                    featured_image_source=featured_image_source,
                    featured_image_id=None,
                    publish_date=None,
                    writer_member_id=_settings.wix_blog_member_id,
                    excerpt=excerpt or title,
                    title_tag=title,
                    meta_description=excerpt or title,
                    og_title=title,
                    og_description=excerpt or title,
                )
                variant.publish_status = "published"
                variant.published_at = datetime.now(tz=timezone.utc)
                variant.publish_result_json = response
            except WixPublishError as exc:
                logger.exception("Wix Blog publish failed for variant %s", variant_id)
                variant.publish_status = "failed"
                variant.publish_result_json = {"error": str(exc)}
            except Exception as exc:
                logger.exception("Wix Blog publish unexpected error for variant %s", variant_id)
                variant.publish_status = "failed"
                variant.publish_result_json = {"error": str(exc)}


@router.post("/bundles/{bundle_id}/variants/{platform}/publish", response_model=PublishVariantRead)
async def publish_variant(
    bundle_id: str,
    platform: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Publish a variant to its platform.

    - Sets publish_status to 'processing' immediately and returns.
    - A background task performs the actual upload and updates the status
      to 'published' (or 'failed') when done.
    - Currently supported: youtube. Others will be wired up next.
    """
    bundle = await _get_bundle_or_404(bundle_id, db)

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

    if variant.publish_status == "published":
        raise HTTPException(status_code=409, detail="Variant is already published.")

    if variant.publish_status == "processing":
        raise HTTPException(status_code=409, detail="Variant is already being uploaded.")

    if platform == "youtube":
        # Resolve media asset
        if not variant.media_asset_id:
            raise HTTPException(status_code=422, detail="No media asset linked to this YouTube variant. Re-run AI harvest to link the reel file.")

        media_result = await db.execute(select(MediaAsset).where(MediaAsset.id == variant.media_asset_id))
        media_asset = media_result.scalar_one_or_none()
        if media_asset is None:
            raise HTTPException(status_code=422, detail="Media asset record not found.")

        video_path = _resolve_asset_path(media_asset)
        if not video_path.exists():
            raise HTTPException(status_code=422, detail=f"Video file not found on disk: {video_path.name}")

        # Resolve thumbnail (optional)
        thumbnail_path: Path | None = None
        if bundle.thumbnail_asset_id:
            thumb_result = await db.execute(select(MediaAsset).where(MediaAsset.id == bundle.thumbnail_asset_id))
            thumb_asset = thumb_result.scalar_one_or_none()
            if thumb_asset:
                thumbnail_path = _resolve_asset_path(thumb_asset)

        # Mark as processing and kick off background upload
        variant.publish_status = "processing"
        await db.flush()
        await db.refresh(variant)

        background_tasks.add_task(
            _do_youtube_upload,
            variant_id=variant.id,
            bundle_id=bundle_id,
            title=variant.title or bundle.label or "",
            description=variant.description or "",
            tags=variant.tags or [],
            video_path=video_path,
            thumbnail_path=thumbnail_path,
        )

    elif platform in ("facebook", "instagram", "tiktok"):
        # These platforms use the media asset URL (publicly served by our API)
        if not variant.media_asset_id:
            raise HTTPException(
                status_code=422,
                detail=f"No media asset linked to this {platform} variant. Re-run AI harvest to link the reel file.",
            )

        variant.publish_status = "processing"
        await db.flush()
        await db.refresh(variant)

        if platform == "facebook":
            media_result = await db.execute(select(MediaAsset).where(MediaAsset.id == variant.media_asset_id))
            media_asset = media_result.scalar_one_or_none()
            if media_asset is None:
                raise HTTPException(status_code=422, detail="Media asset record not found.")
            video_path = _resolve_asset_path(media_asset)
            if not video_path.exists():
                raise HTTPException(status_code=422, detail=f"Video file not found on disk: {video_path.name}")
            background_tasks.add_task(
                _do_facebook_upload,
                variant_id=variant.id,
                bundle_id=bundle_id,
                title=variant.title or bundle.label or "",
                description=variant.description or "",
                hashtags=variant.hashtags or [],
                video_path=video_path,
            )

        elif platform == "instagram":
            background_tasks.add_task(
                _do_instagram_upload,
                variant_id=variant.id,
                bundle_id=bundle_id,
                media_asset_id=variant.media_asset_id,
                title=variant.title or bundle.label or "",
                description=variant.description or "",
                hashtags=variant.hashtags or [],
            )

        elif platform == "tiktok":
            background_tasks.add_task(
                _do_tiktok_upload,
                variant_id=variant.id,
                bundle_id=bundle_id,
                media_asset_id=variant.media_asset_id,
                title=variant.title or bundle.label or "",
                description=variant.description or "",
                hashtags=variant.hashtags or [],
            )

    elif platform == "wix_blog":
        # Wix Blog — publish markdown body directly
        variant.publish_status = "processing"
        await db.flush()
        await db.refresh(variant)

        background_tasks.add_task(
            _do_wix_blog_publish,
            variant_id=variant.id,
            bundle_id=bundle_id,
            bundle_thumbnail_asset_id=bundle.thumbnail_asset_id,
            title=variant.title or bundle.label or "",
            description=variant.description or "",
            tags=variant.tags or [],
        )

    else:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown platform '{platform}'.",
        )

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

    # Load media assets for this project
    assets_result = await db.execute(
        select(MediaAsset).where(MediaAsset.project_id == project_id)
    )
    assets = assets_result.scalars().all()
    assets_by_kind: dict[str, MediaAsset] = {a.asset_kind: a for a in assets}

    # Resolve master video and thumbnail assets
    master_asset = assets_by_kind.get("sermon_master")
    # Prefer reel_thumbnail (from the "Reel Thumbnail" tab) over sermon_thumbnail
    thumbnail_asset = assets_by_kind.get("reel_thumbnail") or assets_by_kind.get("sermon_thumbnail")
    # Also resolve the final reel for social platform variants
    reel_asset = assets_by_kind.get("final_reel")

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
        thumbnail_asset_id=thumbnail_asset.id if thumbnail_asset else None,
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
            # Use the final reel (step 7) as the YouTube upload source
            media_asset_id=reel_asset.id if reel_asset else None,
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

        if p_title or p_description or p_tags:
            # Store reel draft's #hashtag-style tags in the `hashtags` column (not `tags`)
            # Link the final_reel asset as the video source for all social platforms
            social_variants[platform_key] = dict(
                title=p_title,
                description=p_description,
                hashtags=p_tags,
                media_asset_id=reel_asset.id if reel_asset else None,
            )

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
            **kwargs,  # contains title, description, hashtags (not tags)
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
