"""Instagram publishing helpers."""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.lib.meta_credentials import resolve_meta_publish_credentials

GRAPH_API_BASE = "https://graph.facebook.com/v25.0"


class InstagramPublishError(RuntimeError):
    """Raised when Instagram publishing fails."""


def _public_media_url(url: str) -> str:
    candidate = url.strip()
    if not candidate:
        raise InstagramPublishError("Instagram publishing requires a public media URL.")
    parsed = urlparse(candidate)
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1"}:
        raise InstagramPublishError(
            "Instagram publishing requires a publicly reachable media URL. Localhost media cannot be fetched by Meta."
        )
    return candidate


async def _instagram_request(
    method: str,
    path: str,
    *,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    creds = await resolve_meta_publish_credentials()
    if not creds.instagram_business_account_id or not creds.instagram_access_token:
        raise InstagramPublishError(
            "Set INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN before publishing to Instagram."
        )

    payload = {"access_token": creds.instagram_access_token, **(data or {})}
    timeout = httpx.Timeout(120.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.request(method, f"{GRAPH_API_BASE}/{path.lstrip('/')}", data=payload)

    try:
        body = response.json()
    except ValueError as exc:
        raise InstagramPublishError(f"Instagram API returned a non-JSON response ({response.status_code}).") from exc

    if response.status_code >= 400 or body.get("error"):
        error = body.get("error") if isinstance(body, dict) else None
        message = error.get("message") if isinstance(error, dict) else None
        raise InstagramPublishError(message or f"Instagram API error {response.status_code}.")

    return body


async def publish_instagram_reel(
    *,
    video_url: str,
    caption: str,
    cover_url: str | None = None,
) -> dict[str, Any]:
    creds = await resolve_meta_publish_credentials()
    if not creds.instagram_business_account_id:
        raise InstagramPublishError("No Instagram business account is available for publishing.")

    media_url = _public_media_url(video_url)
    payload = {
        "media_type": "REELS",
        "video_url": media_url,
        "caption": caption.strip(),
        "share_to_feed": "true",
    }
    if cover_url:
        payload["cover_url"] = _public_media_url(cover_url)

    container = await _instagram_request(
        "POST",
        f"{creds.instagram_business_account_id}/media",
        data=payload,
    )
    creation_id = str(container.get("id") or "").strip()
    if not creation_id:
        raise InstagramPublishError("Instagram did not return a media container id.")

    status_code = "IN_PROGRESS"
    for _ in range(20):
        status_response = await _instagram_request(
            "GET",
            creation_id,
            data={"fields": "status_code,status"},
        )
        status_code = str(status_response.get("status_code") or status_response.get("status") or "").upper()
        if status_code == "FINISHED":
            break
        if status_code in {"ERROR", "EXPIRED"}:
            raise InstagramPublishError(f"Instagram media container failed with status {status_code}.")
        await asyncio.sleep(3)

    if status_code != "FINISHED":
        raise InstagramPublishError("Instagram media container did not finish processing in time.")

    published = await _instagram_request(
        "POST",
        f"{creds.instagram_business_account_id}/media_publish",
        data={"creation_id": creation_id},
    )
    media_id = str(published.get("id") or "").strip()
    return {
        "media_id": media_id,
        "status": "published",
        "caption": caption.strip(),
        "permalink": f"https://www.instagram.com/reel/{media_id}/" if media_id else "",
        "raw": {
            "container": container,
            "published": published,
        },
    }


async def publish_instagram_image_post(
    *,
    image_url: str,
    caption: str,
) -> dict[str, Any]:
    creds = await resolve_meta_publish_credentials()
    if not creds.instagram_business_account_id:
        raise InstagramPublishError("No Instagram business account is available for publishing.")

    media_url = _public_media_url(image_url)
    container = await _instagram_request(
        "POST",
        f"{creds.instagram_business_account_id}/media",
        data={
            "image_url": media_url,
            "caption": caption.strip(),
        },
    )
    creation_id = str(container.get("id") or "").strip()
    if not creation_id:
        raise InstagramPublishError("Instagram did not return a media container id for the image post.")

    published = await _instagram_request(
        "POST",
        f"{creds.instagram_business_account_id}/media_publish",
        data={"creation_id": creation_id},
    )
    media_id = str(published.get("id") or "").strip()
    return {
        "media_id": media_id,
        "status": "published",
        "caption": caption.strip(),
        "permalink": f"https://www.instagram.com/p/{media_id}/" if media_id else "",
        "raw": {
            "container": container,
            "published": published,
        },
    }
