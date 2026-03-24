"""Facebook Pages publishing helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from app.config import settings
from app.lib.meta_credentials import resolve_meta_publish_credentials

GRAPH_API_BASE = "https://graph.facebook.com/v25.0"


class FacebookPublishError(RuntimeError):
    """Raised when Facebook publishing fails."""


async def _facebook_request(
    method: str,
    path: str,
    *,
    data: dict[str, Any] | None = None,
    files: dict[str, tuple[str, bytes, str]] | None = None,
) -> dict[str, Any]:
    creds = await resolve_meta_publish_credentials()
    if not creds.page_id or not creds.page_access_token:
        raise FacebookPublishError("Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN before publishing to Facebook.")

    payload = {"access_token": creds.page_access_token, **(data or {})}
    timeout = httpx.Timeout(120.0, connect=30.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.request(
            method,
            f"{GRAPH_API_BASE}/{path.lstrip('/')}",
            data=payload,
            files=files,
        )

    try:
        body = response.json()
    except ValueError as exc:
        raise FacebookPublishError(f"Facebook API returned a non-JSON response ({response.status_code}).") from exc

    if response.status_code >= 400 or body.get("error"):
        error = body.get("error") if isinstance(body, dict) else None
        message = error.get("message") if isinstance(error, dict) else None
        raise FacebookPublishError(message or f"Facebook API error {response.status_code}.")

    return body


async def publish_facebook_text_post(*, message: str) -> dict[str, Any]:
    if not message.strip():
        raise FacebookPublishError("Facebook text post message cannot be empty.")
    creds = await resolve_meta_publish_credentials()
    if not creds.page_id:
        raise FacebookPublishError("No Facebook Page is available for publishing.")

    response = await _facebook_request(
        "POST",
        f"{creds.page_id}/feed",
        data={"message": message.strip()},
    )
    post_id = str(response.get("id") or "").strip()
    return {
        "post_id": post_id,
        "status": "published",
        "message": message.strip(),
        "post_url": f"https://www.facebook.com/{post_id}" if post_id else "",
        "raw": response,
    }


async def publish_facebook_reel(
    *,
    video_path: Path,
    description: str,
    title: str | None = None,
) -> dict[str, Any]:
    if not video_path.exists():
        raise FacebookPublishError("The reel video file does not exist on disk.")
    creds = await resolve_meta_publish_credentials()
    if not creds.page_id:
        raise FacebookPublishError("No Facebook Page is available for publishing.")

    with video_path.open("rb") as video_file:
        response = await _facebook_request(
            "POST",
            f"{creds.page_id}/videos",
            data={
                "description": description.strip(),
                "title": (title or "").strip(),
                "published": "true",
            },
            files={"source": (video_path.name, video_file.read(), "video/mp4")},
        )

    video_id = str(response.get("id") or "").strip()
    return {
        "video_id": video_id,
        "status": "published",
        "title": (title or "").strip(),
        "description": description.strip(),
        "post_url": f"https://www.facebook.com/{video_id}" if video_id else "",
        "raw": response,
    }
