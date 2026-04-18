"""Team-leader endpoints — member management, invite links, org settings."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import UserContext, get_current_user, require_role
from app.config import settings
from app.db import get_db
from app.models import InviteToken, Organization, User

router = APIRouter(prefix="/api/team", tags=["team"])

_require_leader = require_role("super_admin", "team_leader")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MemberRead(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: str


class GenerateInviteRequest(BaseModel):
    email: Optional[str] = None
    role: str = "member"
    expires_in_days: int = 7


class GenerateInviteResponse(BaseModel):
    invite_url: str
    token: str
    expires_at: str


class OrgSettings(BaseModel):
    settings_json: dict[str, Any]


# ---------------------------------------------------------------------------
# GET /api/team/members
# ---------------------------------------------------------------------------

@router.get("/members", response_model=list[MemberRead])
async def list_members(
    current_user: UserContext = Depends(_require_leader),
    db: AsyncSession = Depends(get_db),
):
    """List all active members of the caller's org."""
    result = await db.execute(
        select(User)
        .where(User.organization_id == current_user.org_id)
        .order_by(User.created_at.asc())
    )
    users = result.scalars().all()
    return [
        MemberRead(
            id=u.id,
            email=u.email,
            name=u.name,
            role=u.role,
            is_active=u.is_active,
            created_at=u.created_at.isoformat(),
        )
        for u in users
    ]


# ---------------------------------------------------------------------------
# POST /api/team/invite
# ---------------------------------------------------------------------------

@router.post("/invite", response_model=GenerateInviteResponse)
async def generate_invite(
    body: GenerateInviteRequest,
    request: Request,
    current_user: UserContext = Depends(_require_leader),
    db: AsyncSession = Depends(get_db),
):
    """Generate an invite link for the caller's org."""
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=body.expires_in_days)

    invite = InviteToken(
        id=str(uuid.uuid4()),
        org_id=current_user.org_id,
        created_by_user_id=current_user.user_id,
        token=raw_token,
        email=body.email,
        role=body.role,
        expires_at=expires_at,
    )
    db.add(invite)
    await db.flush()

    # Build URL from app_url setting
    app_url = settings.app_url.rstrip("/")
    invite_url = f"{app_url}/accept-invite/{raw_token}"

    return GenerateInviteResponse(
        invite_url=invite_url,
        token=raw_token,
        expires_at=expires_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# DELETE /api/team/members/{user_id}  (deactivate)
# ---------------------------------------------------------------------------

@router.delete("/members/{user_id}", status_code=204)
async def deactivate_member(
    user_id: str,
    current_user: UserContext = Depends(_require_leader),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a member of the caller's org."""
    user = await db.get(User, user_id)
    if not user or user.organization_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Member not found in your org")
    if user.id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    user.is_active = False
    await db.flush()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# GET /api/team/settings
# ---------------------------------------------------------------------------

@router.get("/settings", response_model=OrgSettings)
async def get_org_settings(
    current_user: UserContext = Depends(_require_leader),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Organization, current_user.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrgSettings(settings_json=org.settings_json or {})


# ---------------------------------------------------------------------------
# PATCH /api/team/settings
# ---------------------------------------------------------------------------

@router.patch("/settings", response_model=OrgSettings)
async def update_org_settings(
    body: OrgSettings,
    current_user: UserContext = Depends(_require_leader),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Organization, current_user.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    merged = {**(org.settings_json or {}), **body.settings_json}
    org.settings_json = merged
    await db.flush()
    await db.refresh(org)
    return OrgSettings(settings_json=org.settings_json)
