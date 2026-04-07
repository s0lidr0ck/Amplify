"""Instagram Graph API publishing helpers.

Uploads a video as an Instagram Reel using the container/poll/publish flow
against the Facebook Graph API v18.0.

Important: the video must be publicly accessible via URL. This module builds
the URL from the Amplify media asset endpoint.

Required env vars:
  INSTAGRAM_BUSINESS_ACCOUNT_ID
  INSTAGRAM_ACCESS_TOKEN
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.config import settings


class InstagramPublishError(RuntimeError):
    """Raised when an Instagram publish operation fails."""


# ------------------------------------------------------------------ #
# Constants
# ------------------------------------------------------------------ #

_GRAPH_BASE = "https://graph.facebook.com/v18.0"
_MEDIA_BASE_URL = "https://amplify-amplify-api.ktfbiu.easypanel.host/api/media/asset"

_POLL_INTERVAL_SECONDS = 5
_POLL_TIMEOUT_SECONDS = 600  # 10 minutes


# ------------------------------------------------------------------ #
# Reel upload
# ------------------------------------------------------------------ #


async def upload_reel(
    *,
    media_asset_id: str,
    title: str,
    description: str,
    hashtags: list[str] | None = None,
) -> dict[str, Any]:
    """
    Upload a video as an Instagram Reel using the container approach.

    Steps:
      1. Create container — POST media endpoint with the video URL.
      2. Poll status — wait until ``status_code == "FINISHED"``.
      3. Publish — POST media_publish with the container ID.

    The video is fetched by Instagram from the Amplify media asset URL:
    ``https://amplify-amplify-api.ktfbiu.easypanel.host/api/media/asset/{asset_id}``

    Returns the final publish response dict (includes ``id`` = media_id).
    """
    ig_account_id = settings.instagram_business_account_id.strip()
    token = settings.instagram_access_token.strip()

    if not ig_account_id or not token:
        raise InstagramPublishError(
            "Instagram credentials not configured. "
            "Set INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN in env."
        )

    video_url = f"{_MEDIA_BASE_URL}/{media_asset_id}"

    # Build caption: title + description + hashtags
    hashtag_str = " ".join(f"#{h.lstrip('#')}" for h in hashtags) if hashtags else ""
    caption = f"{title}\n\n{description}\n\n{hashtag_str}".strip()

    # ---- Step 1: create container ----
    async with httpx.AsyncClient(timeout=60.0) as client:
        container_resp = await client.post(
            f"{_GRAPH_BASE}/{ig_account_id}/media",
            params={
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption,
                "access_token": token,
            },
        )

    if container_resp.status_code != 200:
        raise InstagramPublishError(
            f"Instagram container creation failed: "
            f"{container_resp.status_code} {container_resp.text}"
        )

    container_data = container_resp.json()
    container_id = container_data.get("id")

    if not container_id:
        raise InstagramPublishError(
            f"Instagram did not return a container ID: {container_data}"
        )

    # ---- Step 2: poll until FINISHED ----
    elapsed = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        while elapsed < _POLL_TIMEOUT_SECONDS:
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)
            elapsed += _POLL_INTERVAL_SECONDS

            status_resp = await client.get(
                f"{_GRAPH_BASE}/{container_id}",
                params={"fields": "status_code", "access_token": token},
            )

            if status_resp.status_code != 200:
                raise InstagramPublishError(
                    f"Instagram status poll failed: "
                    f"{status_resp.status_code} {status_resp.text}"
                )

            status_data = status_resp.json()
            status_code = status_data.get("status_code", "")

            if status_code == "FINISHED":
                break
            elif status_code == "ERROR":
                raise InstagramPublishError(
                    f"Instagram container processing error: {status_data}"
                )
            # Otherwise still IN_PROGRESS — keep polling
        else:
            raise InstagramPublishError(
                f"Instagram container did not finish within "
                f"{_POLL_TIMEOUT_SECONDS} seconds (container_id={container_id})."
            )

    # ---- Step 3: publish ----
    async with httpx.AsyncClient(timeout=60.0) as client:
        publish_resp = await client.post(
            f"{_GRAPH_BASE}/{ig_account_id}/media_publish",
            params={
                "creation_id": container_id,
                "access_token": token,
            },
        )

    if publish_resp.status_code != 200:
        raise InstagramPublishError(
            f"Instagram publish failed: "
            f"{publish_resp.status_code} {publish_resp.text}"
        )

    return publish_resp.json()
