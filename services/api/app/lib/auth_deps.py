"""FastAPI dependencies: who is calling, and are they allowed in.

Two separate questions, deliberately two separate dependencies.

`current_user` answers the first. It verifies the hub token, finds or creates
the matching local row, and hands back the caller. It does **not** check
whether they may use the product.

`approved_user` answers the second, and is what routers should almost always
depend on. It fails with 403 and a machine-readable reason so the web app can
show a waiting screen rather than a generic error.

The split exists so a signed-in-but-unapproved visitor still has somewhere to
go: `/api/me` depends on `current_user` alone, which is how the front end
learns it should render "your request is with us" instead of a dead app.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.lib.hub_auth import HubAuthError, verify_hub_token
from app.lib.plans import get_plan
from app.models import Organization, User


def _bearer(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token.strip()


async def _provision(db: AsyncSession, hub_user_id: str) -> User:
    """Create the local row for a hub identity we have not seen before.

    A first-time visitor gets their own organisation, on the "pending" plan —
    so signing in puts them in a queue to be approved, not into the product.
    Creating the row rather than refusing outright is what makes the queue
    visible: an approval list needs someone on it.
    """
    org = Organization(
        name="New church",
        # Slugs are unique and this one is never shown; deriving it from the
        # hub id keeps a retry after a failed commit from colliding.
        slug=f"org-{hub_user_id[:24]}".lower(),
        plan="pending",
    )
    db.add(org)
    await db.flush()

    user = User(organization_id=org.id, hub_user_id=hub_user_id, role="owner")
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # Two tabs opening at once both miss the lookup and both insert. The
        # unique constraint on hub_user_id decides it; the loser re-reads
        # rather than handing back a 500.
        await db.rollback()
        existing = await db.scalar(
            select(User).where(User.hub_user_id == hub_user_id)
        )
        if existing is None:
            raise
        return existing
    await db.refresh(user)
    return user


async def current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """The signed-in caller, whether or not their church is approved."""
    token = _bearer(authorization)
    try:
        hub_user_id = await verify_hub_token(token)
    except HubAuthError:
        # Deliberately flat: telling a caller which part of their token failed
        # tells an attacker which part of the forgery to fix.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await db.scalar(select(User).where(User.hub_user_id == hub_user_id))
    if user is None:
        user = await _provision(db, hub_user_id)
    return user


async def approved_user(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """The signed-in caller, refused unless their church's plan lets them in.

    Routers should depend on this one. Access is a property of the church,
    not the person: a church subscribes, and everyone in it inherits what
    that buys.
    """
    org = await db.get(Organization, user.organization_id)
    plan = get_plan(org.plan if org else None)
    if not plan.grants_access:
        # 403 with a reason the front end can branch on. A visitor waiting to
        # be approved needs a different screen from one who was turned off.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "reason": "plan_denies_access",
                "plan": plan.key,
                "message": (
                    "Amplify is invite-only at the moment. Your request is with us."
                    if plan.key == "pending"
                    else "This account's access has been suspended."
                ),
            },
        )
    return user


CurrentUser = Annotated[User, Depends(current_user)]
ApprovedUser = Annotated[User, Depends(approved_user)]
