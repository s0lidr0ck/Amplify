"""Who am I, and may I be here?

The one route that depends on `current_user` rather than `approved_user`.
Everything else in the API is closed to an unapproved visitor, which would
leave them staring at a broken app; this endpoint is how the front end
learns to show "your request is with us" instead.

It is also where a user's name and email arrive. The hub's token carries
only a subject — no email claim, no name — so the web app, which does have
the signed-in profile, sends it here. That is display data and treated as
such: identity is the verified subject, never anything in this body.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.lib.auth_deps import current_user
from app.lib.plans import get_plan
from app.models import Organization, User

router = APIRouter(prefix="/api/me", tags=["me"])


class Profile(BaseModel):
    """What the web app knows about the signed-in user from the hub.

    Plain strings, not EmailStr: this is a label shown next to a church in
    the approval queue, never a credential and never how anyone is
    identified. Validating it would add a dependency to no end — the hub
    already checked the address when the account was made.
    """

    name: str | None = None
    email: str | None = None


class MeResponse(BaseModel):
    user_id: str
    organization_id: str
    organization_name: str | None
    name: str | None
    email: str | None
    plan: str
    plan_label: str
    has_access: bool


async def _respond(db: AsyncSession, user: User) -> MeResponse:
    org = await db.get(Organization, user.organization_id)
    plan = get_plan(org.plan if org else None)
    return MeResponse(
        user_id=user.id,
        organization_id=user.organization_id,
        organization_name=org.name if org else None,
        name=user.name,
        email=user.email,
        plan=plan.key,
        plan_label=plan.label,
        has_access=plan.grants_access,
    )


@router.get("", response_model=MeResponse)
async def read_me(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    return await _respond(db, user)


@router.put("", response_model=MeResponse)
async def update_me(
    profile: Profile,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> MeResponse:
    """Fill in the name and email the token could not carry.

    Only ever writes to the caller's own row — the user is resolved from the
    verified token, never from the request body — so this cannot be used to
    edit somebody else.
    """
    if profile.name is not None:
        user.name = profile.name.strip() or None
    if profile.email is not None:
        user.email = str(profile.email).strip().lower() or None

    # A church named after the person who created it beats "New church" in
    # the approval queue, but never overwrite a name that has been set.
    org = await db.get(Organization, user.organization_id)
    if org is not None and org.name == "New church" and user.email:
        org.name = f"{user.name or user.email}'s church"

    await db.commit()
    await db.refresh(user)
    return await _respond(db, user)
