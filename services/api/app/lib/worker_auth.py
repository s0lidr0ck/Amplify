"""Guard the internal API the worker calls.

`/api/internal/*` is how the worker reports job progress and files finished
transcripts. It is machine-to-machine: there is no user behind it, so user
auth is the wrong shape. It needs a shared secret instead — and it needs
*something*, because these routes write job status and transcript rows.

The secret is the service's own `jwt_secret`, which both processes already
read from the same environment, so nothing new has to be distributed.
"""

from __future__ import annotations

import hmac
import logging

from fastapi import Header, HTTPException, status

from app.config import settings

logger = logging.getLogger(__name__)

_DEFAULT_SECRET = "change-me-in-production"


async def worker_only(x_worker_secret: str | None = Header(None)) -> None:
    """Refuse anything that is not the worker.

    Fails closed when the secret is still the shipped default: a deployment
    that never set one would otherwise be protected by a value printed in
    this repository, which is worse than no protection because it looks like
    some.
    """
    expected = settings.jwt_secret
    if not expected or expected == _DEFAULT_SECRET:
        logger.error(
            "internal API called with no JWT_SECRET configured; refusing. "
            "Set JWT_SECRET on both the API and the worker."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal API is not configured.",
        )
    if not x_worker_secret or not hmac.compare_digest(x_worker_secret, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authorised.",
        )
