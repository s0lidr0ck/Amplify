"""Amplify API entrypoint."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.queue import close_queue, get_queue

logger = logging.getLogger(__name__)
from app.routers import clips, content, dev, jobs, media, projects, settings as settings_router, speakers, transcript, trim, uploads, worker_internal


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
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?$",
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
    if origin and origin in settings.cors_origins:
        response = JSONResponse(status_code=500, content={"detail": str(exc)})
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response
    return JSONResponse(status_code=500, content={"detail": str(exc)})

app.include_router(projects.router)
app.include_router(speakers.router)
app.include_router(media.router)
app.include_router(jobs.router)
app.include_router(uploads.router)
app.include_router(trim.router)
app.include_router(transcript.router)
app.include_router(clips.router)
app.include_router(content.router)
app.include_router(settings_router.router)
app.include_router(worker_internal.router)
app.include_router(dev.router)


@app.get("/healthz")
async def healthz():
    """Liveness probe."""
    return {"status": "ok"}


@app.get("/readyz")
async def readyz():
    """Readiness probe."""
    return {"status": "ready"}
