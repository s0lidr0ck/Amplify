"""Short-lived signed URLs for streaming media.

Every other route in this service takes a bearer token. Media cannot: the
URL goes into a `<video src>`, and a browser will not attach an
Authorization header to a media element's request. Requiring one there would
close the route by breaking playback.

So the capability travels in the URL instead, signed and expiring. A signed
link says "whoever holds this may read this one asset until this time" — it
is not a session, carries no identity, and cannot be traded for one.

Signed with the same secret as everything else in this service. The
signature covers the asset id *and* the expiry, so neither can be edited
without invalidating it — an attacker cannot take a valid link and push its
expiry into next year.
"""

from __future__ import annotations

import hashlib
import hmac
import time

from app.config import settings

# Long enough to watch an hour-long sermon and scrub back through it, short
# enough that a link pasted into a chat stops working the same day.
DEFAULT_TTL_SECONDS = 6 * 60 * 60


def _signature(asset_id: str, expires_at: int) -> str:
    message = f"{asset_id}:{expires_at}".encode()
    return hmac.new(
        settings.jwt_secret.encode(), message, hashlib.sha256
    ).hexdigest()[:32]


def sign(asset_id: str, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> str:
    """Return a `<expiry>.<signature>` token for `asset_id`."""
    expires_at = int(time.time()) + ttl_seconds
    return f"{expires_at}.{_signature(asset_id, expires_at)}"


def verify(asset_id: str, token: str | None) -> bool:
    """Is `token` a live signature for `asset_id`?"""
    if not token:
        return False
    expiry_part, _, signature = token.partition(".")
    if not signature:
        return False
    try:
        expires_at = int(expiry_part)
    except ValueError:
        return False
    if expires_at < int(time.time()):
        return False
    # compare_digest, not ==: a plain comparison returns as soon as two bytes
    # differ, and the time it takes leaks how much of a guess was right.
    return hmac.compare_digest(_signature(asset_id, expires_at), signature)
