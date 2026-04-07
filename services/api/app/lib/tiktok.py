"""TikTok Content Posting API publishing helpers.

Uploads a video to TikTok using the PULL_FROM_URL approach. Automatically
refreshes the access token when a 401 is returned and logs a warning to
update the persisted refresh token in EasyPanel.

Required env vars:
  TIKTOK_CLIENT_KEY
  TIKTOK_CLIENT_SECRET
  TIKTOK_ACCESS_TOKEN
  TIKTOK_REFRESH_TOKEN
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class TikTokPublishError(RuntimeError):
    """Raised when a TikTok publish operation fails."""


# ------------------------------------------------------------------ #
# Constants
# ------------------------------------------------------------------ #

_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
_PUBLISH_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
_MEDIA_BASE_URL = "https://amplify-amplify-api.ktfbiu.easypanel.host/api/media/asset"
_MAX_TITLE_LENGTH = 2200


# ------------------------------------------------------------------ #
# Token management
# ------------------------------------------------------------------ #


async def _refresh_access_token() -> str:
    """
    Exchange the stored refresh token for a new access token.

    Updates ``settings.tiktok_access_token`` and
    ``settings.tiktok_refresh_token`` in memory (not persisted).
    Logs a warning reminding operators to update EasyPanel env vars.
    """
    client_key = settings.tiktok_client_key.strip()
    client_secret = settings.tiktok_client_secret.strip()
    refresh_token = settings.tiktok_refresh_token.strip()

    if not all([client_key, client_secret, refresh_token]):
        raise TikTokPublishError(
            "TikTok OAuth credentials not configured. "
            "Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN in env."
        )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            _TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "refresh_token",
                "client_key": client_key,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
            },
        )

    if response.status_code != 200:
        raise TikTokPublishError(
            f"Failed to refresh TikTok access token: "
            f"{response.status_code} {response.text}"
        )

    token_data = response.json()
    new_access_token = token_data.get("access_token", "")
    new_refresh_token = token_data.get("refresh_token", "")

    # Update in-memory settings (not persisted to env/disk)
    settings.tiktok_access_token = new_access_token
    if new_refresh_token:
        settings.tiktok_refresh_token = new_refresh_token

    logger.warning(
        "TikTok tokens refreshed in memory. "
        "Update TIKTOK_ACCESS_TOKEN and TIKTOK_REFRESH_TOKEN in EasyPanel "
        "to persist the new tokens across restarts."
    )

    return new_access_token


# ------------------------------------------------------------------ #
# Video upload
# ------------------------------------------------------------------ #


async def _post_video(
    *,
    access_token: str,
    video_url: str,
    title: str,
) -> httpx.Response:
    """Send the PULL_FROM_URL publish request and return the raw response."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        return await client.post(
            _PUBLISH_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json={
                "post_info": {
                    "title": title,
                    "privacy_level": "PUBLIC_TO_EVERYONE",
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False,
                },
                "source_info": {
                    "source": "PULL_FROM_URL",
                    "video_url": video_url,
                },
            },
        )


async def upload_video(
    *,
    media_asset_id: str,
    title: str,
    description: str,
    hashtags: list[str] | None = None,
) -> dict[str, Any]:
    """
    Post a video to TikTok via the PULL_FROM_URL approach.

    TikTok fetches the video from the Amplify media asset URL:
    ``https://amplify-amplify-api.ktfbiu.easypanel.host/api/media/asset/{asset_id}``

    The post title combines ``title`` and ``hashtags`` (max 2200 chars).
    On a 401 response the access token is refreshed once and the request retried.

    Returns the TikTok API response dict (includes ``publish_id``).
    """
    client_key = settings.tiktok_client_key.strip()
    client_secret = settings.tiktok_client_secret.strip()
    access_token = settings.tiktok_access_token.strip()

    if not all([client_key, client_secret]):
        raise TikTokPublishError(
            "TikTok credentials not configured. "
            "Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_ACCESS_TOKEN in env."
        )

    if not access_token:
        # No stored access token — attempt refresh immediately
        access_token = await _refresh_access_token()

    video_url = f"{_MEDIA_BASE_URL}/{media_asset_id}"

    # Build post title: title + hashtags, capped at TikTok's 2200-char limit
    hashtag_str = " ".join(f"#{h.lstrip('#')}" for h in hashtags) if hashtags else ""
    post_title = f"{title} {hashtag_str}".strip()
    post_title = post_title[:_MAX_TITLE_LENGTH]

    response = await _post_video(
        access_token=access_token,
        video_url=video_url,
        title=post_title,
    )

    # ---- Retry once on 401 with a fresh token ----
    if response.status_code == 401:
        access_token = await _refresh_access_token()
        response = await _post_video(
            access_token=access_token,
            video_url=video_url,
            title=post_title,
        )

    if response.status_code not in (200, 201):
        raise TikTokPublishError(
            f"TikTok video publish failed: {response.status_code} {response.text}"
        )

    return response.json()
