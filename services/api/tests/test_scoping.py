"""One church must not reach another church's rows.

Authentication answers who is calling. This answers what they may touch —
and it is the half that fails quietly, because an unscoped lookup behaves
perfectly until someone points it at an id that isn't theirs.

The assertions are structural rather than per-route. A hand-checked list
would be correct on the day it was written and wrong the first time somebody
adds a route.
"""

import re

import pytest
from fastapi.routing import APIRoute

from app.lib.scoped_route import (
    IGNORED_ID_PARAMS,
    KNOWN_ID_PARAMS,
    ScopedRoute,
)
from app.main import app

_PATH_PARAM = re.compile(r"{(\w+)}")

# ---------------------------------------------------------------------------
# Known and deliberate: two things are still shared across every church.
#
#   /api/settings/prompts   one JSON file on disk (data/prompt_overrides.json).
#                           One church editing a prompt edits it for all.
#   /api/publishing/*       YouTube, TikTok, Wix and Facebook credentials come
#                           from environment variables, so every church would
#                           publish to the same channel, blog and page.
#
# Neither leaks one church's sermons to another, which is what the assertions
# below are about — they are shared *configuration*. With a single church on
# the system nothing is wrong today, and both become wrong the moment a second
# is approved. Recorded here rather than quietly fixed because per-church
# publishing credentials need a decision about where secrets live, and
# per-church prompts need one about whether there are still global defaults.
# ---------------------------------------------------------------------------

#: Routers exempt from row scoping, with the reason.
UNSCOPED_PREFIXES = {
    "/api/internal": "worker only; no user, guarded by a shared secret",
    "/api/me": "scopes to the token's own user by construction",
}

def _under(path: str, prefix: str) -> bool:
    """Is `path` the prefix itself, or beneath it?

    Not `startswith`: "/api/media" starts with "/api/me", so a raw prefix
    test quietly excluded every media route from this file — which is how a
    scoping suite ends up passing without checking the routes that stream
    people's sermons.
    """
    return path == prefix or path.startswith(prefix + "/")


API_ROUTES = [
    r
    for r in app.routes
    if isinstance(r, APIRoute)
    and r.path.startswith("/api")
    and not any(_under(r.path, p) for p in UNSCOPED_PREFIXES)
]


def test_there_are_routes_to_check():
    assert len(API_ROUTES) > 50


@pytest.mark.parametrize("route", API_ROUTES, ids=lambda r: r.path)
def test_every_id_in_a_path_is_accounted_for(route: APIRoute):
    """No path id may be silently unguarded.

    ScopedRoute guards the ids it recognises and ignores the rest, so an id
    nobody mapped would pass through unchecked — and look exactly like one
    that was checked. This is the assertion that makes the omission loud.
    """
    for param in _PATH_PARAM.findall(route.path):
        if not param.endswith("_id"):
            continue
        assert param in KNOWN_ID_PARAMS or param in IGNORED_ID_PARAMS, (
            f"{route.path} takes '{param}', which ScopedRoute does not know.\n"
            "Map it in KNOWN_ID_PARAMS, or add it to IGNORED_ID_PARAMS with "
            "the reason it needs no guard."
        )


@pytest.mark.parametrize("route", API_ROUTES, ids=lambda r: r.path)
def test_routes_carrying_a_known_id_are_built_by_the_scoped_class(route: APIRoute):
    """The guard rides on the route class, so the class has to be in use.

    A router registered without route_class=ScopedRoute looks completely
    normal and enforces nothing.
    """
    guarded = [p for p in _PATH_PARAM.findall(route.path) if p in KNOWN_ID_PARAMS]
    if not guarded:
        return
    assert isinstance(route, ScopedRoute), (
        f"{route.path} takes {guarded} but its router was built without "
        "route_class=ScopedRoute, so nothing checks who owns the row."
    )


@pytest.mark.parametrize("route", API_ROUTES, ids=lambda r: r.path)
def test_each_known_id_gets_its_own_guard_dependency(route: APIRoute):
    names = {
        d.call.__name__
        for d in route.dependant.dependencies
        if getattr(d, "call", None) is not None
    }
    for param in _PATH_PARAM.findall(route.path):
        if param in KNOWN_ID_PARAMS:
            assert f"owns_{param}" in names, (
                f"{route.path} has no ownership guard for '{param}'"
            )


def test_the_ignore_list_has_not_gone_stale():
    """Every ignored id still appears in some path.

    A stale entry is dead weight — and worse, it silently exempts the id if
    the name is ever reused for something that does name a row.
    """
    in_use = {
        p
        for r in API_ROUTES
        for p in _PATH_PARAM.findall(r.path)
    }
    for param in IGNORED_ID_PARAMS:
        assert param in in_use, (
            f"IGNORED_ID_PARAMS names '{param}', which no route takes any more"
        )


def test_known_and_ignored_do_not_overlap():
    # An id in both lists is ambiguous: one says guard it, the other says
    # don't. Whichever wins, somebody read the wrong one.
    assert not (set(KNOWN_ID_PARAMS) & IGNORED_ID_PARAMS)


#: Routes that name a project in the request body rather than the path.
#: ScopedRoute cannot see these — it reads the path — so each calls the
#: ownership check itself. Pinned here so a new one cannot appear unnoticed.
BODY_PROJECT_ROUTES = {
    "/api/clips/analyze",
    "/api/dev/seed-source",
    "/api/transcript/start",
    "/api/trim/start",
    "/api/uploads/local/start",
    "/api/uploads/local/{upload_id}/complete",
    "/api/uploads/request",
}


def test_the_body_project_list_matches_the_app():
    """Find every route taking an id somewhere ScopedRoute cannot see it.

    If this fails with a route not in the set, that route accepts a project
    id in its body and needs an explicit ownership check — the path guard
    will not save it.
    """
    import inspect

    from pydantic import BaseModel

    found = set()
    for route in API_ROUTES:
        if "{project_id}" in route.path:
            continue
        for param in inspect.signature(route.endpoint).parameters.values():
            annotation = param.annotation
            if isinstance(annotation, type) and issubclass(annotation, BaseModel):
                if any(f.endswith("_id") for f in annotation.model_fields):
                    found.add(route.path)

    assert found == BODY_PROJECT_ROUTES, (
        "Routes taking an id in the body have changed.\n"
        f"  added:   {sorted(found - BODY_PROJECT_ROUTES)}\n"
        f"  removed: {sorted(BODY_PROJECT_ROUTES - found)}\n"
        "Each added route must call require_body_project itself."
    )
