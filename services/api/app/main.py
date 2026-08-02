"""Amplify API entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from fastapi import Depends

from app.config import settings
from app.lib.auth_deps import approved_user
from app.lib.worker_auth import worker_only
from app.queue import close_queue
from app.routers import (
    clips,
    content,
    dev,
    jobs,
    me,
    media,
    projects,
    publishing,
    settings as settings_router,
    speakers,
    transcript,
    trim,
    uploads,
    worker_internal,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init queue pool. Shutdown: close pool."""
    yield
    await close_queue()


app = FastAPI(
    title="Amplify API",
    description="Sermon-to-content operating system for churches",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Ensure 500 errors include CORS headers so the browser can read the response."""
    logger.exception("Unhandled exception: %s", exc)
    origin = request.headers.get("origin")
    if settings.is_allowed_origin(origin):
        response = JSONResponse(status_code=500, content={"detail": str(exc)})
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# ---------------------------------------------------------------------------
# What is protected, and what is not.
#
# Auth is applied here rather than on each of the ~78 route functions, so this
# block is the whole answer to "what can be reached without signing in". A new
# route added to any router below inherits its guard; one added to a router
# nobody remembered to list would be visible, which is the point of keeping
# the list in one place.
#
# `approved_user` is the default: signed in AND their church's plan grants
# access. The three exceptions each need a different mechanism and say why.
# ---------------------------------------------------------------------------

REQUIRE_APPROVAL = [Depends(approved_user)]

# EXCEPTION 1 — signed in, but approval not required.
# The only route an unapproved visitor may reach. Without it they would meet
# an app whose every button 403s, with nothing to explain why; with it the
# front end can say "your request is with us".
app.include_router(me.router)

# EXCEPTION 2 — machine-to-machine, no user involved.
# The worker reporting job progress and filing transcripts. A shared secret,
# because there is nobody signed in to check.
app.include_router(worker_internal.router, dependencies=[Depends(worker_only)])

# Everything else: signed in and approved.
app.include_router(projects.router, dependencies=REQUIRE_APPROVAL)
app.include_router(speakers.router, dependencies=REQUIRE_APPROVAL)
app.include_router(jobs.router, dependencies=REQUIRE_APPROVAL)
app.include_router(uploads.router, dependencies=REQUIRE_APPROVAL)
app.include_router(trim.router, dependencies=REQUIRE_APPROVAL)
app.include_router(transcript.router, dependencies=REQUIRE_APPROVAL)
app.include_router(clips.router, dependencies=REQUIRE_APPROVAL)
app.include_router(content.router, dependencies=REQUIRE_APPROVAL)
app.include_router(publishing.router, dependencies=REQUIRE_APPROVAL)
app.include_router(settings_router.router, dependencies=REQUIRE_APPROVAL)

# EXCEPTION 3 — checks its own credentials, per route.
# Streaming takes either a bearer token or a short-lived signed link, because
# the URL goes into a `<video src>` and a browser will not attach an
# Authorization header to a media element's request. Registering it with a
# blanket dependency would close the route by breaking playback.
app.include_router(media.router)

# Dev-only helpers that seed and fake data. Behind approval like everything
# else, and settings.enable_dev_routes should be off in production.
app.include_router(dev.router, dependencies=REQUIRE_APPROVAL)


@app.get("/healthz")
async def healthz():
    """Liveness probe."""
    return {"status": "ok"}


@app.get("/readyz")
async def readyz():
    """Readiness probe."""
    return {"status": "ready"}
