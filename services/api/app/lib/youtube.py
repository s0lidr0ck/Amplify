"""YouTube Data API v3 publishing helpers.

Uploads a video + optional thumbnail to YouTube using OAuth2 credentials
stored as environment variables. The server refreshes the access token
automatically before each upload.

Required env vars:
  YOUTUBE_CLIENT_ID
  YOUTUBE_CLIENT_SECRET
  YOUTUBE_REFRESH_TOKEN
"""

from __future__ import annotations

import io
import json
import mimetypes
from pathlib import Path
from typing import Any

import httpx
from PIL import Image

from app.config import settings


class YouTubePublishError(RuntimeError):
    """Raised when a YouTube publish operation fails."""


# ------------------------------------------------------------------ #
# Token management
# ------------------------------------------------------------------ #

_TOKEN_URL = "https://oauth2.googleapis.com/token"


async def _get_access_token() -> str:
    """Exchange the stored refresh token for a fresh access token."""
    client_id = settings.youtube_client_id.strip()
    client_secret = settings.youtube_client_secret.strip()
    refresh_token = settings.youtube_refresh_token.strip()

    if not all([client_id, client_secret, refresh_token]):
        raise YouTubePublishError(
            "YouTube OAuth credentials not configured. "
            "Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN in env."
        )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            _TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
            },
        )

    if response.status_code != 200:
        raise YouTubePublishError(
            f"Failed to refresh YouTube access token: {response.status_code} {response.text}"
        )

    return response.json()["access_token"]


# ------------------------------------------------------------------ #
# Resumable upload
# ------------------------------------------------------------------ #

_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
_THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
_CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB chunks


def _stream_file(file_path: Path, chunk_size: int = _CHUNK_SIZE):
    """Yield chunks of a file for streaming upload."""
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            yield chunk


async def upload_video(
    *,
    file_path: Path,
    title: str,
    description: str,
    tags: list[str] | None = None,
    privacy_status: str = "public",
    category_id: str = "22",  # "People & Blogs" — common for church content
    notify_subscribers: bool = True,
) -> dict[str, Any]:
    """
    Upload a video file to YouTube using the resumable upload protocol.

    Returns the YouTube video resource dict (includes ``id``, ``snippet``, etc.).
    """
    if not file_path.exists():
        raise YouTubePublishError(f"Video file not found: {file_path}")

    access_token = await _get_access_token()
    file_size = file_path.stat().st_size
    content_type = mimetypes.guess_type(str(file_path))[0] or "video/mp4"

    body: dict[str, Any] = {
        "snippet": {
            "title": title,
            "description": description,
            "tags": tags or [],
            "categoryId": category_id,
        },
        "status": {
            "privacyStatus": privacy_status,
            "selfDeclaredMadeForKids": False,
        },
    }

    # ---- Step 1: initiate resumable upload ----
    async with httpx.AsyncClient(timeout=60.0) as client:
        init_resp = await client.post(
            _UPLOAD_URL,
            params={"uploadType": "resumable", "part": "snippet,status"},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": content_type,
                "X-Upload-Content-Length": str(file_size),
            },
            content=json.dumps(body).encode(),
        )

    if init_resp.status_code != 200:
        raise YouTubePublishError(
            f"YouTube upload initiation failed: {init_resp.status_code} {init_resp.text}"
        )

    upload_uri = init_resp.headers.get("Location")
    if not upload_uri:
        raise YouTubePublishError("YouTube did not return an upload URI.")

    # ---- Step 2: stream the file in chunks ----
    uploaded = 0
    final_response: dict[str, Any] | None = None

    async with httpx.AsyncClient(timeout=3600.0) as client:
        with open(file_path, "rb") as f:
            while uploaded < file_size:
                chunk = f.read(_CHUNK_SIZE)
                if not chunk:
                    break
                chunk_end = uploaded + len(chunk) - 1
                headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Content-Range": f"bytes {uploaded}-{chunk_end}/{file_size}",
                    "Content-Type": content_type,
                }
                resp = await client.put(upload_uri, content=chunk, headers=headers)

                if resp.status_code in (200, 201):
                    final_response = resp.json()
                    break
                elif resp.status_code == 308:
                    # Resume Incomplete — update offset from Range header
                    range_header = resp.headers.get("Range", "")
                    if range_header:
                        uploaded = int(range_header.split("-")[1]) + 1
                    else:
                        uploaded += len(chunk)
                else:
                    raise YouTubePublishError(
                        f"YouTube chunk upload failed at byte {uploaded}: "
                        f"{resp.status_code} {resp.text}"
                    )

    if final_response is None:
        raise YouTubePublishError("YouTube upload completed but no response received.")

    return final_response


async def upload_thumbnail(*, video_id: str, file_path: Path) -> dict[str, Any]:
    """
    Set a custom thumbnail on a YouTube video.

    The channel must be verified for custom thumbnails to work.
    YouTube requires thumbnails to be under 2 MB — this function
    automatically resizes/compresses if the file exceeds that limit.
    Returns the thumbnail resource dict.
    """
    _YT_THUMB_MAX_BYTES = 2 * 1024 * 1024  # 2 MB

    if not file_path.exists():
        raise YouTubePublishError(f"Thumbnail file not found: {file_path}")

    # Read and compress if needed
    with open(file_path, "rb") as f:
        image_bytes = f.read()

    if len(image_bytes) > _YT_THUMB_MAX_BYTES:
        # Resize and re-compress to JPEG until under the limit
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        quality = 88
        scale = 1.0
        while quality >= 40:
            buf = io.BytesIO()
            w = int(img.width * scale)
            h = int(img.height * scale)
            resized = img.resize((w, h), Image.LANCZOS) if scale < 1.0 else img
            resized.save(buf, format="JPEG", quality=quality, optimize=True)
            image_bytes = buf.getvalue()
            if len(image_bytes) <= _YT_THUMB_MAX_BYTES:
                break
            # Reduce quality first, then scale down
            if quality > 60:
                quality -= 10
            else:
                quality -= 10
                scale *= 0.85

    content_type = "image/jpeg" if len(image_bytes) < len(open(file_path, "rb").read()) else (
        mimetypes.guess_type(str(file_path))[0] or "image/jpeg"
    )

    access_token = await _get_access_token()

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            _THUMBNAIL_URL,
            params={"videoId": video_id},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": content_type,
            },
            content=image_bytes,
        )

    if response.status_code not in (200, 204):
        raise YouTubePublishError(
            f"Thumbnail upload failed: {response.status_code} {response.text}"
        )

    return response.json() if response.content else {}
