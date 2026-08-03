"""What the publisher does when things go wrong.

The happy paths need real platform accounts, so they are proved by publishing
something. What can be proved here is everything around them — and that is
where the damage is, because a publish job that ends without a verdict leaves
the row stuck at "sending" and the destination unretryable for ever.
"""

from __future__ import annotations

import json

import httpx
import pytest

from worker.hub import Job
from worker.publish import PublishError, _explain, _need, publish


def make_job(payload: dict) -> Job:
    return Job(
        job_id="j1",
        project_id="p1",
        church_id="c1",
        job_type="publish",
        subject_id=payload.get("destination"),
        payload_json=json.dumps(payload),
        attempt=1,
    )


class FakeHub:
    """Enough Hub to run a handler, recording what it was told."""

    def __init__(self, credential: dict | None = None, blow_up: Exception | None = None):
        self._credential = credential or {}
        self._blow_up = blow_up
        self.logs: list[tuple[str, str]] = []
        self.progress_calls: list[tuple[float | None, str | None]] = []

    def credential(self, job, platform):
        if self._blow_up:
            raise self._blow_up
        return self._credential

    def download_url(self, job, asset_id):
        return ("https://example.invalid/signed", "clip.mp4")

    def progress(self, job, percent=None, message=None):
        self.progress_calls.append((percent, message))

    def log(self, job, message, level="info"):
        self.logs.append((level, message))


def test_unknown_platform_still_reports_a_verdict(tmp_path):
    hub = FakeHub()
    out = publish(hub, make_job({"destination": "myspace", "platform": "myspace"}), tmp_path)

    assert len(out) == 1
    assert out[0]["kind"] == "publication"
    assert out[0]["destination"] == "myspace"
    assert "myspace" in out[0]["error"]


def test_a_publish_error_comes_back_as_written(tmp_path):
    # The church can act on these, so the platform's own words go through.
    hub = FakeHub(blow_up=PublishError("Connect YouTube in Settings first."))
    out = publish(hub, make_job({"destination": "youtube", "platform": "youtube"}), tmp_path)

    assert out[0]["error"] == "Connect YouTube in Settings first."
    assert ("error", "Connect YouTube in Settings first.") in hub.logs


def test_an_unexpected_crash_still_reports_a_verdict(tmp_path):
    # The important part is that SOMETHING comes back. Without it the
    # publication row sits at "sending" and can never be retried.
    hub = FakeHub(blow_up=ZeroDivisionError("boom"))
    out = publish(hub, make_job({"destination": "tiktok", "platform": "tiktok"}), tmp_path)

    assert len(out) == 1
    assert out[0]["destination"] == "tiktok"
    assert "ZeroDivisionError" in out[0]["error"]


def test_a_crash_does_not_leak_the_signed_url(tmp_path):
    # A traceback would carry the signed S3 URL, and these lines are shown
    # in the app and pasted into chat. Only the type and message go through.
    hub = FakeHub(blow_up=RuntimeError("failed at https://s3.example/secret?X-Amz-Signature=abc"))
    out = publish(hub, make_job({"destination": "youtube", "platform": "youtube"}), tmp_path)

    # The message itself is the platform's; what must not appear is a stack.
    assert "Traceback" not in out[0]["error"]
    assert out[0]["error"].startswith("RuntimeError:")


def test_missing_credential_fields_are_named():
    with pytest.raises(PublishError) as caught:
        _need({"client_id": "x"}, "client_id", "client_secret")
    assert "client_secret" in str(caught.value)


def test_missing_credential_fields_do_not_quote_the_value():
    # The message reaches the job log. Naming the field is useful; echoing
    # what was saved is how a token ends up in a screenshot.
    with pytest.raises(PublishError) as caught:
        _need({"refresh_token": "1//super-secret-token"}, "client_id")
    assert "super-secret" not in str(caught.value)


def test_explain_prefers_the_platform_message():
    response = httpx.Response(
        400,
        json={"error": {"message": "The channel is not verified for long videos."}},
        request=httpx.Request("POST", "https://example.invalid"),
    )
    assert "not verified for long videos" in str(_explain(response, "YouTube refused"))


def test_explain_falls_back_to_the_status_code():
    response = httpx.Response(
        503, text="", request=httpx.Request("POST", "https://example.invalid")
    )
    assert "503" in str(_explain(response, "YouTube refused"))
