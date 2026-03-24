"""TikTok OAuth and publishing helpers."""

from __future__ import annotations

import mimetypes
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode, urlparse

import httpx

from app.config import settings

TIKTOK_AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/"
TIKTOK_VIDEO_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
TIKTOK_CONTENT_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/content/init/"
TIKTOK_STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"
DEFAULT_TIKTOK_SCOPE = "user.info.basic,user.info.profile,video.publish,video.upload"

_runtime_access_token: str | None = None
_runtime_refresh_token: str | None = None
_runtime_access_expires_at: datetime | None = None


class TikTokPublishError(RuntimeError):
    """Raised when TikTok auth or publish setup fails."""


def _raise_from_response(response: httpx.Response, body: dict | None = None) -> None:
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, dict):
        message = error.get("message") or error.get("description")
        if error.get("code") and error.get("code") != "ok":
            raise TikTokPublishError(message or f"TikTok request failed ({error.get('code')}).")
    if response.status_code >= 400:
        raise TikTokPublishError(f"TikTok request failed ({response.status_code}).")


def _video_mime_type(video_path: Path) -> str:
    return mimetypes.guess_type(video_path.name)[0] or "video/mp4"


def _public_image_url(url: str) -> str:
    candidate = url.strip()
    if not candidate:
        raise TikTokPublishError("TikTok photo posting requires a public image URL.")
    parsed = urlparse(candidate)
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1"}:
        raise TikTokPublishError(
            "TikTok photo posting requires a publicly reachable image URL. Localhost media cannot be fetched by TikTok."
        )
    return candidate


def tiktok_oauth_ready() -> bool:
    return bool(settings.tiktok_client_key.strip() and settings.tiktok_client_secret.strip())


def tiktok_publish_ready() -> bool:
    return bool(settings.tiktok_open_id.strip() and (settings.tiktok_access_token.strip() or settings.tiktok_refresh_token.strip()))


def _current_access_token() -> str:
    return (_runtime_access_token or settings.tiktok_access_token).strip()


def _current_refresh_token() -> str:
    return (_runtime_refresh_token or settings.tiktok_refresh_token).strip()


def _access_token_needs_refresh() -> bool:
    if not _current_access_token():
        return True
    if _runtime_access_expires_at is None:
        return False
    return _runtime_access_expires_at <= datetime.now(UTC) + timedelta(minutes=5)


async def refresh_tiktok_access_token() -> dict:
    if not tiktok_oauth_ready():
        raise TikTokPublishError("Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET before refreshing TikTok token.")
    refresh_token = _current_refresh_token()
    if not refresh_token:
        raise TikTokPublishError("Set TIKTOK_REFRESH_TOKEN before refreshing TikTok token.")

    payload = {
        "client_key": settings.tiktok_client_key.strip(),
        "client_secret": settings.tiktok_client_secret.strip(),
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        response = await client.post(
            TIKTOK_TOKEN_URL,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    try:
        body = response.json()
    except ValueError as exc:
        raise TikTokPublishError(f"TikTok returned a non-JSON token refresh response ({response.status_code}).") from exc

    error = body.get("error")
    if response.status_code >= 400 or error:
        if isinstance(error, dict):
            message = error.get("message") or error.get("description")
        else:
            message = body.get("error_description") or body.get("message")
        raise TikTokPublishError(message or f"TikTok token refresh failed ({response.status_code}).")

    data = body.get("data") if isinstance(body.get("data"), dict) else body
    access_token = str(data.get("access_token") or "").strip()
    next_refresh_token = str(data.get("refresh_token") or refresh_token).strip()
    expires_in = int(data.get("expires_in") or 0)
    if not access_token:
        raise TikTokPublishError("TikTok token refresh did not return access_token.")

    global _runtime_access_token, _runtime_refresh_token, _runtime_access_expires_at
    _runtime_access_token = access_token
    _runtime_refresh_token = next_refresh_token
    _runtime_access_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in) if expires_in > 0 else None
    return {
        "access_token": access_token,
        "refresh_token": next_refresh_token,
        "expires_in": expires_in,
    }


async def ensure_tiktok_access_token(*, force_refresh: bool = False) -> str:
    token = _current_access_token()
    if force_refresh or _access_token_needs_refresh():
        try:
            refreshed = await refresh_tiktok_access_token()
            token = str(refreshed.get("access_token") or "").strip()
        except TikTokPublishError:
            # fall back to current token if we at least have one
            if not token:
                raise
    if not token:
        raise TikTokPublishError("Set TIKTOK_ACCESS_TOKEN (or TIKTOK_REFRESH_TOKEN) before publishing to TikTok.")
    return token


def build_tiktok_oauth_url(*, redirect_uri: str, state: str, scope: str = DEFAULT_TIKTOK_SCOPE) -> str:
    if not tiktok_oauth_ready():
        raise TikTokPublishError("Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET before starting TikTok OAuth.")

    host = (urlparse(redirect_uri).hostname or "").lower()
    if host in {"localhost", "127.0.0.1"}:
        raise TikTokPublishError("TikTok does not support localhost redirect URIs. Use a public callback URL.")

    configured_scope = (settings.tiktok_oauth_scope or "").strip() or scope
    query = urlencode(
        {
            "client_key": settings.tiktok_client_key.strip(),
            "response_type": "code",
            "scope": configured_scope,
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )
    return f"{TIKTOK_AUTH_BASE}?{query}"


async def exchange_tiktok_auth_code(*, code: str, redirect_uri: str) -> dict:
    if not tiktok_oauth_ready():
        raise TikTokPublishError("Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET before exchanging a TikTok auth code.")

    payload = {
        "client_key": settings.tiktok_client_key.strip(),
        "client_secret": settings.tiktok_client_secret.strip(),
        "code": code.strip(),
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri.strip(),
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        response = await client.post(
            TIKTOK_TOKEN_URL,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    try:
        body = response.json()
    except ValueError as exc:
        raise TikTokPublishError(f"TikTok returned a non-JSON response ({response.status_code}).") from exc

    error = body.get("error")
    if response.status_code >= 400 or error:
        if isinstance(error, dict):
            message = error.get("message") or error.get("description")
        else:
            message = body.get("error_description") or body.get("message")
        raise TikTokPublishError(message or f"TikTok token exchange failed ({response.status_code}).")

    data = body.get("data") if isinstance(body.get("data"), dict) else body
    return {
        "access_token": data.get("access_token"),
        "expires_in": data.get("expires_in"),
        "open_id": data.get("open_id"),
        "refresh_token": data.get("refresh_token"),
        "refresh_expires_in": data.get("refresh_expires_in"),
        "scope": data.get("scope"),
        "token_type": data.get("token_type"),
    }


async def query_tiktok_creator_info() -> dict:
    if not tiktok_publish_ready():
        raise TikTokPublishError("Set TIKTOK_ACCESS_TOKEN and TIKTOK_OPEN_ID before querying TikTok creator info.")
    access_token = await ensure_tiktok_access_token()

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        response = await client.post(
            TIKTOK_CREATOR_INFO_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            json={},
        )

    try:
        body = response.json()
    except ValueError as exc:
        raise TikTokPublishError(f"TikTok returned a non-JSON creator info response ({response.status_code}).") from exc

    _raise_from_response(response, body)
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    return data


async def _init_tiktok_video_post(*, title: str, video_path: Path, privacy_level: str, video_cover_timestamp_ms: int) -> dict:
    access_token = await ensure_tiktok_access_token()
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        response = await client.post(
            TIKTOK_VIDEO_INIT_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            json={
                "post_info": {
                    "title": title,
                    "privacy_level": privacy_level,
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False,
                    "video_cover_timestamp_ms": video_cover_timestamp_ms,
                },
                "source_info": {
                    "source": "FILE_UPLOAD",
                    "video_size": video_path.stat().st_size,
                    "chunk_size": video_path.stat().st_size,
                    "total_chunk_count": 1,
                },
            },
        )

    try:
        body = response.json()
    except ValueError as exc:
        raise TikTokPublishError(f"TikTok returned a non-JSON post init response ({response.status_code}).") from exc

    _raise_from_response(response, body)
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    if not data.get("publish_id"):
        raise TikTokPublishError("TikTok did not return a publish_id for the direct post request.")
    if not data.get("upload_url"):
        raise TikTokPublishError("TikTok did not return an upload_url for the direct post request.")
    return data


async def _upload_tiktok_video(*, upload_url: str, video_path: Path) -> None:
    video_size = video_path.stat().st_size
    if video_size <= 0:
        raise TikTokPublishError("TikTok video upload requires a non-empty file.")

    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
        response = await client.put(
            upload_url,
            headers={
                "Content-Range": f"bytes 0-{video_size - 1}/{video_size}",
                "Content-Type": _video_mime_type(video_path),
            },
            content=video_path.read_bytes(),
        )

    if response.status_code >= 400:
        raise TikTokPublishError(f"TikTok upload failed ({response.status_code}).")


async def fetch_tiktok_post_status(*, publish_id: str) -> dict:
    access_token = await ensure_tiktok_access_token()
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        response = await client.post(
            TIKTOK_STATUS_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            json={"publish_id": publish_id},
        )

    try:
        body = response.json()
    except ValueError as exc:
        raise TikTokPublishError(f"TikTok returned a non-JSON post status response ({response.status_code}).") from exc

    _raise_from_response(response, body)
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    return data


async def publish_tiktok_video(*, video_path: Path, title: str) -> dict:
    if not tiktok_publish_ready():
        raise TikTokPublishError("Set TIKTOK_ACCESS_TOKEN and TIKTOK_OPEN_ID before publishing to TikTok.")
    if not video_path.exists():
        raise TikTokPublishError("TikTok publish requires a local video file.")

    creator_info = await query_tiktok_creator_info()
    privacy_options = creator_info.get("privacy_level_options") if isinstance(creator_info, dict) else None
    resolved_privacy = (
        "SELF_ONLY"
        if isinstance(privacy_options, list) and "SELF_ONLY" in privacy_options
        else (privacy_options[0] if isinstance(privacy_options, list) and privacy_options else "SELF_ONLY")
    )

    safe_title = title.strip()
    if not safe_title:
        safe_title = "New post from Amplify"
    safe_title = safe_title[:150]

    init_data = await _init_tiktok_video_post(
        title=safe_title,
        video_path=video_path,
        privacy_level=resolved_privacy,
        video_cover_timestamp_ms=1000,
    )
    await _upload_tiktok_video(upload_url=str(init_data["upload_url"]), video_path=video_path)
    publish_id = str(init_data["publish_id"])

    status_data: dict | None = None
    try:
        status_data = await fetch_tiktok_post_status(publish_id=publish_id)
    except TikTokPublishError:
        status_data = None

    return {
        "publish_id": publish_id,
        "status": str((status_data or {}).get("status") or "PROCESSING").upper(),
        "privacy_level": resolved_privacy,
        "title": safe_title,
        "creator_username": creator_info.get("creator_username"),
        "max_video_post_duration_sec": creator_info.get("max_video_post_duration_sec"),
        "status_raw": status_data,
    }


async def publish_tiktok_photo_post(*, image_urls: list[str], title: str, description: str) -> dict:
    if not tiktok_publish_ready():
        raise TikTokPublishError("Set TIKTOK_ACCESS_TOKEN and TIKTOK_OPEN_ID before publishing to TikTok.")
    if not image_urls:
        raise TikTokPublishError("TikTok photo posting requires at least one public image URL.")

    creator_info = await query_tiktok_creator_info()
    privacy_options = creator_info.get("privacy_level_options") if isinstance(creator_info, dict) else None
    resolved_privacy = (
        "SELF_ONLY"
        if isinstance(privacy_options, list) and "SELF_ONLY" in privacy_options
        else (privacy_options[0] if isinstance(privacy_options, list) and privacy_options else "SELF_ONLY")
    )

    clean_images: list[str] = []
    for url in image_urls:
        parsed = _public_image_url(url)
        clean_images.append(parsed)

    access_token = await ensure_tiktok_access_token()
    payload = {
        "post_info": {
            "title": (title or "").strip()[:90],
            "description": (description or "").strip()[:4000],
            "privacy_level": resolved_privacy,
            "disable_comment": False,
            "auto_add_music": True,
        },
        "source_info": {
            "source": "PULL_FROM_URL",
            "photo_cover_index": 1,
            "photo_images": clean_images,
        },
        "post_mode": "DIRECT_POST",
        "media_type": "PHOTO",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0)) as client:
        response = await client.post(
            TIKTOK_CONTENT_INIT_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            json=payload,
        )

    try:
        body = response.json()
    except ValueError as exc:
        raise TikTokPublishError(f"TikTok returned a non-JSON photo post response ({response.status_code}).") from exc

    _raise_from_response(response, body)
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    publish_id = str(data.get("publish_id") or "").strip()
    if not publish_id:
        raise TikTokPublishError("TikTok did not return a publish_id for the photo post.")

    status_data: dict | None = None
    try:
        status_data = await fetch_tiktok_post_status(publish_id=publish_id)
    except TikTokPublishError:
        status_data = None

    return {
        "publish_id": publish_id,
        "status": str((status_data or {}).get("status") or "PROCESSING").upper(),
        "privacy_level": resolved_privacy,
        "title": (title or "").strip(),
        "description": (description or "").strip(),
        "creator_username": creator_info.get("creator_username"),
        "status_raw": status_data,
    }
