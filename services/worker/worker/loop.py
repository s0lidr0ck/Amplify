"""The worker's main loop: ask for work, do it, say what happened.

This replaces being driven by Redis and arq, with FastAPI on the other end
putting jobs in. There is no FastAPI now, and Convex cannot reach into a
container, so the container asks.

Polling is the point rather than a compromise. The worker needs no inbound
network, no public address and no certificate; it survives its own restarts,
and a deploy in the middle of a quiet hour costs nothing. The price is a
request every few seconds against an empty queue, which is cheap.
"""

from __future__ import annotations

import logging
import signal
import tempfile
import time
from pathlib import Path
from typing import Callable

from worker.config import settings
from worker.hub import Hub, Job, worker_id

logger = logging.getLogger(__name__)

# Fast enough that somebody clicking "transcribe" does not sit wondering, slow
# enough that an idle worker is not hammering the hub.
IDLE_POLL_SECONDS = 5.0

# After an error talking to the hub. Backing off matters more than reacting
# quickly: if Convex is having a bad minute, a hundred workers retrying
# instantly is what turns it into a bad hour.
ERROR_BACKOFF_SECONDS = 30.0

#: jobType -> handler. A handler receives the hub, the job and a scratch
#: directory, and returns the assets it produced.
Handler = Callable[[Hub, Job, Path], list[dict[str, object]]]
HANDLERS: dict[str, Handler] = {}


def handles(job_type: str) -> Callable[[Handler], Handler]:
    def register(fn: Handler) -> Handler:
        HANDLERS[job_type] = fn
        return fn

    return register


class Runner:
    def __init__(self) -> None:
        self.worker = worker_id()
        self.hub = Hub(self.worker)
        self._stopping = False

    def request_stop(self, *_: object) -> None:
        """Finish the job in hand, then stop.

        Killing a transcription half way through wastes the whole thing and
        leaves a claim to time out. A container being redeployed can afford to
        wait for one job.
        """
        if not self._stopping:
            logger.info("stop requested — finishing the current job first")
        self._stopping = True

    def run(self) -> None:
        logger.info(
            "worker %s polling %s for %s",
            self.worker,
            settings.hub_url,
            ", ".join(sorted(HANDLERS)) or "nothing (no handlers registered)",
        )

        while not self._stopping:
            try:
                job = self.hub.claim(list(HANDLERS))
            except Exception:
                logger.warning("could not reach the hub", exc_info=True)
                self._sleep(ERROR_BACKOFF_SECONDS)
                continue

            if job is None:
                self._sleep(IDLE_POLL_SECONDS)
                continue

            self._run_job(job)

        self.hub.close()
        logger.info("worker %s stopped", self.worker)

    def _run_job(self, job: Job) -> None:
        logger.info("job %s (%s) attempt %s", job.job_id, job.job_type, job.attempt)
        handler = HANDLERS.get(job.job_type)

        if handler is None:
            # Claimed something nothing here can do. Fail it rather than
            # holding it: some other worker may know how, and a job nobody
            # finishes is worse than one that fails loudly.
            self.hub.finish(
                job, ok=False, error=f"This worker cannot do {job.job_type}"
            )
            return

        # A directory per job, removed whatever happens. Sermon video fills a
        # disk quickly, and a container that runs out of space fails every
        # subsequent job in ways that look unrelated.
        with tempfile.TemporaryDirectory(prefix="amplify-") as scratch:
            try:
                assets = handler(self.hub, job, Path(scratch))
                self.hub.finish(job, ok=True, assets=assets, message="Finished")
                logger.info("job %s finished", job.job_id)
            except Exception as exc:
                logger.exception("job %s failed", job.job_id)
                # The message reaches the operator's screen, so it says what
                # happened rather than only that something did.
                self.hub.finish(job, ok=False, error=f"{type(exc).__name__}: {exc}")

    def _sleep(self, seconds: float) -> None:
        """Sleep, but wake immediately if asked to stop."""
        deadline = time.monotonic() + seconds
        while not self._stopping and time.monotonic() < deadline:
            time.sleep(min(0.5, max(0.0, deadline - time.monotonic())))


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    # Import for side effects: each module registers its handlers.
    from worker import clips, jobs, publish  # noqa: F401

    runner = Runner()
    signal.signal(signal.SIGTERM, runner.request_stop)
    signal.signal(signal.SIGINT, runner.request_stop)
    runner.run()
