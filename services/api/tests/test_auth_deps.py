"""The gate: who gets in, who is turned away, and who is merely waiting.

These exercise the dependencies against a stand-in session rather than a
database. The only database this service is configured against is the live
one, and the decisions worth pinning here are branches — bad token, unknown
identity, unapproved church — not SQL.
"""

import time

import pytest
from fastapi import HTTPException
from jose import jwt

from app.lib import hub_auth
from app.lib.auth_deps import approved_user, current_user
from app.models import Organization, User


class FakeSession:
    """Enough AsyncSession to run the dependencies.

    `scalar` returns whatever was seeded; `get` looks up by id. Writes are
    recorded so a test can assert that provisioning happened.
    """

    def __init__(self, user: User | None = None, orgs: dict | None = None):
        self._user = user
        self._orgs = orgs or {}
        self.added: list = []
        self.committed = False

    async def scalar(self, _query):
        return self._user

    async def get(self, _model, ident):
        return self._orgs.get(ident)

    def add(self, obj):
        self.added.append(obj)
        # Stand in for the server-side default the real column carries.
        if isinstance(obj, Organization) and obj.id is None:
            obj.id = "org-generated"

    async def flush(self):
        for obj in self.added:
            if isinstance(obj, Organization) and not obj.id:
                obj.id = "org-generated"

    async def commit(self):
        self.committed = True

    async def refresh(self, _obj):
        return None

    async def rollback(self):
        return None


@pytest.fixture(autouse=True)
def _offline_jwks(monkeypatch, rsa_keypair):
    _, public_jwk = rsa_keypair
    hub_auth._jwks_cache.clear()

    async def fake_fetch():
        return {"keys": [public_jwk]}

    monkeypatch.setattr(hub_auth, "_fetch_jwks", fake_fetch)


def bearer(rsa_keypair, sub="hub-user-1|session-1") -> str:
    private, _ = rsa_keypair
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": sub,
            "iss": hub_auth.HUB_ISSUER,
            "aud": hub_auth.HUB_AUDIENCE,
            "iat": now,
            "exp": now + 3600,
        },
        private,
        algorithm="RS256",
    )
    return f"Bearer {token}"


async def test_no_authorization_header_is_a_401(rsa_keypair):
    with pytest.raises(HTTPException) as exc:
        await current_user(authorization=None, db=FakeSession())
    assert exc.value.status_code == 401
    # Without this header a browser has no idea what kind of credential to send.
    assert exc.value.headers["WWW-Authenticate"] == "Bearer"


async def test_a_header_that_is_not_a_bearer_token_is_a_401(rsa_keypair):
    for bad in ["", "Basic abc123", "Bearer", "Bearer   ", "token abc"]:
        with pytest.raises(HTTPException) as exc:
            await current_user(authorization=bad, db=FakeSession())
        assert exc.value.status_code == 401, bad


async def test_a_forged_token_is_a_401(other_keypair, rsa_keypair):
    other_private, _ = other_keypair
    now = int(time.time())
    forged = jwt.encode(
        {
            "sub": "hub-user-1|s",
            "iss": hub_auth.HUB_ISSUER,
            "aud": hub_auth.HUB_AUDIENCE,
            "iat": now,
            "exp": now + 3600,
        },
        other_private,
        algorithm="RS256",
    )
    with pytest.raises(HTTPException) as exc:
        await current_user(authorization=f"Bearer {forged}", db=FakeSession())
    assert exc.value.status_code == 401


async def test_the_refusal_does_not_say_which_part_failed(rsa_keypair):
    # An error that distinguishes "expired" from "bad signature" from "wrong
    # issuer" tells an attacker which part of the forgery to work on next.
    with pytest.raises(HTTPException) as no_header:
        await current_user(authorization=None, db=FakeSession())
    with pytest.raises(HTTPException) as forged:
        await current_user(authorization="Bearer a.b.c", db=FakeSession())
    assert no_header.value.detail == forged.value.detail


async def test_a_known_hub_identity_returns_its_user(rsa_keypair):
    known = User(id="u1", organization_id="org1", hub_user_id="hub-user-1")
    session = FakeSession(user=known)
    got = await current_user(authorization=bearer(rsa_keypair), db=session)
    assert got is known
    assert session.added == []  # nothing provisioned for someone we know


async def test_an_unknown_identity_is_provisioned_as_a_pending_church(rsa_keypair):
    """A stranger signing in should land in a queue, not in the product.

    The row is created rather than refused because an approval list needs
    someone on it — you cannot approve a church you never heard about.
    """
    session = FakeSession(user=None)
    got = await current_user(authorization=bearer(rsa_keypair), db=session)

    assert got.hub_user_id == "hub-user-1"
    org = next(o for o in session.added if isinstance(o, Organization))
    assert org.plan == "pending"
    assert session.committed


async def test_an_approved_church_gets_through(rsa_keypair):
    user = User(id="u1", organization_id="org1", hub_user_id="hub-user-1")
    session = FakeSession(user=user, orgs={"org1": Organization(id="org1", plan="beta")})
    assert await approved_user(user=user, db=session) is user


async def test_a_pending_church_is_refused_with_a_reason(rsa_keypair):
    user = User(id="u1", organization_id="org1", hub_user_id="hub-user-1")
    session = FakeSession(
        user=user, orgs={"org1": Organization(id="org1", plan="pending")}
    )
    with pytest.raises(HTTPException) as exc:
        await approved_user(user=user, db=session)
    assert exc.value.status_code == 403
    # The front end branches on this to show a waiting screen rather than a
    # dead app with a generic error in it.
    assert exc.value.detail["reason"] == "plan_denies_access"
    assert exc.value.detail["plan"] == "pending"


async def test_a_suspended_church_is_told_something_different(rsa_keypair):
    user = User(id="u1", organization_id="org1", hub_user_id="hub-user-1")
    session = FakeSession(
        user=user, orgs={"org1": Organization(id="org1", plan="suspended")}
    )
    with pytest.raises(HTTPException) as exc:
        await approved_user(user=user, db=session)
    assert exc.value.status_code == 403
    assert exc.value.detail["plan"] == "suspended"
    assert "suspended" in exc.value.detail["message"].lower()


async def test_a_missing_organisation_fails_closed(rsa_keypair):
    # A user whose org row was deleted must not become unrestricted.
    user = User(id="u1", organization_id="gone", hub_user_id="hub-user-1")
    with pytest.raises(HTTPException) as exc:
        await approved_user(user=user, db=FakeSession(user=user, orgs={}))
    assert exc.value.status_code == 403


async def test_an_unrecognised_plan_fails_closed(rsa_keypair):
    user = User(id="u1", organization_id="org1", hub_user_id="hub-user-1")
    session = FakeSession(
        user=user, orgs={"org1": Organization(id="org1", plan="enterprise-gold")}
    )
    with pytest.raises(HTTPException) as exc:
        await approved_user(user=user, db=session)
    assert exc.value.status_code == 403
