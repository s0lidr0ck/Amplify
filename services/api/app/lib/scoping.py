"""Keep one church's rows out of another church's hands.

Knowing *who* is calling is only half of it. Almost every route here takes an
id — a project, a clip, an asset, a transcript — and acts on the row it
names. Without an ownership check, a valid token for one church reads and
edits another's work simply by knowing an id, and ids travel: they appear in
URLs, in API responses, in logs.

The data model makes this cheap. Everything hangs off `project_id`, and
`projects` carries `organization_id`, so ownership is one join. `speakers`
is the exception and carries the organisation itself.

**404, never 403.** Telling someone "this exists but is not yours" confirms
the id is real, which is a slow way of enumerating another church's work.
A row you may not see should be indistinguishable from one that is not
there.
"""

from __future__ import annotations

from typing import TypeVar

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, Speaker, User

T = TypeVar("T")

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def require_project(db: AsyncSession, project_id: str, user: User) -> Project:
    """The project, if it belongs to the caller's church. Otherwise 404."""
    project = await db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.organization_id == user.organization_id,
        )
    )
    if project is None:
        raise _NOT_FOUND
    return project


async def require_owned(db: AsyncSession, model: type[T], row_id: str, user: User) -> T:
    """A row of `model`, if the caller's church owns it. Otherwise 404.

    Resolves ownership through the row's `project_id`, which is how every
    table in this schema reaches an organisation bar `speakers` and the
    root tables themselves.
    """
    if model is Project:
        return await require_project(db, row_id, user)  # type: ignore[return-value]

    if model is Speaker:
        row = await db.scalar(
            select(Speaker).where(
                Speaker.id == row_id,
                Speaker.organization_id == user.organization_id,
            )
        )
        if row is None:
            raise _NOT_FOUND
        return row  # type: ignore[return-value]

    if not hasattr(model, "project_id"):
        raise TypeError(
            f"{model.__name__} has no project_id; ownership cannot be derived. "
            "Add an explicit check rather than leaving the row unscoped."
        )

    row = await db.scalar(
        select(model)
        .join(Project, Project.id == model.project_id)  # type: ignore[attr-defined]
        .where(
            model.id == row_id,  # type: ignore[attr-defined]
            Project.organization_id == user.organization_id,
        )
    )
    if row is None:
        raise _NOT_FOUND
    return row


async def owned_project_ids(db: AsyncSession, user: User) -> list[str]:
    """Every project id belonging to the caller's church.

    For the handful of places that filter a list rather than fetch one row.
    """
    return list(
        await db.scalars(
            select(Project.id).where(Project.organization_id == user.organization_id)
        )
    )
