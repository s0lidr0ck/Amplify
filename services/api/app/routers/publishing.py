"""Publishing routes."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
import httpx
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.lib.facebook_publishing import (
    FacebookPublishError,
    publish_facebook_reel,
    publish_facebook_text_post,
)
from app.lib.instagram_publishing import InstagramPublishError, publish_instagram_reel
from app.lib.instagram_publishing import publish_instagram_image_post
from app.lib.meta_credentials import resolve_meta_publish_credentials
from app.lib.tiktok_publishing import (
    TikTokPublishError,
    build_tiktok_oauth_url,
    ensure_tiktok_access_token,
    exchange_tiktok_auth_code,
    publish_tiktok_photo_post,
    publish_tiktok_video,
    tiktok_oauth_ready,
    tiktok_publish_ready,
)
from app.lib.wix_blog import WixPublishError, publish_wix_blog_post, upload_wix_media_bytes
from app.lib.youtube_publishing import (
    YouTubePublishError,
    build_youtube_oauth_url,
    exchange_youtube_auth_code,
    publish_youtube_video,
    refresh_youtube_access_token,
    youtube_oauth_ready,
    youtube_publish_ready,
)
from app.models import MediaAsset, Project, ProjectContentDraft

router = APIRouter(prefix="/api/publishing", tags=["publishing"])
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class WixConfigRead(BaseModel):
    configured: bool
    api_base: str
    site_id: str
    default_writer_member_id: str


class PublishingChannelRead(BaseModel):
    id: str
    label: str
    kind: str
    configured: bool
    connection_status: str
    summary: str
    requirements: list[str]


class YouTubeConfigRead(BaseModel):
    client_configured: bool
    publish_configured: bool
    channel_id: str


class TikTokConfigRead(BaseModel):
    client_configured: bool
    publish_configured: bool
    open_id: str


class YouTubeOAuthStartRead(BaseModel):
    auth_url: str
    redirect_uri: str


class TikTokOAuthStartRead(BaseModel):
    auth_url: str
    redirect_uri: str
    state: str


class YouTubeOAuthExchangeRequest(BaseModel):
    code: str
    redirect_uri: str


class TikTokOAuthExchangeRequest(BaseModel):
    code: str
    redirect_uri: str


class YouTubePublishRequest(BaseModel):
    title: str
    description: str
    tags: list[str] = []
    privacy_status: str = "private"
    publish_at: str | None = None


class FacebookTextPublishRequest(BaseModel):
    message: str


class FacebookReelPublishRequest(BaseModel):
    description: str
    title: str = ""


class InstagramReelPublishRequest(BaseModel):
    caption: str = ""


class InstagramImagePublishRequest(BaseModel):
    caption: str = ""


class TikTokShortPublishRequest(BaseModel):
    title: str = ""
    description: str = ""


class TikTokPhotoPublishRequest(BaseModel):
    title: str = ""
    description: str = ""


class AudienceActivitySlot(BaseModel):
    day_of_week: int
    hour: int
    activity: float


class AudienceActivityWriteRequest(BaseModel):
    platform: str
    source: str = "manual"
    slots: list[AudienceActivitySlot]


class TimeSlotScoreRead(BaseModel):
    day_of_week: int
    hour: int
    score: float


class PublishRecommendationRead(BaseModel):
    platform: str
    recommended_at: str
    confidence: str
    confidence_score: float
    score: float
    reason: str
    based_on: dict[str, bool]
    components: dict[str, float]
    best_hour: int
    best_day_hour: list[TimeSlotScoreRead]


class PublishRecommendationsRead(BaseModel):
    project_id: str
    generated_at: str
    recommendations: list[PublishRecommendationRead]


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_series(values: list[float]) -> list[float]:
    if not values:
        return []
    minimum = min(values)
    maximum = max(values)
    if maximum <= minimum:
        return [0.5 for _ in values]
    span = maximum - minimum
    return [(value - minimum) / span for value in values]


def _day_hour_key(dt: datetime) -> tuple[int, int]:
    return dt.weekday(), dt.hour


def _extract_platform_publish_rows(draft: ProjectContentDraft, project_id: str) -> list[dict[str, Any]]:
    payload = draft.payload_json if isinstance(draft.payload_json, dict) else {}
    mappings = [
        ("wix_result", "wix", "wix_article", "published_at"),
        ("youtube_result", "youtube", "youtube_sermon", "published_at"),
        ("youtube_short_result", "youtube", "youtube_short", "published_at"),
        ("facebook_post_result", "facebook", "facebook_text", None),
        ("facebook_reel_result", "facebook", "facebook_reel", None),
        ("instagram_post_result", "instagram", "instagram_image", None),
        ("instagram_reel_result", "instagram", "instagram_reel", None),
        ("tiktok_photo_result", "tiktok", "tiktok_photo", None),
        ("tiktok_short_result", "tiktok", "tiktok_short", None),
    ]
    rows: list[dict[str, Any]] = []
    for key, platform, post_type, published_field in mappings:
        result_payload = payload.get(key)
        if not isinstance(result_payload, dict):
            continue
        published_at_raw = result_payload.get(published_field) if published_field else None
        published_at: datetime
        if isinstance(published_at_raw, str) and published_at_raw.strip():
            try:
                published_at = datetime.fromisoformat(published_at_raw.replace("Z", "+00:00"))
                if published_at.tzinfo is None:
                    published_at = published_at.replace(tzinfo=UTC)
            except ValueError:
                published_at = draft.updated_at
        else:
            published_at = draft.updated_at

        impressions = _safe_float(result_payload.get("impressions") or result_payload.get("reach") or result_payload.get("views"))
        engagement_rate = _safe_float(result_payload.get("engagement_rate"))

        rows.append(
            {
                "project_id": project_id,
                "platform": platform,
                "post_type": post_type,
                "published_at": published_at,
                "impressions": impressions,
                "engagement_rate": engagement_rate,
                "likes": _safe_float(result_payload.get("likes")),
                "comments": _safe_float(result_payload.get("comments")),
                "shares": _safe_float(result_payload.get("shares")),
                "saves": _safe_float(result_payload.get("saves")),
                "early_30m": _safe_float(result_payload.get("early_30m")),
                "early_1h": _safe_float(result_payload.get("early_1h")),
                "early_2h": _safe_float(result_payload.get("early_2h")),
                "early_24h": _safe_float(result_payload.get("early_24h")),
            }
        )

    return rows


def _extract_publish_metric_rows(draft: ProjectContentDraft, project_id: str) -> list[dict[str, Any]]:
    payload = draft.payload_json if isinstance(draft.payload_json, dict) else {}
    entries = payload.get("entries")
    if not isinstance(entries, list):
        return []

    rows: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        platform = str(entry.get("platform") or "").strip().lower()
        if platform not in {"wix", "youtube", "facebook", "instagram", "tiktok"}:
            continue
        published_raw = str(entry.get("published_at") or "").strip()
        if not published_raw:
            continue
        try:
            published_at = datetime.fromisoformat(published_raw.replace("Z", "+00:00"))
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=UTC)
        except ValueError:
            continue
        rows.append(
            {
                "project_id": project_id,
                "platform": platform,
                "post_type": str(entry.get("post_type") or "post"),
                "published_at": published_at,
                "impressions": _safe_float(entry.get("impressions") or entry.get("reach") or entry.get("views")),
                "engagement_rate": _safe_float(entry.get("engagement_rate")),
                "likes": _safe_float(entry.get("likes")),
                "comments": _safe_float(entry.get("comments")),
                "shares": _safe_float(entry.get("shares")),
                "saves": _safe_float(entry.get("saves")),
                "early_30m": _safe_float(entry.get("early_30m")),
                "early_1h": _safe_float(entry.get("early_1h")),
                "early_2h": _safe_float(entry.get("early_2h")),
                "early_24h": _safe_float(entry.get("early_24h")),
            }
        )

    return rows


def _build_platform_recommendation(
    *,
    platform: str,
    now: datetime,
    audience_slots: list[dict[str, Any]],
    history_rows: list[dict[str, Any]],
) -> PublishRecommendationRead:
    audience_map: dict[tuple[int, int], float] = {}
    for slot in audience_slots:
        day = int(slot.get("day_of_week") or 0)
        hour = int(slot.get("hour") or 0)
        activity = max(0.0, min(1.0, float(slot.get("activity") or 0.0)))
        audience_map[(day, hour)] = activity

    performance_values: list[float] = []
    velocity_values: list[float] = []
    history_keys: list[tuple[int, int]] = []

    for row in history_rows:
        published_at = row["published_at"]
        key = _day_hour_key(published_at)
        history_keys.append(key)

        impressions = row.get("impressions") or 0.0
        likes = row.get("likes") or 0.0
        comments = row.get("comments") or 0.0
        shares = row.get("shares") or 0.0
        saves = row.get("saves") or 0.0

        engagement_rate = row.get("engagement_rate")
        if engagement_rate is None:
            denom = max(1.0, impressions)
            engagement_rate = (likes + comments * 1.8 + shares * 2.3 + saves * 2.0) / denom

        reach_score = min(1.0, (impressions or 0.0) / 20000.0)
        performance_values.append(0.65 * min(1.0, max(0.0, float(engagement_rate))) + 0.35 * reach_score)

        early_1h = row.get("early_1h") or row.get("early_30m") or 0.0
        early_24h = row.get("early_24h") or 0.0
        if early_24h > 0:
            velocity_values.append(min(1.0, max(0.0, float(early_1h) / float(early_24h))))
        else:
            velocity_values.append(min(1.0, max(0.0, float(early_1h) / max(1.0, impressions))))

    perf_norm = _normalize_series(performance_values)
    vel_norm = _normalize_series(velocity_values)

    history_score_map: dict[tuple[int, int], list[float]] = {}
    velocity_score_map: dict[tuple[int, int], list[float]] = {}
    for idx, key in enumerate(history_keys):
        history_score_map.setdefault(key, []).append(perf_norm[idx] if idx < len(perf_norm) else 0.0)
        velocity_score_map.setdefault(key, []).append(vel_norm[idx] if idx < len(vel_norm) else 0.0)

    history_hour_fallback: dict[int, float] = {}
    velocity_hour_fallback: dict[int, float] = {}
    for hour in range(24):
        hist_bucket = [value for (day, h), values in history_score_map.items() if h == hour for value in values]
        vel_bucket = [value for (day, h), values in velocity_score_map.items() if h == hour for value in values]
        history_hour_fallback[hour] = (sum(hist_bucket) / len(hist_bucket)) if hist_bucket else 0.0
        velocity_hour_fallback[hour] = (sum(vel_bucket) / len(vel_bucket)) if vel_bucket else 0.0

    candidate_slots: list[tuple[datetime, float, float, float, float]] = []
    for day_offset in range(0, 8):
        for hour in range(24):
            for minute in (0, 30):
                slot_time = now + timedelta(days=day_offset)
                slot_time = slot_time.replace(hour=hour, minute=minute, second=0, microsecond=0)
                if slot_time <= now:
                    continue
                day_key = slot_time.weekday()
                audience_score = audience_map.get((day_key, hour), 0.0)
                history_score = (
                    sum(history_score_map.get((day_key, hour), [])) / len(history_score_map[(day_key, hour)])
                    if (day_key, hour) in history_score_map and history_score_map[(day_key, hour)]
                    else history_hour_fallback.get(hour, 0.0)
                )
                velocity_score = (
                    sum(velocity_score_map.get((day_key, hour), [])) / len(velocity_score_map[(day_key, hour)])
                    if (day_key, hour) in velocity_score_map and velocity_score_map[(day_key, hour)]
                    else velocity_hour_fallback.get(hour, 0.0)
                )

                has_audience = bool(audience_map)
                has_history = bool(history_rows)
                has_velocity = any(value > 0 for value in velocity_values)
                weights: dict[str, float] = {
                    "audience": 0.4 if has_audience else 0.0,
                    "history": 0.4 if has_history else 0.0,
                    "velocity": 0.2 if has_velocity else 0.0,
                }
                total_weight = sum(weights.values())
                if total_weight <= 0:
                    score = 0.0
                else:
                    score = (
                        audience_score * (weights["audience"] / total_weight)
                        + history_score * (weights["history"] / total_weight)
                        + velocity_score * (weights["velocity"] / total_weight)
                    )

                candidate_slots.append((slot_time, score, audience_score, history_score, velocity_score))

    candidate_slots.sort(key=lambda item: item[1], reverse=True)
    best_slot = candidate_slots[0] if candidate_slots else (now + timedelta(hours=1), 0.0, 0.0, 0.0, 0.0)
    top_slots = candidate_slots[:3]

    available_audience = bool(audience_map)
    available_history = bool(history_rows)
    available_velocity = any(value > 0 for value in velocity_values)

    data_score = (
        (0.28 if available_audience else 0.0)
        + (0.32 if available_history else 0.0)
        + (0.2 if available_velocity else 0.0)
        + min(0.2, len(history_rows) / 40.0)
    )
    confidence_score = round(min(0.98, data_score), 3)
    if confidence_score >= 0.72:
        confidence = "high"
    elif confidence_score >= 0.45:
        confidence = "medium"
    else:
        confidence = "low"

    dominant = max(
        (("audience activity", best_slot[2]), ("historical performance", best_slot[3]), ("early velocity", best_slot[4])),
        key=lambda item: item[1],
    )[0]
    reason = f"Recommendation leans on {dominant} for this platform and account history."

    best_hour = best_slot[0].hour
    return PublishRecommendationRead(
        platform=platform,
        recommended_at=best_slot[0].isoformat(),
        confidence=confidence,
        confidence_score=confidence_score,
        score=round(float(best_slot[1]), 4),
        reason=reason,
        based_on={
            "audience_activity": available_audience,
            "performance_history": available_history,
            "early_velocity": available_velocity,
        },
        components={
            "audience_activity": round(float(best_slot[2]), 4),
            "historical_performance": round(float(best_slot[3]), 4),
            "early_velocity": round(float(best_slot[4]), 4),
        },
        best_hour=best_hour,
        best_day_hour=[
            TimeSlotScoreRead(day_of_week=slot[0].weekday(), hour=slot[0].hour, score=round(float(slot[1]), 4))
            for slot in top_slots
        ],
    )


async def _latest_existing_asset(
    db: AsyncSession,
    *,
    project_id: str,
    asset_kinds: tuple[str, ...],
    statuses: tuple[str, ...] = ("ready", "replaced"),
) -> MediaAsset | None:
    assets = (
        await db.execute(
            select(MediaAsset)
            .where(
                MediaAsset.project_id == project_id,
                MediaAsset.asset_kind.in_(asset_kinds),
                MediaAsset.status.in_(statuses),
            )
            .order_by(MediaAsset.updated_at.desc(), MediaAsset.created_at.desc())
        )
    ).scalars().all()
    return next((asset for asset in assets if _existing_asset_path(asset)), None)


async def _latest_draft(
    db: AsyncSession,
    *,
    project_id: str,
    draft_kind: str,
) -> ProjectContentDraft | None:
    return (
        await db.execute(
            select(ProjectContentDraft)
            .where(
                ProjectContentDraft.project_id == project_id,
                ProjectContentDraft.draft_kind == draft_kind,
            )
            .order_by(ProjectContentDraft.updated_at.desc(), ProjectContentDraft.created_at.desc())
        )
    ).scalars().first()


def _upload_root() -> Path:
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    return upload_dir


def _asset_path(asset: MediaAsset) -> Path:
    return _upload_root() / asset.storage_key / asset.filename


def _existing_asset_path(asset: MediaAsset) -> Path | None:
    path = _asset_path(asset)
    return path if path.exists() else None


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


@router.get("/channels", response_model=list[PublishingChannelRead])
async def get_publishing_channels():
    wix_configured = bool(settings.wix_api_base.strip() and settings.wix_bearer_token.strip() and settings.wix_site_id.strip())
    youtube_configured = bool(
        settings.youtube_client_id.strip()
        and settings.youtube_client_secret.strip()
        and settings.youtube_refresh_token.strip()
        and settings.youtube_channel_id.strip()
    )
    facebook_configured = bool(settings.facebook_page_id.strip() and settings.facebook_page_access_token.strip())
    instagram_configured = bool(settings.instagram_business_account_id.strip() and settings.instagram_access_token.strip())
    tiktok_configured = bool(settings.tiktok_access_token.strip() and settings.tiktok_open_id.strip())

    return [
        PublishingChannelRead(
            id="wix",
            label="Wix",
            kind="Article",
            configured=wix_configured,
            connection_status="Connected" if wix_configured else "Needs credentials",
            summary="Publish the long-form article and SEO package to the Wix blog.",
            requirements=["WIX_SITE_ID", "WIX_BEARER_TOKEN", "WIX_BLOG_MEMBER_ID"],
        ),
        PublishingChannelRead(
            id="youtube",
            label="YouTube",
            kind="Video",
            configured=youtube_configured,
            connection_status="Connected" if youtube_configured else "Needs OAuth setup",
            summary="Publish the sermon video with YouTube title, description, chapters, and thumbnail.",
            requirements=["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CHANNEL_ID"],
        ),
        PublishingChannelRead(
            id="facebook",
            label="Facebook",
            kind="Post",
            configured=facebook_configured,
            connection_status="Connected" if facebook_configured else "Needs page token",
            summary="Publish the generated Facebook post or reel package to the connected page.",
            requirements=["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"],
        ),
        PublishingChannelRead(
            id="instagram",
            label="Instagram",
            kind="Reel",
            configured=instagram_configured,
            connection_status="Connected" if instagram_configured else "Needs business auth",
            summary="Publish the final reel, caption, and thumbnail to the Instagram business account.",
            requirements=["INSTAGRAM_BUSINESS_ACCOUNT_ID", "INSTAGRAM_ACCESS_TOKEN"],
        ),
        PublishingChannelRead(
            id="tiktok",
            label="TikTok",
            kind="Video",
            configured=tiktok_configured,
            connection_status="Connected" if tiktok_configured else "Needs creator auth",
            summary="Publish the final reel package to TikTok with the generated caption.",
            requirements=["TIKTOK_OPEN_ID", "TIKTOK_ACCESS_TOKEN"],
        ),
    ]


@router.get("/youtube/config", response_model=YouTubeConfigRead)
async def get_youtube_config():
    return YouTubeConfigRead(
        client_configured=youtube_oauth_ready(),
        publish_configured=youtube_publish_ready(),
        channel_id=settings.youtube_channel_id.strip(),
    )


@router.get("/tiktok/config", response_model=TikTokConfigRead)
async def get_tiktok_config():
    return TikTokConfigRead(
        client_configured=tiktok_oauth_ready(),
        publish_configured=tiktok_publish_ready(),
        open_id=settings.tiktok_open_id.strip(),
    )


@router.get("/youtube/oauth/start", response_model=YouTubeOAuthStartRead)
async def start_youtube_oauth(redirect_uri: str | None = None):
    if not youtube_oauth_ready():
        raise HTTPException(status_code=400, detail="Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET before starting YouTube OAuth.")

    normalized_redirect = (redirect_uri or "").strip() or f"{settings.app_url.rstrip('/')}/publish/youtube/callback"
    return YouTubeOAuthStartRead(
        auth_url=build_youtube_oauth_url(redirect_uri=normalized_redirect),
        redirect_uri=normalized_redirect,
    )


@router.post("/youtube/oauth/exchange")
async def exchange_youtube_oauth_code(body: YouTubeOAuthExchangeRequest):
    try:
        return await exchange_youtube_auth_code(code=body.code.strip(), redirect_uri=body.redirect_uri.strip())
    except YouTubePublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tiktok/oauth/start", response_model=TikTokOAuthStartRead)
async def start_tiktok_oauth(redirect_uri: str | None = None):
    normalized_redirect = (redirect_uri or "").strip() or "https://amplify-amplify-web.ktfbiu.easypanel.host/publish/tiktok/callback"
    state = "amplify-tiktok-connect"
    try:
        auth_url = build_tiktok_oauth_url(
            redirect_uri=normalized_redirect,
            state=state,
        )
    except TikTokPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return TikTokOAuthStartRead(
        auth_url=auth_url,
        redirect_uri=normalized_redirect,
        state=state,
    )


@router.post("/tiktok/oauth/exchange")
async def exchange_tiktok_oauth_code(body: TikTokOAuthExchangeRequest):
    try:
        return await exchange_tiktok_auth_code(code=body.code.strip(), redirect_uri=body.redirect_uri.strip())
    except TikTokPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc



@router.put("/projects/{project_id}/audience-activity")
async def upsert_project_audience_activity(
    project_id: str,
    body: AudienceActivityWriteRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    platform = body.platform.strip().lower()
    if platform not in {"wix", "youtube", "facebook", "instagram", "tiktok"}:
        raise HTTPException(status_code=400, detail="Unsupported platform")

    draft = await _latest_draft(db, project_id=project_id, draft_kind="audience_activity")
    payload = draft.payload_json if draft and isinstance(draft.payload_json, dict) else {}
    platforms_payload = payload.get("platforms") if isinstance(payload.get("platforms"), dict) else {}

    cleaned_slots: list[dict[str, Any]] = []
    for slot in body.slots:
        if slot.day_of_week < 0 or slot.day_of_week > 6:
            raise HTTPException(status_code=400, detail="day_of_week must be between 0 and 6")
        if slot.hour < 0 or slot.hour > 23:
            raise HTTPException(status_code=400, detail="hour must be between 0 and 23")
        cleaned_slots.append(
            {
                "day_of_week": slot.day_of_week,
                "hour": slot.hour,
                "activity": max(0.0, min(1.0, float(slot.activity))),
            }
        )

    platforms_payload[platform] = {
        "source": body.source.strip() or "manual",
        "updated_at": datetime.now(UTC).isoformat(),
        "slots": cleaned_slots,
    }

    next_payload = {
        **payload,
        "platforms": platforms_payload,
    }

    if draft:
        draft.payload_json = next_payload
    else:
        db.add(
            ProjectContentDraft(
                project_id=project_id,
                draft_kind="audience_activity",
                payload_json=next_payload,
            )
        )

    await db.flush()
    return {"ok": True, "platform": platform, "slots": len(cleaned_slots)}


@router.get("/projects/{project_id}/recommendations", response_model=PublishRecommendationsRead)
async def get_project_publish_recommendations(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    org_projects = (
        await db.execute(
            select(Project.id)
            .where(Project.organization_id == project.organization_id)
        )
    ).scalars().all()

    publishing_drafts = (
        await db.execute(
            select(ProjectContentDraft)
            .where(
                ProjectContentDraft.project_id.in_(org_projects),
                ProjectContentDraft.draft_kind == "publishing",
            )
            .order_by(ProjectContentDraft.updated_at.desc())
        )
    ).scalars().all()

    metric_drafts = (
        await db.execute(
            select(ProjectContentDraft)
            .where(
                ProjectContentDraft.project_id.in_(org_projects),
                ProjectContentDraft.draft_kind == "publish_metrics",
            )
            .order_by(ProjectContentDraft.updated_at.desc())
        )
    ).scalars().all()

    audience_draft = await _latest_draft(db, project_id=project_id, draft_kind="audience_activity")
    audience_payload = audience_draft.payload_json if audience_draft and isinstance(audience_draft.payload_json, dict) else {}
    audience_platforms = audience_payload.get("platforms") if isinstance(audience_payload.get("platforms"), dict) else {}

    history_by_platform: dict[str, list[dict[str, Any]]] = {
        "wix": [],
        "youtube": [],
        "facebook": [],
        "instagram": [],
        "tiktok": [],
    }

    for draft in publishing_drafts:
        for row in _extract_platform_publish_rows(draft, draft.project_id):
            history_by_platform[row["platform"]].append(row)

    for draft in metric_drafts:
        for row in _extract_publish_metric_rows(draft, draft.project_id):
            history_by_platform[row["platform"]].append(row)

    now = datetime.now(UTC)
    recommendations: list[PublishRecommendationRead] = []
    for platform in ("facebook", "instagram", "youtube", "tiktok"):
        audience_slots = []
        platform_payload = audience_platforms.get(platform)
        if isinstance(platform_payload, dict) and isinstance(platform_payload.get("slots"), list):
            audience_slots = [slot for slot in platform_payload["slots"] if isinstance(slot, dict)]
        recommendations.append(
            _build_platform_recommendation(
                platform=platform,
                now=now,
                audience_slots=audience_slots,
                history_rows=history_by_platform.get(platform, []),
            )
        )

    return PublishRecommendationsRead(
        project_id=project_id,
        generated_at=now.isoformat(),
        recommendations=recommendations,
    )


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt
    except ValueError:
        return None


def _to_int(value: Any) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _graph_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json() if response.content else {}
    except ValueError:
        return ""
    if not isinstance(payload, dict):
        return ""
    error_payload = payload.get("error")
    if not isinstance(error_payload, dict):
        return ""
    message = error_payload.get("message")
    if isinstance(message, str) and message.strip():
        return message.strip()
    return ""


def _tiktok_error_message(payload: dict[str, Any]) -> str:
    error_payload = payload.get("error")
    if isinstance(error_payload, dict):
        code = str(error_payload.get("code") or "").strip()
        message = str(error_payload.get("message") or error_payload.get("description") or "").strip()
        if code and code.lower() != "ok":
            return f"{code}: {message}" if message else code
        if message:
            return message
    err = str(payload.get("error_description") or payload.get("message") or "").strip()
    return err


async def _fetch_youtube_recent_posts(*, days: int = 30) -> tuple[list[dict[str, Any]], list[str]]:
    if not youtube_publish_ready() or not settings.youtube_channel_id.strip():
        return [], ["YouTube not configured for history sync."]

    warnings: list[str] = []
    cutoff = datetime.now(UTC) - timedelta(days=days)
    published_after = cutoff.isoformat().replace("+00:00", "Z")

    try:
        access_token = await refresh_youtube_access_token()
    except YouTubePublishError as exc:
        return [], [f"YouTube auth failed: {exc}"]

    video_ids: list[str] = []
    next_page_token: str | None = None
    timeout = httpx.Timeout(60.0, connect=20.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        for _ in range(3):
            params = {
                "part": "snippet",
                "channelId": settings.youtube_channel_id.strip(),
                "type": "video",
                "order": "date",
                "maxResults": 50,
                "publishedAfter": published_after,
            }
            if next_page_token:
                params["pageToken"] = next_page_token

            response = await client.get(
                "https://www.googleapis.com/youtube/v3/search",
                params=params,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if response.status_code >= 400:
                warnings.append(f"YouTube search failed ({response.status_code}).")
                break
            body = response.json() if response.content else {}
            for item in body.get("items", []):
                item_id = item.get("id") if isinstance(item, dict) else None
                video_id = item_id.get("videoId") if isinstance(item_id, dict) else None
                if isinstance(video_id, str) and video_id:
                    video_ids.append(video_id)
            next_page_token = body.get("nextPageToken") if isinstance(body, dict) else None
            if not next_page_token:
                break

        entries: list[dict[str, Any]] = []
        for start in range(0, len(video_ids), 50):
            chunk = video_ids[start : start + 50]
            response = await client.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={"part": "snippet,statistics,contentDetails", "id": ",".join(chunk), "maxResults": 50},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if response.status_code >= 400:
                warnings.append(f"YouTube video metrics failed ({response.status_code}).")
                continue
            body = response.json() if response.content else {}
            for item in body.get("items", []):
                snippet = item.get("snippet") if isinstance(item, dict) else {}
                stats = item.get("statistics") if isinstance(item, dict) else {}
                published_at = _parse_iso_datetime(snippet.get("publishedAt"))
                if not published_at or published_at < cutoff:
                    continue
                duration = str((item.get("contentDetails") or {}).get("duration") or "")
                post_type = "youtube_short" if duration.endswith("S") and "M" not in duration and "H" not in duration else "youtube_sermon"
                entries.append(
                    {
                        "platform": "youtube",
                        "post_type": post_type,
                        "external_id": str(item.get("id") or ""),
                        "published_at": published_at.isoformat(),
                        "views": _to_int(stats.get("viewCount")),
                        "impressions": _to_int(stats.get("viewCount")),
                        "reach": _to_int(stats.get("viewCount")),
                        "likes": _to_int(stats.get("likeCount")),
                        "comments": _to_int(stats.get("commentCount")),
                        "shares": 0,
                        "saves": 0,
                        "early_30m": None,
                        "early_1h": None,
                        "early_2h": None,
                        "early_24h": None,
                        "source": "youtube_api",
                    }
                )

    return entries, warnings


async def _fetch_facebook_recent_posts(*, days: int = 30) -> tuple[list[dict[str, Any]], list[str]]:
    creds = await resolve_meta_publish_credentials()
    if not creds.page_id or not creds.page_access_token:
        warning = "Facebook not configured for history sync."
        if creds.warnings:
            warning = f"{warning} {' '.join(creds.warnings)}"
        return [], [warning]

    cutoff = datetime.now(UTC) - timedelta(days=days)
    warnings: list[str] = list(creds.warnings)
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        async def fetch_edge(path_name: str, *, fields: str, limit: int = 100, max_pages: int = 5) -> tuple[list[dict[str, Any]], list[str]]:
            local_rows: list[dict[str, Any]] = []
            local_warnings: list[str] = []
            page_count = 0
            next_url: str | None = f"https://graph.facebook.com/v25.0/{creds.page_id}/{path_name}"
            params: dict[str, Any] | None = {
                "access_token": creds.page_access_token,
                "fields": fields,
                "limit": limit,
            }

            while next_url and page_count < max_pages:
                response = await client.get(next_url, params=params)
                params = None  # next_url from paging already includes query params
                if response.status_code >= 400:
                    err = _graph_error_message(response)
                    if err:
                        local_warnings.append(f"Facebook /{path_name} failed ({response.status_code}): {err}")
                    else:
                        local_warnings.append(f"Facebook /{path_name} failed ({response.status_code}).")
                    break
                body = response.json() if response.content else {}
                data = body.get("data") if isinstance(body, dict) else []
                if not isinstance(data, list):
                    break
                local_rows.extend([row for row in data if isinstance(row, dict)])

                # stop early if we've moved past window
                oldest_seen: datetime | None = None
                for row in data:
                    created = _parse_iso_datetime(row.get("created_time"))
                    if created is None:
                        created = _parse_iso_datetime(row.get("updated_time"))
                    if created is None:
                        continue
                    if oldest_seen is None or created < oldest_seen:
                        oldest_seen = created
                if oldest_seen and oldest_seen < cutoff:
                    break

                paging = body.get("paging") if isinstance(body, dict) else {}
                next_value = paging.get("next") if isinstance(paging, dict) else None
                next_url = str(next_value).strip() if isinstance(next_value, str) and next_value.strip() else None
                page_count += 1

            return local_rows, local_warnings

        post_fields = "id,created_time,updated_time,message,status_type,shares,reactions.summary(true),comments.summary(true)"
        video_fields = "id,created_time,updated_time,description,title,status,permalink_url"
        post_paths = ("posts", "published_posts", "feed")
        all_items: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        successful_path_count = 0

        for path_name in post_paths:
            rows, path_warnings = await fetch_edge(path_name, fields=post_fields, limit=100, max_pages=5)
            if rows:
                successful_path_count += 1
            warnings.extend(path_warnings)
            for row in rows:
                row_id = str(row.get("id") or "").strip()
                if not row_id or row_id in seen_ids:
                    continue
                seen_ids.add(row_id)
                row["_edge"] = path_name
                all_items.append(row)

        # Videos/Reels can be absent from plain post feeds on some pages.
        video_rows, video_warnings = await fetch_edge("videos", fields=video_fields, limit=100, max_pages=5)
        if video_rows:
            successful_path_count += 1
        warnings.extend(video_warnings)
        for row in video_rows:
            row_id = str(row.get("id") or "").strip()
            if not row_id or row_id in seen_ids:
                continue
            seen_ids.add(row_id)
            row["_edge"] = "videos"
            all_items.append(row)

        if successful_path_count == 0:
            return [], warnings or ["Facebook post fetch failed (all endpoints)."]

    entries: list[dict[str, Any]] = []
    dedupe_entries: set[str] = set()
    for item in all_items:
        created = _parse_iso_datetime(item.get("created_time")) or _parse_iso_datetime(item.get("updated_time"))
        if not created or created < cutoff:
            continue
        likes = _to_int(((item.get("reactions") or {}).get("summary") or {}).get("total_count"))
        comments = _to_int(((item.get("comments") or {}).get("summary") or {}).get("total_count"))
        shares = _to_int((item.get("shares") or {}).get("count"))
        impressions = max(0, likes + comments + shares)
        edge = str(item.get("_edge") or "")
        post_type = "facebook_reel" if edge == "videos" else "facebook_text"
        external_id = str(item.get("id") or "")
        entry_key = f"{external_id}:{created.isoformat()}:{post_type}"
        if entry_key in dedupe_entries:
            continue
        dedupe_entries.add(entry_key)
        entries.append(
            {
                "platform": "facebook",
                "post_type": post_type,
                "external_id": external_id,
                "published_at": created.isoformat(),
                "views": impressions,
                "impressions": impressions,
                "reach": impressions,
                "likes": likes,
                "comments": comments,
                "shares": shares,
                "saves": 0,
                "early_30m": None,
                "early_1h": None,
                "early_2h": None,
                "early_24h": None,
                "source": f"facebook_graph_{edge or 'posts'}",
            }
        )

    return entries, warnings


async def _fetch_instagram_recent_posts(*, days: int = 30) -> tuple[list[dict[str, Any]], list[str]]:
    creds = await resolve_meta_publish_credentials()
    if not creds.instagram_business_account_id or not creds.instagram_access_token:
        warning = "Instagram not configured for history sync."
        if creds.warnings:
            warning = f"{warning} {' '.join(creds.warnings)}"
        return [], [warning]

    cutoff = datetime.now(UTC) - timedelta(days=days)
    warnings: list[str] = list(creds.warnings)
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        rich_response = await client.get(
            f"https://graph.facebook.com/v25.0/{creds.instagram_business_account_id}/media",
            params={
                "access_token": creds.instagram_access_token,
                "fields": "id,caption,media_type,timestamp,like_count,comments_count",
                "limit": 100,
            },
        )
        if rich_response.status_code < 400:
            body = rich_response.json() if rich_response.content else {}
        else:
            rich_error = _graph_error_message(rich_response)
            fallback_response = await client.get(
                f"https://graph.facebook.com/v25.0/{creds.instagram_business_account_id}/media",
                params={
                    "access_token": creds.instagram_access_token,
                    "fields": "id,media_type,timestamp",
                    "limit": 100,
                },
            )
            if fallback_response.status_code >= 400:
                fallback_error = _graph_error_message(fallback_response) or rich_error
                if fallback_error:
                    return [], [f"Instagram media fetch failed ({fallback_response.status_code}): {fallback_error}"]
                return [], [f"Instagram media fetch failed ({fallback_response.status_code})."]
            body = fallback_response.json() if fallback_response.content else {}
            warnings.append("Instagram metrics fields were unavailable; synced timestamps only.")
            if rich_error:
                warnings.append(f"Instagram rich-field error: {rich_error}")

    entries: list[dict[str, Any]] = []
    for item in body.get("data", []):
        created = _parse_iso_datetime(item.get("timestamp"))
        if not created or created < cutoff:
            continue
        likes = _to_int(item.get("like_count"))
        comments = _to_int(item.get("comments_count"))
        media_type = str(item.get("media_type") or "").upper()
        post_type = "instagram_reel" if media_type == "REEL" else "instagram_image"
        impressions = max(0, likes + comments)
        entries.append(
            {
                "platform": "instagram",
                "post_type": post_type,
                "external_id": str(item.get("id") or ""),
                "published_at": created.isoformat(),
                "views": impressions,
                "impressions": impressions,
                "reach": impressions,
                "likes": likes,
                "comments": comments,
                "shares": 0,
                "saves": 0,
                "early_30m": None,
                "early_1h": None,
                "early_2h": None,
                "early_24h": None,
                "source": "instagram_graph",
            }
        )

    return entries, warnings


async def _fetch_tiktok_recent_posts(*, days: int = 30) -> tuple[list[dict[str, Any]], list[str]]:
    if not settings.tiktok_access_token.strip() and not settings.tiktok_refresh_token.strip():
        return [], ["TikTok not configured for history sync (missing TIKTOK_ACCESS_TOKEN / TIKTOK_REFRESH_TOKEN)."]

    cutoff = datetime.now(UTC) - timedelta(days=days)
    warnings: list[str] = []
    entries: list[dict[str, Any]] = []
    cursor = 0
    seen: set[str] = set()
    try:
        access_token = await ensure_tiktok_access_token()
    except TikTokPublishError as exc:
        return [], [f"TikTok auth unavailable for history sync: {exc}"]

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        for _ in range(10):
            response = await client.post(
                "https://open.tiktokapis.com/v2/video/list/",
                params={
                    "fields": "id,create_time,title,video_description,duration,share_url,view_count,like_count,comment_count,share_count",
                },
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                },
                json={"max_count": 20, "cursor": cursor},
            )
            if response.status_code >= 400:
                if response.status_code in {401, 403}:
                    try:
                        access_token = await ensure_tiktok_access_token(force_refresh=True)
                    except TikTokPublishError:
                        pass
                    retry_response = await client.post(
                        "https://open.tiktokapis.com/v2/video/list/",
                        params={
                            "fields": "id,create_time,title,video_description,duration,share_url,view_count,like_count,comment_count,share_count",
                        },
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Content-Type": "application/json; charset=UTF-8",
                        },
                        json={"max_count": 20, "cursor": cursor},
                    )
                    if retry_response.status_code < 400:
                        response = retry_response
                    else:
                        response = retry_response
                detail = ""
                try:
                    payload = response.json() if response.content else {}
                    if isinstance(payload, dict):
                        detail = _tiktok_error_message(payload)
                except ValueError:
                    detail = ""
                if detail:
                    return [], [f"TikTok video list failed ({response.status_code}): {detail}"]
                return [], [f"TikTok video list failed ({response.status_code}). Reconnect TikTok with video.list scope."]

            payload = response.json() if response.content else {}
            error_detail = _tiktok_error_message(payload) if isinstance(payload, dict) else ""
            if error_detail and "ok" not in error_detail.lower():
                return [], [f"TikTok video list failed: {error_detail}"]

            data = payload.get("data") if isinstance(payload, dict) else {}
            videos = data.get("videos") if isinstance(data, dict) else []
            if not isinstance(videos, list):
                break

            oldest_seen: datetime | None = None
            for item in videos:
                if not isinstance(item, dict):
                    continue
                external_id = str(item.get("id") or "").strip()
                if not external_id or external_id in seen:
                    continue
                seen.add(external_id)
                created_ts = item.get("create_time")
                created: datetime | None = None
                if isinstance(created_ts, (int, float)):
                    created = datetime.fromtimestamp(float(created_ts), tz=UTC)
                elif isinstance(created_ts, str) and created_ts.strip():
                    created = _parse_iso_datetime(created_ts)
                    if created is None and created_ts.isdigit():
                        created = datetime.fromtimestamp(float(created_ts), tz=UTC)
                if not created:
                    continue
                if oldest_seen is None or created < oldest_seen:
                    oldest_seen = created
                if created < cutoff:
                    continue

                views = _to_int(item.get("view_count"))
                likes = _to_int(item.get("like_count"))
                comments = _to_int(item.get("comment_count"))
                shares = _to_int(item.get("share_count"))
                entries.append(
                    {
                        "platform": "tiktok",
                        "post_type": "tiktok_short",
                        "external_id": external_id,
                        "published_at": created.isoformat(),
                        "views": views,
                        "impressions": max(views, likes + comments + shares),
                        "reach": max(views, likes + comments + shares),
                        "likes": likes,
                        "comments": comments,
                        "shares": shares,
                        "saves": 0,
                        "early_30m": None,
                        "early_1h": None,
                        "early_2h": None,
                        "early_24h": None,
                        "source": "tiktok_video_list",
                    }
                )

            if oldest_seen and oldest_seen < cutoff:
                break

            has_more = bool(data.get("has_more")) if isinstance(data, dict) else False
            next_cursor = data.get("cursor") if isinstance(data, dict) else None
            if not has_more or next_cursor is None:
                break
            cursor = int(next_cursor)

    if not entries:
        warnings.append("TikTok sync returned no posts in the selected window. Reconnect with video.list scope if needed.")
    return entries, warnings


@router.post("/projects/{project_id}/metrics/sync-last-30-days")
async def sync_last_30_days_publish_metrics(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    days = 30
    cutoff = datetime.now(UTC) - timedelta(days=days)
    warnings: list[str] = []

    youtube_rows, youtube_warnings = await _fetch_youtube_recent_posts(days=days)
    facebook_rows, facebook_warnings = await _fetch_facebook_recent_posts(days=days)
    instagram_rows, instagram_warnings = await _fetch_instagram_recent_posts(days=days)
    tiktok_rows, tiktok_warnings = await _fetch_tiktok_recent_posts(days=days)

    warnings.extend(youtube_warnings)
    warnings.extend(facebook_warnings)
    warnings.extend(instagram_warnings)
    warnings.extend(tiktok_warnings)

    warnings_by_platform: dict[str, list[str]] = {
        "youtube": youtube_warnings,
        "facebook": facebook_warnings,
        "instagram": instagram_warnings,
        "tiktok": tiktok_warnings,
    }

    counts_by_platform = {
        "youtube": len(youtube_rows),
        "facebook": len(facebook_rows),
        "instagram": len(instagram_rows),
        "tiktok": len(tiktok_rows),
    }

    fetched_rows = youtube_rows + facebook_rows + instagram_rows + tiktok_rows

    draft = await _latest_draft(db, project_id=project_id, draft_kind="publish_metrics")
    payload = draft.payload_json if draft and isinstance(draft.payload_json, dict) else {}
    existing_entries = payload.get("entries") if isinstance(payload.get("entries"), list) else []

    def _entry_dt(entry: dict[str, Any]) -> datetime | None:
        return _parse_iso_datetime(entry.get("published_at"))

    replace_platforms = {"youtube", "facebook", "instagram", "tiktok"}
    kept_entries: list[dict[str, Any]] = []
    for entry in existing_entries:
        if not isinstance(entry, dict):
            continue
        platform = str(entry.get("platform") or "").strip().lower()
        published = _entry_dt(entry)
        if platform in replace_platforms and published and published >= cutoff:
            continue
        kept_entries.append(entry)

    dedupe: dict[str, dict[str, Any]] = {}
    for entry in kept_entries + fetched_rows:
        platform = str(entry.get("platform") or "")
        external_id = str(entry.get("external_id") or "")
        published_at = str(entry.get("published_at") or "")
        key = f"{platform}:{external_id}:{published_at}"
        dedupe[key] = entry

    merged_entries = list(dedupe.values())
    merged_entries.sort(key=lambda item: str(item.get("published_at") or ""), reverse=True)

    next_payload = {
        **payload,
        "window_days": days,
        "synced_at": datetime.now(UTC).isoformat(),
        "entries": merged_entries,
    }

    if draft:
        draft.payload_json = next_payload
    else:
        db.add(ProjectContentDraft(project_id=project_id, draft_kind="publish_metrics", payload_json=next_payload))

    await db.flush()

    return {
        "project_id": project_id,
        "window_days": days,
        "synced_platforms": ["youtube", "facebook", "instagram", "tiktok"],
        "fetched_count": len(fetched_rows),
        "counts_by_platform": counts_by_platform,
        "warnings_by_platform": warnings_by_platform,
        "warnings": warnings,
    }


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


@router.post("/projects/{project_id}/youtube-video")
async def publish_project_to_youtube(
    project_id: str,
    body: YouTubePublishRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    sermon_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("sermon_master", "source_video"),
    )
    if not sermon_asset:
        raise HTTPException(
            status_code=400,
            detail="No local sermon video file exists for this project. Rebuild the sermon master or re-upload the source asset before publishing to YouTube.",
        )

    thumbnail_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("sermon_thumbnail",),
    )

    packaging_draft = await _latest_draft(db, project_id=project_id, draft_kind="packaging")
    metadata_draft = await _latest_draft(db, project_id=project_id, draft_kind="metadata")

    packaging_payload = packaging_draft.payload_json if packaging_draft else {}
    metadata_payload = metadata_draft.payload_json if metadata_draft else {}
    metadata = metadata_payload.get("metadata") if isinstance(metadata_payload, dict) else {}

    title = body.title.strip() or str(packaging_payload.get("title") or project.title).strip()
    description = body.description.strip() or str(packaging_payload.get("description") or "").strip()
    tags = [str(tag).strip() for tag in (body.tags or metadata.get("keywords") or []) if str(tag).strip()]

    try:
        return await publish_youtube_video(
            video_path=_existing_asset_path(sermon_asset) or _asset_path(sermon_asset),
            title=title,
            description=description,
            tags=tags,
            privacy_status=body.privacy_status,
            publish_at=body.publish_at,
            thumbnail_path=_existing_asset_path(thumbnail_asset) if thumbnail_asset else None,
        )
    except YouTubePublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/youtube-short")
async def publish_project_short_to_youtube(
    project_id: str,
    body: YouTubePublishRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    reel_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("final_reel", "reel_video"),
    )
    if not reel_asset:
        raise HTTPException(
            status_code=400,
            detail="No local reel video file exists for this project. Export the final reel before publishing a YouTube Short.",
        )

    reel_thumbnail_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("reel_thumbnail",),
    )
    reel_draft = await _latest_draft(db, project_id=project_id, draft_kind="reel")
    reel_payload = reel_draft.payload_json if reel_draft else {}
    platforms = reel_payload.get("platforms") if isinstance(reel_payload, dict) else {}
    youtube_payload = platforms.get("youtube") if isinstance(platforms, dict) else {}

    title = body.title.strip() or str(youtube_payload.get("title") or project.title).strip()
    description = body.description.strip() or str(youtube_payload.get("description") or "").strip()
    tags = [str(tag).strip() for tag in (body.tags or youtube_payload.get("tags") or []) if str(tag).strip()]

    try:
        return await publish_youtube_video(
            video_path=_existing_asset_path(reel_asset) or _asset_path(reel_asset),
            title=title,
            description=description,
            tags=tags,
            privacy_status=body.privacy_status,
            publish_at=body.publish_at,
            thumbnail_path=_existing_asset_path(reel_thumbnail_asset) if reel_thumbnail_asset else None,
        )
    except YouTubePublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/facebook-post")
async def publish_project_to_facebook_post(
    project_id: str,
    body: FacebookTextPublishRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    message = body.message.strip()
    if not message:
        facebook_draft = await _latest_draft(db, project_id=project_id, draft_kind="facebook")
        payload = facebook_draft.payload_json if facebook_draft else {}
        message = str(payload.get("post") or "").strip()

    try:
        return await publish_facebook_text_post(message=message)
    except FacebookPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/facebook-reel")
async def publish_project_to_facebook_reel(
    project_id: str,
    body: FacebookReelPublishRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    reel_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("final_reel", "reel_video"),
    )
    if not reel_asset:
        raise HTTPException(
            status_code=400,
            detail="No local reel video file exists for this project. Export the final reel before publishing to Facebook.",
        )

    reel_draft = await _latest_draft(db, project_id=project_id, draft_kind="reel")
    reel_payload = reel_draft.payload_json if reel_draft else {}
    platforms = reel_payload.get("platforms") if isinstance(reel_payload, dict) else {}
    facebook_payload = platforms.get("facebook") if isinstance(platforms, dict) else {}

    description = body.description.strip() or str(facebook_payload.get("description") or "").strip()
    title = body.title.strip() or str(facebook_payload.get("title") or project.title).strip()

    try:
        return await publish_facebook_reel(
            video_path=_existing_asset_path(reel_asset) or _asset_path(reel_asset),
            description=description,
            title=title,
        )
    except FacebookPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/instagram-reel")
async def publish_project_to_instagram_reel(
    project_id: str,
    body: InstagramReelPublishRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    reel_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("final_reel", "reel_video"),
    )
    if not reel_asset:
        raise HTTPException(
            status_code=400,
            detail="No local reel video file exists for this project. Export the final reel before publishing to Instagram.",
        )

    reel_thumbnail_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("reel_thumbnail",),
    )
    reel_draft = await _latest_draft(db, project_id=project_id, draft_kind="reel")
    reel_payload = reel_draft.payload_json if reel_draft else {}
    platforms = reel_payload.get("platforms") if isinstance(reel_payload, dict) else {}
    instagram_payload = platforms.get("instagram") if isinstance(platforms, dict) else {}

    caption = body.caption.strip() or str(instagram_payload.get("description") or "").strip()
    video_url = str(reel_asset.playback_url or f"{settings.api_url.rstrip('/')}/api/media/asset/{reel_asset.id}").strip()
    cover_url = (
        str(reel_thumbnail_asset.playback_url).strip()
        if reel_thumbnail_asset and reel_thumbnail_asset.playback_url
        else None
    )

    try:
        return await publish_instagram_reel(
            video_url=video_url,
            caption=caption,
            cover_url=cover_url,
        )
    except InstagramPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/instagram-post")
async def publish_project_to_instagram_post(
    project_id: str,
    body: InstagramImagePublishRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    image_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("sermon_thumbnail", "reel_thumbnail"),
    )
    if not image_asset:
        raise HTTPException(
            status_code=400,
            detail="No thumbnail asset exists for this project. Generate a sermon or reel thumbnail before publishing to Instagram.",
        )

    reel_draft = await _latest_draft(db, project_id=project_id, draft_kind="reel")
    reel_payload = reel_draft.payload_json if reel_draft else {}
    platforms = reel_payload.get("platforms") if isinstance(reel_payload, dict) else {}
    instagram_payload = platforms.get("instagram") if isinstance(platforms, dict) else {}

    caption = body.caption.strip() or str(instagram_payload.get("description") or "").strip() or project.title
    image_url = f"{settings.api_url.rstrip('/')}/api/media/asset/{image_asset.id}"

    try:
        return await publish_instagram_image_post(
            image_url=image_url,
            caption=caption,
        )
    except InstagramPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/tiktok-short")
async def publish_project_to_tiktok_short(
    project_id: str,
    body: TikTokShortPublishRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    reel_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("final_reel", "reel_video"),
    )
    if not reel_asset:
        raise HTTPException(
            status_code=400,
            detail="No local reel video file exists for this project. Export the final reel before publishing to TikTok.",
        )

    reel_draft = await _latest_draft(db, project_id=project_id, draft_kind="reel")
    reel_payload = reel_draft.payload_json if reel_draft else {}
    platforms = reel_payload.get("platforms") if isinstance(reel_payload, dict) else {}
    tiktok_payload = platforms.get("tiktok") if isinstance(platforms, dict) else {}

    title_parts = [
        body.title.strip(),
        body.description.strip(),
        str(tiktok_payload.get("title") or "").strip(),
        str(tiktok_payload.get("description") or "").strip(),
    ]
    publish_text = " ".join(part for part in title_parts if part).strip() or project.title

    try:
        return await publish_tiktok_video(
            video_path=_existing_asset_path(reel_asset) or _asset_path(reel_asset),
            title=publish_text,
        )
    except TikTokPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/projects/{project_id}/tiktok-photo")
async def publish_project_to_tiktok_photo(
    project_id: str,
    body: TikTokPhotoPublishRequest,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    image_asset = await _latest_existing_asset(
        db,
        project_id=project_id,
        asset_kinds=("reel_thumbnail", "sermon_thumbnail"),
    )
    if not image_asset:
        raise HTTPException(
            status_code=400,
            detail="No thumbnail asset exists for this project. Generate a reel or sermon thumbnail before publishing a TikTok photo post.",
        )

    reel_draft = await _latest_draft(db, project_id=project_id, draft_kind="reel")
    reel_payload = reel_draft.payload_json if reel_draft else {}
    platforms = reel_payload.get("platforms") if isinstance(reel_payload, dict) else {}
    tiktok_payload = platforms.get("tiktok") if isinstance(platforms, dict) else {}

    title = body.title.strip() or str(tiktok_payload.get("title") or "").strip() or project.title
    description = body.description.strip() or str(tiktok_payload.get("description") or "").strip()
    image_url = f"{settings.api_url.rstrip('/')}/api/media/asset/{image_asset.id}"

    try:
        return await publish_tiktok_photo_post(
            image_urls=[image_url],
            title=title,
            description=description,
        )
    except TikTokPublishError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc








