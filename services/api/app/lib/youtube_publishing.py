"""YouTube OAuth and publishing helpers."""

from __future__ import annotations

import mimetypes
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings

GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
YOUTUBE_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3"
YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube",
]


class YouTubePublishError(RuntimeError):
    """Raised when the YouTube auth or publish flow fails."""


def youtube_oauth_ready() -> bool:
    return bool(settings.youtube_client_id.strip() and settings.youtube_client_secret.strip())


def youtube_publish_ready() -> bool:
    return bool(
        settings.youtube_client_id.strip()
        and settings.youtube_client_secret.strip()
        and settings.youtube_refresh_token.strip()
    )


def build_youtube_oauth_url(*, redirect_uri: str, state: str | None = None) -> str:
    if not youtube_oauth_ready():
        raise YouTubePublishError("YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be configured before starting OAuth.")

    query = urlencode(
        {
            "client_id": settings.youtube_client_id.strip(),
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "consent",
            "scope": " ".join(YOUTUBE_SCOPES),
            "state": state or secrets.token_urlsafe(24),
        }
    )
    return f"{GOOGLE_AUTH_BASE}?{query}"


async def exchange_youtube_auth_code(*, code: str, redirect_uri: str) -> dict[str, Any]:
    if not youtube_oauth_ready():
        raise YouTubePublishError("YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be configured before exchanging an auth code.")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.youtube_client_id.strip(),
                "client_secret": settings.youtube_client_secret.strip(),
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )

    if response.status_code >= 400:
        raise YouTubePublishError(f"Google token exchange failed: {response.text}")

    payload = response.json()
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise YouTubePublishError("Google token exchange succeeded but no access token was returned.")

    channel = await get_authenticated_youtube_channel(access_token)
    return {
        "access_token": access_token,
        "refresh_token": str(payload.get("refresh_token") or "").strip(),
        "expires_in": payload.get("expires_in"),
        "scope": payload.get("scope"),
        "token_type": payload.get("token_type"),
        "channel": channel,
    }


async def refresh_youtube_access_token() -> str:
    if not youtube_publish_ready():
        raise YouTubePublishError(
            "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN must be configured before publishing to YouTube."
        )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.youtube_client_id.strip(),
                "client_secret": settings.youtube_client_secret.strip(),
                "refresh_token": settings.youtube_refresh_token.strip(),
                "grant_type": "refresh_token",
            },
        )

    if response.status_code >= 400:
        raise YouTubePublishError(f"Google access-token refresh failed: {response.text}")

    payload = response.json()
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise YouTubePublishError("Google token refresh succeeded but no access token was returned.")
    return access_token


async def get_authenticated_youtube_channel(access_token: str) -> dict[str, str]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{YOUTUBE_API_BASE}/channels",
            params={"part": "snippet", "mine": "true"},
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if response.status_code >= 400:
        raise YouTubePublishError(f"Unable to load authenticated YouTube channel: {response.text}")

    payload = response.json() or {}
    items = payload.get("items") or []
    if not items:
        raise YouTubePublishError("No YouTube channel was returned for the authenticated account.")

    channel = items[0]
    snippet = channel.get("snippet") or {}
    return {
        "id": str(channel.get("id") or "").strip(),
        "title": str(snippet.get("title") or "").strip(),
    }


def _youtube_video_metadata(
    *,
    title: str,
    description: str,
    tags: list[str],
    privacy_status: str,
    publish_at: str | None,
) -> dict[str, Any]:
    status: dict[str, Any] = {
        "privacyStatus": privacy_status,
        "selfDeclaredMadeForKids": False,
    }

    normalized_publish_at = (publish_at or "").strip()
    if normalized_publish_at:
        status["publishAt"] = normalized_publish_at

    return {
        "snippet": {
            "title": title.strip(),
            "description": description.strip(),
            "tags": tags,
            "categoryId": "22",
        },
        "status": status,
    }


async def _start_resumable_video_upload(
    *,
    access_token: str,
    file_path: Path,
    title: str,
    description: str,
    tags: list[str],
    privacy_status: str,
    publish_at: str | None,
) -> str:
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    metadata = _youtube_video_metadata(
        title=title,
        description=description,
        tags=tags,
        privacy_status=privacy_status,
        publish_at=publish_at,
    )

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{YOUTUBE_UPLOAD_BASE}/videos",
            params={"uploadType": "resumable", "part": "snippet,status"},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Length": str(file_path.stat().st_size),
                "X-Upload-Content-Type": content_type,
            },
            json=metadata,
        )

    if response.status_code >= 400:
        raise YouTubePublishError(f"Unable to start YouTube upload session: {response.text}")

    upload_url = response.headers.get("Location", "").strip()
    if not upload_url:
        raise YouTubePublishError("YouTube upload session started but no resumable upload URL was returned.")
    return upload_url


async def _upload_video_bytes(*, access_token: str, upload_url: str, file_path: Path) -> dict[str, Any]:
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    file_bytes = file_path.read_bytes()

    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.put(
            upload_url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": content_type,
                "Content-Length": str(len(file_bytes)),
            },
            content=file_bytes,
        )

    if response.status_code >= 400:
        raise YouTubePublishError(f"YouTube video upload failed: {response.text}")

    return response.json() or {}


async def _set_video_thumbnail(*, access_token: str, video_id: str, thumbnail_path: Path) -> dict[str, Any]:
    content_type = mimetypes.guess_type(thumbnail_path.name)[0] or "application/octet-stream"
    image_bytes = thumbnail_path.read_bytes()

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{YOUTUBE_UPLOAD_BASE}/thumbnails/set",
            params={"videoId": video_id},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": content_type,
            },
            content=image_bytes,
        )

    if response.status_code >= 400:
        raise YouTubePublishError(f"YouTube thumbnail upload failed: {response.text}")
    return response.json() or {}


async def publish_youtube_video(
    *,
    video_path: Path,
    title: str,
    description: str,
    tags: list[str],
    privacy_status: str = "private",
    publish_at: str | None = None,
    thumbnail_path: Path | None = None,
) -> dict[str, Any]:
    if not video_path.exists():
        raise YouTubePublishError(f"Video file not found: {video_path}")
    if not title.strip():
        raise YouTubePublishError("YouTube title is required before publishing.")
    if not description.strip():
        raise YouTubePublishError("YouTube description is required before publishing.")

    access_token = await refresh_youtube_access_token()
    channel = await get_authenticated_youtube_channel(access_token)
    upload_url = await _start_resumable_video_upload(
        access_token=access_token,
        file_path=video_path,
        title=title,
        description=description,
        tags=tags,
        privacy_status=privacy_status,
        publish_at=publish_at,
    )
    video_resource = await _upload_video_bytes(access_token=access_token, upload_url=upload_url, file_path=video_path)
    video_id = str(video_resource.get("id") or "").strip()
    if not video_id:
        raise YouTubePublishError("YouTube upload completed but no video ID was returned.")

    thumbnail_result = None
    if thumbnail_path and thumbnail_path.exists():
        thumbnail_result = await _set_video_thumbnail(access_token=access_token, video_id=video_id, thumbnail_path=thumbnail_path)

    snippet = video_resource.get("snippet") or {}
    status = video_resource.get("status") or {}
    published_at = snippet.get("publishedAt") or datetime.now(timezone.utc).isoformat()

    return {
        "video_id": video_id,
        "title": str(snippet.get("title") or title).strip(),
        "status": str(status.get("privacyStatus") or privacy_status).strip(),
        "channel_id": channel["id"],
        "channel_title": channel["title"],
        "watch_url": f"https://www.youtube.com/watch?v={video_id}",
        "studio_url": f"https://studio.youtube.com/video/{video_id}/edit",
        "published_at": published_at,
        "thumbnail": thumbnail_result,
        "raw": video_resource,
    }
