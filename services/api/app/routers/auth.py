"""Auth endpoints — login, refresh, logout, me, accept-invite."""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    UserContext,
    clear_auth_cookies,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    set_auth_cookies,
    verify_password,
)
from app.db import get_db
from app.models import InviteToken, Organization, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    org_id: str
    org_name: str


class MeResponse(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    org_id: str
    org_name: str
    is_nlc: bool


class AcceptInviteRequest(BaseModel):
    token: str
    name: str
    password: str


class InviteInfoResponse(BaseModel):
    org_name: str
    email: str | None
    role: str
    valid: bool


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Email + password → set httpOnly cookies → return user info."""
    # Find user by email (search across orgs; email must be unique globally for login)
    result = await db.execute(
        select(User).where(User.email == body.email.strip().lower()).limit(1)
    )
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    # Load org
    org = await db.get(Organization, user.organization_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization is not active")

    access_token = create_access_token(
        user_id=user.id,
        org_id=org.id,
        role=user.role,
        org_name=org.name,
        user_name=user.name,
    )
    refresh_token = create_refresh_token(user_id=user.id)
    set_auth_cookies(response, access_token, refresh_token)

    return LoginResponse(
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        org_id=org.id,
        org_name=org.name,
    )


# ---------------------------------------------------------------------------
# POST /api/auth/refresh
# ---------------------------------------------------------------------------

@router.post("/refresh", response_model=LoginResponse)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Refresh token cookie → new access token cookie."""
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("sub")
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or deactivated")

    org = await db.get(Organization, user.organization_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization is not active")

    access_token = create_access_token(
        user_id=user.id,
        org_id=org.id,
        role=user.role,
        org_name=org.name,
        user_name=user.name,
    )
    new_refresh_token = create_refresh_token(user_id=user.id)
    set_auth_cookies(response, access_token, new_refresh_token)

    return LoginResponse(
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        org_id=org.id,
        org_name=org.name,
    )


# ---------------------------------------------------------------------------
# POST /api/auth/logout
# ---------------------------------------------------------------------------

@router.post("/logout")
async def logout(response: Response):
    """Clear auth cookies."""
    clear_auth_cookies(response)
    return {"ok": True}


# ---------------------------------------------------------------------------
# GET /api/auth/me
# ---------------------------------------------------------------------------

@router.get("/me", response_model=MeResponse)
async def me(
    current_user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current user from cookie."""
    user = await db.get(User, current_user.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return MeResponse(
        user_id=current_user.user_id,
        email=user.email,
        name=current_user.user_name,
        role=current_user.role,
        org_id=current_user.org_id,
        org_name=current_user.org_name,
        is_nlc=current_user.is_nlc(),
    )


# ---------------------------------------------------------------------------
# GET /api/auth/invite-info/{token}
# ---------------------------------------------------------------------------

@router.get("/invite-info/{token}", response_model=InviteInfoResponse)
async def invite_info(token: str, db: AsyncSession = Depends(get_db)):
    """Return invite details without auth (for showing the join page)."""
    result = await db.execute(select(InviteToken).where(InviteToken.token == token))
    invite = result.scalar_one_or_none()

    if not invite or invite.used_at is not None:
        return InviteInfoResponse(org_name="", email=None, role="member", valid=False)

    now = datetime.now(tz=timezone.utc)
    if invite.expires_at.replace(tzinfo=timezone.utc) < now:
        return InviteInfoResponse(org_name="", email=None, role="member", valid=False)

    org = await db.get(Organization, invite.org_id)
    return InviteInfoResponse(
        org_name=org.name if org else "",
        email=invite.email,
        role=invite.role,
        valid=True,
    )


# ---------------------------------------------------------------------------
# POST /api/auth/accept-invite
# ---------------------------------------------------------------------------

@router.post("/accept-invite", response_model=LoginResponse)
async def accept_invite(
    body: AcceptInviteRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Accept invite token + set password → create user + set cookies."""
    result = await db.execute(select(InviteToken).where(InviteToken.token == body.token))
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.used_at is not None:
        raise HTTPException(status_code=400, detail="Invite has already been used")

    now = datetime.now(tz=timezone.utc)
    if invite.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=400, detail="Invite has expired")

    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    org = await db.get(Organization, invite.org_id)
    if not org or not org.is_active:
        raise HTTPException(status_code=400, detail="Organization not found or inactive")

    # Create the user
    user = User(
        id=str(uuid.uuid4()),
        organization_id=invite.org_id,
        email=invite.email or body.name.strip().lower().replace(" ", "") + "@invited",
        name=body.name.strip(),
        password_hash=hash_password(body.password),
        role=invite.role,
        is_active=True,
        invited_by_user_id=invite.created_by_user_id,
    )
    db.add(user)

    # Mark invite as used
    invite.used_at = now
    invite.used_by_user_id = user.id

    await db.flush()
    await db.refresh(user)

    access_token = create_access_token(
        user_id=user.id,
        org_id=org.id,
        role=user.role,
        org_name=org.name,
        user_name=user.name,
    )
    refresh_token = create_refresh_token(user_id=user.id)
    set_auth_cookies(response, access_token, refresh_token)

    return LoginResponse(
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        org_id=org.id,
        org_name=org.name,
    )
