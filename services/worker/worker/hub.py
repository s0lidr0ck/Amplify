"""The worker's side of the queue.

Everything this container knows about the outside world goes through here: it
asks Convex for work, reports what it is doing, asks where to read and write
files, and says when it is done.

Two deliberate absences.

It holds no AWS credentials. When it needs to read an input or write an
output it asks for a signed URL, and the key is derived on the Convex side
from the job's own church and project. So a bug here cannot put a sermon in
another church's folder — the container never picks a path.

It holds no user identity. It carries a shared secret, which says "I am the
worker", not "I am allowed to touch this church". Every call is scoped by the
job it already holds.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import uuid
from dataclasses import dataclass
from typing import Any

import httpx

from worker.config import settings

logger = logging.getLogger(__name__)

# Long enough for Convex to answer under load; short enough that a wedged
# request does not stall the loop for minutes.
TIMEOUT = 30.0


@dataclass
class Job:
    job_id: str
    project_id: str
    church_id: str
    job_type: str
    subject_id: str | None
    payload_json: str | None
    attempt: int


def worker_id() -> str:
    """Stable within a process, distinct between them.

    The hostname alone would collide if two workers ran on one box; a fresh
    uuid alone would make logs impossible to follow across a job's life.
    """
    return f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"


class Hub:
    """Convex, from the worker's point of view."""

    def __init__(self, worker: str) -> None:
        base = settings.hub_url.rstrip("/")
        self._base = f"{base}/amplify/worker"
        self._worker = worker
        secret = settings.amplify_worker_secret
        if not secret or secret == "change-me-in-production":
            # Fail at construction rather than on the first poll. A worker
            # that starts, logs nothing useful and quietly 401s forever is
            # the hardest kind of broken to notice.
            raise RuntimeError(
                "AMPLIFY_WORKER_SECRET is not set. The worker cannot take any "
                "work without it, and would otherwise poll silently forever."
            )
        self._client = httpx.Client(
            timeout=TIMEOUT,
            headers={"x-amplify-worker-secret": secret},
        )

    def close(self) -> None:
        self._client.close()

    def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        response = self._client.post(
            f"{self._base}/{path}", json={"workerId": self._worker, **body}
        )
        response.raise_for_status()
        return response.json()

    # ── work ────────────────────────────────────────────────────────────────

    def claim(self, kinds: list[str] | None = None) -> Job | None:
        """Take the next job, or None when there is nothing waiting.

        An empty queue is the normal answer, not an error — a polling worker
        sees it far more often than it sees work.
        """
        data = self._post("claim", {"kinds": kinds or []})
        job = data.get("job")
        if not job:
            return None
        return Job(
            job_id=job["jobId"],
            project_id=job["projectId"],
            church_id=job["churchId"],
            job_type=job["jobType"],
            subject_id=job.get("subjectId"),
            payload_json=job.get("payloadJson"),
            attempt=job.get("attempt", 1),
        )

    def progress(
        self, job: Job, percent: float | None = None, message: str | None = None
    ) -> None:
        """Say the job is alive and roughly where it is.

        Doubles as a heartbeat: Convex refreshes the claim on every one of
        these, so a long transcription is not mistaken for a dead worker.
        """
        try:
            self._post(
                "progress",
                {"jobId": job.job_id, "progressPercent": percent, "message": message},
            )
        except Exception:
            # Never let a progress update kill a job that is otherwise fine.
            logger.warning("progress update failed for %s", job.job_id, exc_info=True)

    def log(self, job: Job, message: str, level: str = "info") -> None:
        try:
            self._post("log", {"jobId": job.job_id, "level": level, "message": message})
        except Exception:
            logger.warning("log line failed for %s", job.job_id, exc_info=True)

    def finish(
        self,
        job: Job,
        ok: bool,
        *,
        message: str | None = None,
        error: str | None = None,
        assets: list[dict[str, Any]] | None = None,
    ) -> None:
        """End the job, recording anything it produced in the same call.

        One call, not two: between them the job would read as finished with
        nothing to show for it.
        """
        self._post(
            "finish",
            {
                "jobId": job.job_id,
                "ok": ok,
                "message": message,
                "error": error,
                "assets": assets or [],
            },
        )

    # ── files ───────────────────────────────────────────────────────────────

    def download_url(self, job: Job, asset_id: str) -> tuple[str, str]:
        """A signed GET for an input, and its filename."""
        data = self._post("download-url", {"jobId": job.job_id, "assetId": asset_id})
        return data["url"], data.get("filename", "input")

    def upload_url(self, job: Job, kind: str, filename: str) -> tuple[str, str]:
        """A signed PUT for an output, and the key to report back.

        The key comes from Convex rather than being built here, which is what
        keeps this container unable to write outside its own church.
        """
        data = self._post(
            "upload-url", {"jobId": job.job_id, "kind": kind, "filename": filename}
        )
        return data["uploadUrl"], data["storageKey"]

    # ── credentials ─────────────────────────────────────────────────────────

    def credential(self, job: Job, platform: str) -> dict[str, Any]:
        """The church's credential for one platform, for this job only.

        Asked for at the moment of use rather than handed over with the job.
        A claimed job sits in this process for as long as the upload takes —
        up to an hour for a sermon master — and a refresh token that rides
        along with it ends up in a log line, a traceback, or a queue row
        somebody dumps while debugging.

        Convex checks two things: the shared secret, and that this worker
        still holds the claim. A container that went stale and lost its job
        to somebody else gets nothing.
        """
        try:
            data = self._post("credential", {"jobId": job.job_id, "platform": platform})
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                # Either the connection was removed after this job was queued,
                # or the claim went stale and somebody else has the job. Both
                # read the same from here, and both are fixed the same way.
                raise RuntimeError(
                    f"There's no {platform} connection for this church any "
                    "more. Connect it in Settings and send it again."
                ) from exc
            raise
        try:
            return json.loads(data["secretJson"])
        except (KeyError, ValueError) as exc:
            # Deliberately does not quote the value. This string reaches the
            # job log, which people paste into chat.
            raise RuntimeError(
                f"The saved {platform} connection isn't readable as JSON. "
                "Reconnect it in Settings."
            ) from exc

    # ── files ───────────────────────────────────────────────────────────────

    def upload_file(self, job: Job, kind: str, path: str, content_type: str) -> str:
        """Send a finished file to S3 and return its key."""
        filename = os.path.basename(path)
        url, storage_key = self.upload_url(job, kind, filename)
        size = os.path.getsize(path)
        with open(path, "rb") as handle:
            # Streamed rather than read into memory: a sermon master is
            # gigabytes, and this container has other work to do.
            response = httpx.put(
                url,
                content=handle,
                headers={
                    "Content-Type": content_type,
                    "Content-Length": str(size),
                },
                timeout=None,
            )
        response.raise_for_status()
        return storage_key
