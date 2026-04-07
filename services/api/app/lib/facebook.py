"""Facebook Graph API publishing helpers.

Uploads a video as a Facebook Reel using the 3-step resumable upload flow
against the Graph Video API v18.0.

Required env vars:
  FACEBOOK_PAGE_ACCESS_TOKEN
  FACEBOOK_PAGE_ID
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from app.config import settings


class FacebookPublishError(RuntimeError):
    """Raised when a Facebook publish operation fails."""


# ------------------------------------------------------------------ #
# Constants
# ------------------------------------------------------------------ #

_GRAPH_VIDEO_BASE = "https://graph-video.facebook.com/v18.0"


# ------------------------------------------------------------------ #
# Reel upload
# ------------------------------------------------------------------ #


async def upload_reel(
    *,
    file_path: Path,
    title: str,
    description: str,
    hashtags: list[str] | None = None,
) -> dict[str, Any]:
    """
    Upload a video file as a Facebook Reel using the 3-step resumable flow.

    Steps:
      1. Initialize — obtain ``video_id`` and ``upload_url``.
      2. Upload binary — PUT raw bytes to ``upload_url``.
      3. Publish — finalize with title/description metadata.

    Returns the Graph API response dict from the publish step.
    """
    token = settings.facebook_page_access_token.strip()
    page_id = settings.facebook_page_id.strip()

    if not token or not page_id:
        raise FacebookPublishError(
            "Facebook credentials not configured. "
            "Set FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID in env."
        )

    if not file_path.exists():
        raise FacebookPublishError(f"Video file not found: {file_path}")

    file_size = file_path.stat().st_size
    reels_url = f"{_GRAPH_VIDEO_BASE}/{page_id}/video_reels"

    # ---- Step 1: initialize upload ----
    async with httpx.AsyncClient(timeout=30.0) as client:
        init_resp = await client.post(
            reels_url,
            data={
                "upload_phase": "start",
                "access_token": token,
            },
        )

    if init_resp.status_code != 200:
        raise FacebookPublishError(
            f"Facebook Reel upload initialization failed: "
            f"{init_resp.status_code} {init_resp.text}"
        )

    init_data = init_resp.json()
    video_id = init_data.get("video_id")
    upload_url = init_data.get("upload_url")

    if not video_id or not upload_url:
        raise FacebookPublishError(
            f"Facebook did not return video_id/upload_url: {init_data}"
        )

    # ---- Step 2: upload binary ----
    async with httpx.AsyncClient(timeout=3600.0) as client:
        with open(file_path, "rb") as f:
            video_bytes = f.read()

        upload_resp = await client.put(
            upload_url,
            headers={
                "Authorization": f"OAuth {token}",
                "offset": "0",
                "file_size": str(file_size),
            },
            content=video_bytes,
        )

    if upload_resp.status_code not in (200, 204):
        raise FacebookPublishError(
            f"Facebook Reel binary upload failed: "
            f"{upload_resp.status_code} {upload_resp.text}"
        )

    # ---- Step 3: publish ----
    caption_parts = [description]
    if hashtags:
        caption_parts.append(" ".join(f"#{h.lstrip('#')}" for h in hashtags))
    full_description = "\n\n".join(p for p in caption_parts if p)

    async with httpx.AsyncClient(timeout=60.0) as client:
        publish_resp = await client.post(
            reels_url,
            data={
                "upload_phase": "finish",
                "video_id": video_id,
                "title": title,
                "description": full_description,
                "access_token": token,
            },
        )

    if publish_resp.status_code != 200:
        raise FacebookPublishError(
            f"Facebook Reel publish failed: "
            f"{publish_resp.status_code} {publish_resp.text}"
        )

    return publish_resp.json()
