"""Auth utilities — JWT, password hashing, FastAPI dependencies."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Cookie, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import Organization, User

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8
REFRESH_TOKEN_EXPIRE_DAYS = 30

NLC_ORG_ID = "00000000-0000-0000-0000-000000000001"


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    """Return bcrypt hash of *plain* password."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed* bcrypt digest."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)


def create_access_token(
    user_id: str,
    org_id: str,
    role: str,
    org_name: str,
    user_name: str,
) -> str:
    expire = _utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": user_id,
        "org_id": org_id,
        "role": role,
        "org_name": org_name,
        "user_name": user_name,
        "type": "access",
        "exp": expire,
        "iat": _utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    expire = _utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
        "iat": _utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises HTTPException on failure."""
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# User context
# ---------------------------------------------------------------------------

@dataclass
class UserContext:
    user_id: str
    org_id: str
    role: str
    org_name: str
    user_name: str

    def is_super_admin(self) -> bool:
        return self.role == "super_admin"

    def is_team_leader_or_above(self) -> bool:
        return self.role in ("super_admin", "team_leader")

    def is_nlc(self) -> bool:
        return self.org_id == NLC_ORG_ID


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def _extract_access_token(request: Request) -> Optional[str]:
    """Try cookie first, then Authorization header."""
    token = request.cookies.get("access_token")
    if token:
        return token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> UserContext:
    """Dependency: decode access token cookie → UserContext."""
    token = _extract_access_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    # Verify user still exists and is active
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or deactivated")

    return UserContext(
        user_id=user_id,
        org_id=payload.get("org_id", ""),
        role=payload.get("role", "member"),
        org_name=payload.get("org_name", ""),
        user_name=payload.get("user_name", ""),
    )


def require_role(*roles: str):
    """Dependency factory: raise 403 if current user's role is not in *roles*."""
    async def _check(current_user: UserContext = Depends(get_current_user)) -> UserContext:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(roles)}",
            )
        return current_user
    return _check


def require_super_admin():
    return require_role("super_admin")


def require_team_leader_or_above():
    return require_role("super_admin", "team_leader")


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------

COOKIE_SECURE = True   # Set False for local dev if needed; we keep True for prod
COOKIE_SAMESITE = "lax"


def set_auth_cookies(response, access_token: str, refresh_token: str) -> None:
    """Attach httpOnly auth cookies to *response*."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=ACCESS_TOKEN_EXPIRE_HOURS * 3600,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth/refresh",
    )


def clear_auth_cookies(response) -> None:
    """Clear auth cookies on *response*."""
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")
