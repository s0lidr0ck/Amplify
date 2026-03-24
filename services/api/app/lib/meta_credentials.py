"""Meta credential resolution with optional auto-refresh."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.config import settings

GRAPH_API_BASE = "https://graph.facebook.com/v25.0"


@dataclass
class MetaResolvedCredentials:
    page_id: str
    page_access_token: str
    instagram_business_account_id: str
    instagram_access_token: str
    warnings: list[str]


_runtime_user_token: str | None = None
_runtime_user_token_expires_at: datetime | None = None
_runtime_resolved_at: datetime | None = None
_runtime_resolved: MetaResolvedCredentials | None = None


def _parse_expiry(value: str) -> datetime | None:
    if not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed
    except ValueError:
        return None


def _token_refresh_needed(expires_at: datetime | None) -> bool:
    if not expires_at:
        return True
    return expires_at <= datetime.now(UTC) + timedelta(days=7)


async def _exchange_long_lived_token(user_token: str) -> tuple[str | None, datetime | None, str | None]:
    if not settings.meta_app_id.strip() or not settings.meta_app_secret.strip():
        return None, None, "META_APP_ID / META_APP_SECRET are not set; skipping Meta token refresh."

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        response = await client.get(
            f"{GRAPH_API_BASE}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": settings.meta_app_id.strip(),
                "client_secret": settings.meta_app_secret.strip(),
                "fb_exchange_token": user_token,
            },
        )
    if response.status_code >= 400:
        message = ""
        try:
            payload = response.json() if response.content else {}
            error_payload = payload.get("error") if isinstance(payload, dict) else None
            if isinstance(error_payload, dict):
                message = str(error_payload.get("message") or "").strip()
        except ValueError:
            message = ""
        if message:
            return None, None, f"Meta token refresh failed ({response.status_code}): {message}"
        return None, None, f"Meta token refresh failed ({response.status_code})."

    body = response.json() if response.content else {}
    access_token = str(body.get("access_token") or "").strip()
    expires_in = int(body.get("expires_in") or 0)
    if not access_token:
        return None, None, "Meta token refresh returned no access_token."
    expires_at = datetime.now(UTC) + timedelta(seconds=max(0, expires_in)) if expires_in else None
    return access_token, expires_at, None


async def _fetch_accounts(user_token: str) -> tuple[list[dict[str, Any]], str | None]:
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
        response = await client.get(
            f"{GRAPH_API_BASE}/me/accounts",
            params={
                "access_token": user_token,
                "fields": "id,name,access_token,instagram_business_account{id}",
                "limit": 100,
            },
        )
    if response.status_code >= 400:
        message = ""
        try:
            payload = response.json() if response.content else {}
            error_payload = payload.get("error") if isinstance(payload, dict) else None
            if isinstance(error_payload, dict):
                message = str(error_payload.get("message") or "").strip()
        except ValueError:
            message = ""
        if message:
            return [], f"Meta /me/accounts failed ({response.status_code}): {message}"
        return [], f"Meta /me/accounts failed ({response.status_code})."

    body = response.json() if response.content else {}
    rows = body.get("data") if isinstance(body, dict) else []
    return [row for row in rows if isinstance(row, dict)], None


def _pick_page(accounts: list[dict[str, Any]]) -> dict[str, Any] | None:
    preferred_id = settings.facebook_page_id.strip()
    if preferred_id:
        for row in accounts:
            if str(row.get("id") or "").strip() == preferred_id:
                return row
    return accounts[0] if accounts else None


async def resolve_meta_publish_credentials(*, force_refresh: bool = False) -> MetaResolvedCredentials:
    global _runtime_user_token, _runtime_user_token_expires_at, _runtime_resolved_at, _runtime_resolved

    now = datetime.now(UTC)
    if _runtime_resolved and _runtime_resolved_at and not force_refresh and (now - _runtime_resolved_at) < timedelta(minutes=5):
        return _runtime_resolved

    warnings: list[str] = []
    page_id = settings.facebook_page_id.strip()
    page_access_token = settings.facebook_page_access_token.strip()
    instagram_business_account_id = settings.instagram_business_account_id.strip()
    instagram_access_token = settings.instagram_access_token.strip()

    user_token = (_runtime_user_token or settings.meta_user_access_token).strip()
    user_token_expiry = _runtime_user_token_expires_at or _parse_expiry(settings.meta_user_token_expires_at)

    if user_token and settings.meta_app_id.strip() and settings.meta_app_secret.strip() and (_token_refresh_needed(user_token_expiry) or force_refresh):
        refreshed_token, refreshed_expiry, refresh_warning = await _exchange_long_lived_token(user_token)
        if refreshed_token:
            _runtime_user_token = refreshed_token
            _runtime_user_token_expires_at = refreshed_expiry
            user_token = refreshed_token
            user_token_expiry = refreshed_expiry
        elif refresh_warning:
            warnings.append(refresh_warning)

    if user_token:
        accounts, accounts_warning = await _fetch_accounts(user_token)
        if accounts_warning:
            warnings.append(accounts_warning)
        else:
            picked = _pick_page(accounts)
            if picked:
                picked_page_id = str(picked.get("id") or "").strip()
                picked_page_token = str(picked.get("access_token") or "").strip()
                ig_payload = picked.get("instagram_business_account") if isinstance(picked.get("instagram_business_account"), dict) else {}
                picked_ig_id = str(ig_payload.get("id") or "").strip()
                if picked_page_id:
                    page_id = picked_page_id
                if picked_page_token:
                    page_access_token = picked_page_token
                    # Use the resolved page token for Instagram Graph calls so
                    # stale INSTAGRAM_ACCESS_TOKEN env values do not keep failing.
                    instagram_access_token = picked_page_token
                if picked_ig_id:
                    instagram_business_account_id = picked_ig_id
            else:
                warnings.append("Meta /me/accounts returned no managed pages for this user token.")

    resolved = MetaResolvedCredentials(
        page_id=page_id,
        page_access_token=page_access_token,
        instagram_business_account_id=instagram_business_account_id,
        instagram_access_token=instagram_access_token or page_access_token,
        warnings=warnings,
    )
    _runtime_resolved = resolved
    _runtime_resolved_at = now
    return resolved
