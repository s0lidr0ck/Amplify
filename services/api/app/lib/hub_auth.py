"""Verify A1:8 hub identity tokens.

Amplify does not hold passwords. Users sign in at the A1:8 hub — the same
sign-in behind Crew, Study, UpScreen and the rest — and arrive here carrying
a JWT the hub signed. This module turns that token into a hub user id, or
refuses it.

Verification is local. The hub publishes its public keys as a standard JWKS
document, so this service checks the signature itself rather than calling the
hub on every request. That keeps the hub off the hot path: if it is briefly
unreachable, already-signed-in users keep working.

What is deliberately checked, beyond the signature:

- **Issuer.** Anyone can stand up a Convex deployment and mint RS256 tokens
  with any subject they like. Only tokens from our hub count.
- **Expiry.** Enforced by the library, but named here because it is the only
  thing bounding the damage from a leaked token.
- **Subject present.** Everything downstream keys off it; a missing subject
  must not travel onward as None.

Two things about Convex Auth's tokens are load-bearing here, both read off
its `generateToken` rather than assumed:

- It writes **no `kid`** into the header — only `{alg: "RS256"}`. Key
  selection therefore has to work without one.
- The subject is **`"<userId>|<sessionId>"`**, not a bare user id. Only the
  first half identifies the person.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from jose import jwt
from jose.exceptions import JOSEError

logger = logging.getLogger(__name__)

# The hub's Convex deployment. This is the shared A1:8 backend — the same one
# Crew and Study authenticate against — so a session there is a session here.
HUB_ISSUER = "https://hushed-chinchilla-210.convex.site"
HUB_JWKS_URL = f"{HUB_ISSUER}/.well-known/jwks.json"

# Convex Auth sets applicationID "convex" in auth.config.ts, which becomes the
# audience claim. Checked so a token minted for some other Convex application
# on the same deployment cannot be replayed here.
HUB_AUDIENCE = "convex"

# Convex Auth's TOKEN_SUB_CLAIM_DIVIDER: it writes the subject as
# "<userId>|<sessionId>" rather than a bare user id.
SUBJECT_DIVIDER = "|"

_JWKS_TIMEOUT_SECONDS = 5.0

# kid -> JWK. Populated on first use and kept: the hub rotates rarely, and an
# unknown kid triggers a single refetch rather than a periodic poll.
_jwks_cache: dict[str, dict[str, Any]] = {}
_jwks_lock = asyncio.Lock()


class HubAuthError(Exception):
    """The token is missing, malformed, expired, or not ours.

    One exception for every failure, on purpose. Telling a caller *why* their
    token was refused tells an attacker which part of the forgery to fix.
    Callers turn this into a flat 401.
    """


async def _fetch_jwks() -> dict[str, Any]:
    """Fetch the hub's published keys. Patched out in tests."""
    async with httpx.AsyncClient(timeout=_JWKS_TIMEOUT_SECONDS) as client:
        response = await client.get(HUB_JWKS_URL)
        response.raise_for_status()
        return response.json()


async def _refresh_jwks() -> None:
    document = await _fetch_jwks()
    keys = document.get("keys") or []
    if not keys:
        raise HubAuthError("hub published no signing keys")
    # Replace wholesale rather than merge: a key the hub has withdrawn should
    # stop being accepted here too.
    _jwks_cache.clear()
    for key in keys:
        kid = key.get("kid")
        if kid:
            _jwks_cache[kid] = key


def _sole_key() -> dict[str, Any] | None:
    """The only published key, when there is exactly one.

    This is not a fallback, it is the normal path: Convex Auth signs with
    `setProtectedHeader({alg: "RS256"})` and writes no `kid` at all, while
    the hub publishes exactly one key. `kid` selects among several keys, so
    with one key there is nothing to select.

    It costs no safety — signature, issuer, audience and expiry are all still
    checked against that key. If the hub ever publishes a second key, tokens
    without a `kid` start being refused rather than guessed at.
    """
    return next(iter(_jwks_cache.values())) if len(_jwks_cache) == 1 else None


async def _key_for(kid: str | None) -> dict[str, Any]:
    if kid and kid in _jwks_cache:
        return _jwks_cache[kid]
    if not kid and (sole := _sole_key()) is not None:
        return sole
    # Unknown or absent kid: either the hub rotated, or the token is junk.
    # One refetch tells us which. The lock stops a burst of unknown-kid
    # requests turning into a burst of outbound fetches.
    async with _jwks_lock:
        if kid and kid in _jwks_cache:
            return _jwks_cache[kid]
        if not kid and (sole := _sole_key()) is not None:
            return sole
        await _refresh_jwks()
    if kid:
        if kid not in _jwks_cache:
            raise HubAuthError("token signed by a key the hub does not publish")
        return _jwks_cache[kid]
    if (sole := _sole_key()) is None:
        raise HubAuthError("token names no key and the hub publishes several")
    return sole


async def verify_hub_token(token: str) -> str:
    """Return the hub user id carried by `token`, or raise HubAuthError.

    The returned value is the hub's own user id (the JWT subject). It is
    stable for the life of the account and is what Amplify stores to link a
    local user row to a hub identity.
    """
    if not token or not token.strip():
        raise HubAuthError("no token supplied")

    try:
        header = jwt.get_unverified_header(token)
    except JOSEError as exc:
        raise HubAuthError("token is not a well-formed JWT") from exc

    key = await _key_for(header.get("kid"))

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=HUB_ISSUER,
            audience=HUB_AUDIENCE,
        )
    except JOSEError as exc:
        # Logged at debug, not warning: a wrong token is an ordinary event
        # (an expired tab), and logging every one at warning buries the real
        # signal. The reason never reaches the caller.
        logger.debug("hub token refused: %s", exc)
        raise HubAuthError("token failed verification") from exc

    subject = claims.get("sub")
    if not subject or not isinstance(subject, str):
        raise HubAuthError("token carries no subject")

    # Convex Auth packs two things into the subject: "<userId>|<sessionId>".
    # Only the first identifies the person — the session half changes every
    # time they sign in, on a new device, or when a token refreshes. Storing
    # the whole subject would mint a fresh Amplify user on each sign-in and
    # strand the previous one's work.
    user_id = subject.split(SUBJECT_DIVIDER, 1)[0].strip()
    if not user_id:
        raise HubAuthError("token subject carries no user id")
    return user_id
