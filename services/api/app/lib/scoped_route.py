"""A route class that scopes path ids to the caller's church automatically.

Knowing who is calling is only half the job. Almost every route here takes an
id and acts on the row it names, and ids travel — they appear in URLs, in API
responses, in logs. Without an ownership check a valid token for one church
reads and edits another's work simply by knowing an id.

There are ~90 row lookups across a dozen routers. Guarding each call site by
hand would work exactly once: the next route someone adds would be
unguarded, and nothing would say so. So the guard is attached to the *route*
rather than the handler — a router built with `route_class=ScopedRoute` gets
it on every route it will ever have, including the ones not written yet.

The guard fires on the path parameter's name. `{project_id}` resolves the
project and checks the caller's organisation owns it; the leaf ids below
resolve their row and check the same thing through it. A path parameter this
does not recognise is left alone, which is why `KNOWN_ID_PARAMS` is asserted
against the live app in the tests: an id we forgot to map would otherwise
pass silently.

Refusals are 404, never 403. "This exists but is not yours" confirms the id
is real, which is a slow way of enumerating another church's work.
"""

from __future__ import annotations

import re
from typing import Any, Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.routing import APIRoute
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.lib.auth_deps import ApprovedUser
from app.models import ClipCandidate, ProcessingJob, Project, Speaker, Transcript

_PATH_PARAM = re.compile(r"{(\w+)}")

#: Path parameter name -> the model it names. Every id the routers put in a
#: path must appear here or in IGNORED_ID_PARAMS; a test enforces it.
KNOWN_ID_PARAMS: dict[str, Any] = {
    "project_id": Project,
    "job_id": ProcessingJob,
    "transcript_id": Transcript,
    "candidate_id": ClipCandidate,
    "speaker_id": Speaker,
}

#: Path parameters this deliberately does not guard, each with its reason.
IGNORED_ID_PARAMS: set[str] = {
    # An upload session on disk, not a table. The routes that use it take a
    # project_id in their body, which is checked there.
    "upload_id",
    # Media streaming accepts a signed link *or* a bearer token, and this
    # guard depends on an approved user — attaching it would 401 every
    # <video> tag and close the route by breaking playback. media.py checks
    # ownership itself, on both paths.
    "asset_id",
}

_NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _guard_for(param: str, model: Any) -> Callable:
    """Build the dependency that checks one path parameter."""

    async def guard(
        request: Request,
        user: ApprovedUser,
        db: AsyncSession = Depends(get_db),
    ) -> None:
        row_id = request.path_params.get(param)
        if row_id is None:
            return
        # Imported here rather than at module scope: scoping imports models,
        # and this module is imported by the routers that define them.
        from app.lib.scoping import require_owned

        await require_owned(db, model, str(row_id), user)

    guard.__name__ = f"owns_{param}"
    return guard


class ScopedRoute(APIRoute):
    """An APIRoute that refuses ids belonging to another church.

    Used via `APIRouter(route_class=ScopedRoute)`. Adds one dependency per
    recognised id in the path, before the handler runs.
    """

    def __init__(self, path: str, endpoint: Callable, **kwargs: Any) -> None:
        guards = [
            Depends(_guard_for(param, KNOWN_ID_PARAMS[param]))
            for param in _PATH_PARAM.findall(path)
            if param in KNOWN_ID_PARAMS
        ]
        if guards:
            kwargs["dependencies"] = [*(kwargs.get("dependencies") or []), *guards]
        super().__init__(path, endpoint, **kwargs)


async def require_body_project(
    db: AsyncSession, project_id: str, user: ApprovedUser
) -> Project:
    """For the handful of routes that name a project in their body.

    A path-based guard cannot see these, so they call this explicitly. The
    complete list is asserted in the tests, so a new one cannot be added
    without either calling this or failing the suite.
    """
    from app.lib.scoping import require_project

    return await require_project(db, project_id, user)
