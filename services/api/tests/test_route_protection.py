"""Every route is closed unless it is on a list that says why it is open.

This exists because the API shipped with no authentication at all, and the
way that recurs is not a decision — it is a new router someone adds without
remembering the dependency. So the assertion is inverted: rather than
checking the routes we protected, it walks the whole app and fails on
anything reachable that is not named below.

Adding a route to EXPECTED_OPEN is a deliberate act with a reason attached.
Forgetting to protect one is not possible without doing that.
"""

import pytest
from fastapi.routing import APIRoute

from app.lib.auth_deps import approved_user, current_user
from app.lib.worker_auth import worker_only
from app.main import app

#: Routes reachable without an approved user, and why each one has to be.
EXPECTED_OPEN: dict[str, str] = {
    "/healthz": "liveness probe; returns a constant, says nothing about anyone",
    "/readyz": "readiness probe; same",
    "/api/me": (
        "signed in but not necessarily approved — the front end asks this to "
        "decide whether to show a waiting screen"
    ),
    "/api/media/asset/{asset_id}": (
        "takes a bearer token OR a signed link, checked inside the route, "
        "because a <video src> cannot send an Authorization header"
    ),
}

#: Routes guarded by the worker's shared secret instead of a user.
EXPECTED_WORKER_ONLY_PREFIX = "/api/internal"


def _dependency_functions(route: APIRoute) -> set:
    return {
        d.call
        for d in route.dependant.dependencies
        if getattr(d, "call", None) is not None
    }


def _all_dependencies(route: APIRoute) -> set:
    """Every dependency reachable from this route, including nested ones."""
    seen = set()

    def walk(dependant):
        for sub in dependant.dependencies:
            call = getattr(sub, "call", None)
            if call is not None:
                seen.add(call)
            walk(sub)

    walk(route.dependant)
    return seen


API_ROUTES = [
    r
    for r in app.routes
    if isinstance(r, APIRoute) and set(r.methods) - {"HEAD", "OPTIONS"}
]


def test_the_app_actually_has_routes():
    # A guard on the guard: if the walk found nothing, every assertion below
    # would pass vacuously and this file would be worthless.
    assert len(API_ROUTES) > 50


@pytest.mark.parametrize("route", API_ROUTES, ids=lambda r: f"{r.path}")
def test_every_route_is_closed_or_explains_itself(route: APIRoute):
    deps = _all_dependencies(route)

    if route.path.startswith(EXPECTED_WORKER_ONLY_PREFIX):
        assert worker_only in deps, (
            f"{route.path} is an internal worker route with no shared-secret "
            "guard — anyone could file job results."
        )
        return

    if route.path in EXPECTED_OPEN:
        return

    assert approved_user in deps, (
        f"{route.path} is reachable without an approved user.\n"
        "Either register its router with dependencies=REQUIRE_APPROVAL in "
        "app/main.py, or add it to EXPECTED_OPEN here with the reason it has "
        "to be open."
    )


def test_the_open_list_has_not_gone_stale():
    """Every exception still names a route that exists.

    A stale entry is a licence nobody is using — and worse, it silently
    re-opens the route if the path is ever reused.
    """
    paths = {r.path for r in API_ROUTES}
    for path in EXPECTED_OPEN:
        assert path in paths, f"EXPECTED_OPEN names {path}, which no longer exists"


def test_the_me_route_still_requires_signing_in():
    # Open to the unapproved, not to the anonymous. If this ever loosened to
    # no dependency at all, anyone could enumerate churches.
    me_routes = [r for r in API_ROUTES if r.path == "/api/me"]
    assert me_routes
    for route in me_routes:
        deps = _all_dependencies(route)
        assert current_user in deps, "/api/me stopped requiring a signed-in caller"
