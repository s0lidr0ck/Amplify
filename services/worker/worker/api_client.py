"""Credentials for calling the API's internal endpoints.

The worker reports job progress and files finished transcripts through
`/api/internal/*`. Those routes used to be open to anyone who could reach
the service; they now require a shared secret.

One place, because there are six call sites across three task modules and a
forgotten header does not fail loudly — the job runs to completion, the
result is refused, and the only symptom is a transcription that never
appears.
"""

from __future__ import annotations

from worker.config import settings


def internal_headers() -> dict[str, str]:
    """The header that identifies this process as the worker."""
    return {"X-Worker-Secret": settings.jwt_secret}
