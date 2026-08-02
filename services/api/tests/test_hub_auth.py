"""The API had no authentication at all: no router asked who was calling, and
a hardcoded organisation id stood in for the answer. Anyone who learned the
URL could read and change every project, transcript and publishing token.

Identity now comes from the A1:8 hub, the same sign-in the other apps use.
The hub signs a JWT; this service verifies it against the hub's published
JWKS. No shared secret, and no need to call the hub on every request.
"""

import time

import pytest
from jose import jwt

from app.lib import hub_auth
from app.lib.hub_auth import HubAuthError, verify_hub_token

# A throwaway RSA pair. Generated once and pinned so the suite neither needs
# a key generator at import time nor reaches the network.
TEST_KEY = {
    "kty": "RSA",
    "kid": "test-key",
    "alg": "RS256",
    "use": "sig",
}


@pytest.fixture(autouse=True)
def _offline_jwks(monkeypatch, rsa_keypair):
    """Serve the test key instead of fetching the hub's, and start each test
    with an empty cache so one test's fetch cannot satisfy another's."""
    private, public_jwk = rsa_keypair
    hub_auth._jwks_cache.clear()

    async def fake_fetch() -> dict:
        return {"keys": [public_jwk]}

    monkeypatch.setattr(hub_auth, "_fetch_jwks", fake_fetch)
    return private


def make_token(rsa_keypair, **overrides) -> str:
    private, _ = rsa_keypair
    now = int(time.time())
    claims = {
        "sub": "hub-user-1",
        "iss": hub_auth.HUB_ISSUER,
        "aud": hub_auth.HUB_AUDIENCE,
        "iat": now,
        "exp": now + 3600,
    }
    claims.update(overrides)
    return jwt.encode(claims, private, algorithm="RS256", headers={"kid": "test-key"})


@pytest.mark.asyncio
async def test_a_valid_token_yields_the_hub_user_id(rsa_keypair):
    token = make_token(rsa_keypair)
    assert await verify_hub_token(token) == "hub-user-1"


@pytest.mark.asyncio
async def test_an_expired_token_is_refused(rsa_keypair):
    # Sessions outlive their usefulness; a leaked token must not be forever.
    token = make_token(rsa_keypair, exp=int(time.time()) - 10)
    with pytest.raises(HubAuthError):
        await verify_hub_token(token)


@pytest.mark.asyncio
async def test_a_token_from_another_issuer_is_refused(rsa_keypair):
    # Anyone can run a Convex deployment and mint RS256 tokens. Only ours
    # count, so the issuer is checked rather than merely the signature.
    token = make_token(rsa_keypair, iss="https://someone-elses.convex.site")
    with pytest.raises(HubAuthError):
        await verify_hub_token(token)


@pytest.mark.asyncio
async def test_a_token_signed_by_the_wrong_key_is_refused(other_keypair, rsa_keypair):
    other_private, _ = other_keypair
    now = int(time.time())
    forged = jwt.encode(
        {
            "sub": "hub-user-1",
            "iss": hub_auth.HUB_ISSUER,
            "aud": hub_auth.HUB_AUDIENCE,
            "iat": now,
            "exp": now + 3600,
        },
        other_private,
        algorithm="RS256",
        headers={"kid": "test-key"},  # claims our kid, isn't our key
    )
    with pytest.raises(HubAuthError):
        await verify_hub_token(forged)


@pytest.mark.asyncio
async def test_rubbish_is_refused_without_raising_something_else(rsa_keypair):
    # A garbled Authorization header should be a clean 401, not a 500.
    for junk in ["", "not-a-jwt", "a.b.c", "Bearer sometoken"]:
        with pytest.raises(HubAuthError):
            await verify_hub_token(junk)


@pytest.mark.asyncio
async def test_a_token_with_no_subject_is_refused(rsa_keypair):
    # Everything downstream keys off the subject; an absent one must not
    # sail through as None and land in a database column.
    token = make_token(rsa_keypair, sub=None)
    with pytest.raises(HubAuthError):
        await verify_hub_token(token)


@pytest.mark.asyncio
async def test_a_token_without_a_kid_still_verifies_against_a_lone_key(rsa_keypair):
    """`kid` picks among several keys. The hub publishes one, so a header
    that omits it is not ambiguous — and the signature is still checked."""
    private, _ = rsa_keypair
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": "hub-user-1",
            "iss": hub_auth.HUB_ISSUER,
            "aud": hub_auth.HUB_AUDIENCE,
            "iat": now,
            "exp": now + 3600,
        },
        private,
        algorithm="RS256",  # no kid header
    )
    assert await verify_hub_token(token) == "hub-user-1"


@pytest.mark.asyncio
async def test_no_kid_is_not_a_way_past_the_signature_check(
    other_keypair, rsa_keypair
):
    # The lenient path must stay lenient about key *selection* only.
    other_private, _ = other_keypair
    now = int(time.time())
    forged = jwt.encode(
        {
            "sub": "hub-user-1",
            "iss": hub_auth.HUB_ISSUER,
            "aud": hub_auth.HUB_AUDIENCE,
            "iat": now,
            "exp": now + 3600,
        },
        other_private,
        algorithm="RS256",
    )
    with pytest.raises(HubAuthError):
        await verify_hub_token(forged)


@pytest.mark.asyncio
async def test_the_jwks_is_fetched_once_and_reused(rsa_keypair, monkeypatch):
    """Verification happens on every request. Fetching the hub's keys each
    time would put the hub in the hot path of this service."""
    _, public_jwk = rsa_keypair
    calls = {"n": 0}

    async def counting_fetch() -> dict:
        calls["n"] += 1
        return {"keys": [public_jwk]}

    hub_auth._jwks_cache.clear()
    monkeypatch.setattr(hub_auth, "_fetch_jwks", counting_fetch)

    token = make_token(rsa_keypair)
    for _ in range(3):
        assert await verify_hub_token(token) == "hub-user-1"
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_an_unknown_kid_refetches_once_in_case_the_hub_rotated(
    rsa_keypair, other_keypair, monkeypatch
):
    """Key rotation must not take the service down until it restarts: a kid
    the cache doesn't know is a reason to look again, once."""
    _, public_jwk = rsa_keypair
    other_private, other_public = other_keypair
    other_public = {**other_public, "kid": "rotated-key"}
    calls = {"n": 0}

    async def rotating_fetch() -> dict:
        calls["n"] += 1
        # First call: only the old key. Later: the new one too.
        return {"keys": [public_jwk] if calls["n"] == 1 else [public_jwk, other_public]}

    hub_auth._jwks_cache.clear()
    monkeypatch.setattr(hub_auth, "_fetch_jwks", rotating_fetch)

    # Prime the cache with the old key.
    assert await verify_hub_token(make_token(rsa_keypair)) == "hub-user-1"

    now = int(time.time())
    rotated = jwt.encode(
        {
            "sub": "hub-user-2",
            "iss": hub_auth.HUB_ISSUER,
            "aud": hub_auth.HUB_AUDIENCE,
            "iat": now,
            "exp": now + 3600,
        },
        other_private,
        algorithm="RS256",
        headers={"kid": "rotated-key"},
    )
    assert await verify_hub_token(rotated) == "hub-user-2"
    assert calls["n"] == 2
