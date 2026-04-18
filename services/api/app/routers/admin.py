"""Super-admin endpoints — org and user management."""

from __future__ import annotations

import secrets
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import UserContext, hash_password, require_role
from app.db import get_db
from app.models import Organization, User

router = APIRouter(prefix="/api/admin", tags=["admin"])

_require_super_admin = require_role("super_admin")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class OrgRead(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    is_active: bool
    member_count: int
    created_at: str

    class Config:
        from_attributes = True


class CreateOrgRequest(BaseModel):
    org_name: str
    slug: str
    leader_name: str
    leader_email: str
    plan: str = "starter"


class CreateOrgResponse(BaseModel):
    org_id: str
    org_name: str
    leader_user_id: str
    leader_email: str
    temp_password: str


class MemberRead(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


class CreateMemberRequest(BaseModel):
    name: str
    email: str
    role: str = "member"


class CreateMemberResponse(BaseModel):
    user_id: str
    email: str
    temp_password: str


# ---------------------------------------------------------------------------
# GET /api/admin/orgs
# ---------------------------------------------------------------------------

@router.get("/orgs", response_model=list[OrgRead])
async def list_orgs(
    current_user: UserContext = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all organizations with member count."""
    result = await db.execute(
        select(Organization).order_by(Organization.created_at.asc())
    )
    orgs = result.scalars().all()

    # Get member counts
    counts_result = await db.execute(
        select(User.organization_id, func.count(User.id).label("cnt"))
        .where(User.is_active == True)
        .group_by(User.organization_id)
    )
    counts = {row.organization_id: row.cnt for row in counts_result}

    return [
        OrgRead(
            id=org.id,
            name=org.name,
            slug=org.slug,
            plan=org.plan,
            is_active=org.is_active,
            member_count=counts.get(org.id, 0),
            created_at=org.created_at.isoformat(),
        )
        for org in orgs
    ]


# ---------------------------------------------------------------------------
# POST /api/admin/orgs
# ---------------------------------------------------------------------------

@router.post("/orgs", response_model=CreateOrgResponse, status_code=201)
async def create_org(
    body: CreateOrgRequest,
    current_user: UserContext = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create an org + initial team_leader account. Returns temp password."""
    slug = body.slug.strip().lower().replace(" ", "-")
    # Check slug uniqueness
    existing = await db.execute(select(Organization).where(Organization.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An organization with that slug already exists")

    # Create org
    org = Organization(
        id=str(uuid.uuid4()),
        name=body.org_name.strip(),
        slug=slug,
        plan=body.plan,
        is_active=True,
        settings_json={},
    )
    db.add(org)
    await db.flush()

    # Generate temp password
    temp_password = secrets.token_urlsafe(12)

    # Create team_leader user
    leader = User(
        id=str(uuid.uuid4()),
        organization_id=org.id,
        email=body.leader_email.strip().lower(),
        name=body.leader_name.strip(),
        password_hash=hash_password(temp_password),
        role="team_leader",
        is_active=True,
        invited_by_user_id=current_user.user_id,
    )
    db.add(leader)
    await db.flush()

    return CreateOrgResponse(
        org_id=org.id,
        org_name=org.name,
        leader_user_id=leader.id,
        leader_email=leader.email,
        temp_password=temp_password,
    )


# ---------------------------------------------------------------------------
# GET /api/admin/orgs/{org_id}/members
# ---------------------------------------------------------------------------

@router.get("/orgs/{org_id}/members", response_model=list[MemberRead])
async def list_org_members(
    org_id: str,
    current_user: UserContext = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all members of an org."""
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    result = await db.execute(
        select(User)
        .where(User.organization_id == org_id)
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
# POST /api/admin/orgs/{org_id}/members
# ---------------------------------------------------------------------------

@router.post("/orgs/{org_id}/members", response_model=CreateMemberResponse, status_code=201)
async def create_member(
    org_id: str,
    body: CreateMemberRequest,
    current_user: UserContext = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Directly create a member in an org (no invite token required)."""
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    temp_password = secrets.token_urlsafe(12)
    user = User(
        id=str(uuid.uuid4()),
        organization_id=org_id,
        email=body.email.strip().lower(),
        name=body.name.strip(),
        password_hash=hash_password(temp_password),
        role=body.role,
        is_active=True,
        invited_by_user_id=current_user.user_id,
    )
    db.add(user)
    await db.flush()

    return CreateMemberResponse(
        user_id=user.id,
        email=user.email,
        temp_password=temp_password,
    )


# ---------------------------------------------------------------------------
# DELETE /api/admin/users/{user_id}  (deactivate)
# ---------------------------------------------------------------------------

@router.delete("/users/{user_id}", status_code=204)
async def deactivate_user(
    user_id: str,
    current_user: UserContext = Depends(_require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate (soft-delete) a user."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.user_id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    user.is_active = False
    await db.flush()
    from fastapi import Response
    return Response(status_code=204)
