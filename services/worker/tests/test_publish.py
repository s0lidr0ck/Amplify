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
from worker.publish import (
    PublishError,
    _explain,
    _need,
    _publish_tiktok,
    _source_size,
    publish,
)


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
        self.rotations: list[tuple[str, dict]] = []

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

    def rotate_credential(self, job, platform, changes):
        self.rotations.append((platform, changes))


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


def test_explain_handles_google_shape():
    # Google returns `error` as a bare string with the readable sentence in
    # error_description. Reaching for error.message throws, and the whole raw
    # JSON body ends up on screen — which is what happened the first time
    # this ran against a bad credential.
    response = httpx.Response(
        401,
        json={
            "error": "invalid_client",
            "error_description": "The OAuth client was not found.",
        },
        request=httpx.Request("POST", "https://example.invalid"),
    )
    message = str(_explain(response, "YouTube would not accept the saved connection"))
    assert message.endswith("The OAuth client was not found.")
    assert "invalid_client" not in message


def test_explain_handles_meta_shape():
    response = httpx.Response(
        400,
        json={"error": {"message": "The video file is too long for a reel."}},
        request=httpx.Request("POST", "https://example.invalid"),
    )
    assert "too long for a reel" in str(_explain(response, "Instagram refused"))


# ── TikTok's rotating refresh token ─────────────────────────────────────────
#
# TikTok issues a new refresh token every time the old one is used, and
# retires the old one: "You must use the newly-returned token if the value is
# different than the previous one." Amplify read the access token out of that
# response and dropped the rest, so the saved credential went stale the first
# time a publish succeeded and the next one failed with invalid_grant — a
# connection that broke itself by working.


TIKTOK_CREDENTIAL = {
    "client_key": "key",
    "client_secret": "secret",
    "refresh_token": "old_refresh",
}


def tiktok_refresh(monkeypatch, body: dict, status: int = 200):
    """Answer the token call, then stop before anything is uploaded.

    The rotation happens before the clip moves, so failing the job at the
    next step proves the write-back without mocking the whole upload.
    """
    def fake_post(url, **kwargs):
        if "oauth/token" in url:
            return httpx.Response(
                status, json=body, request=httpx.Request("POST", url)
            )
        raise AssertionError(f"unexpected call to {url}")

    def stop(*_args, **_kwargs):
        raise PublishError("stop here")

    monkeypatch.setattr(httpx, "post", fake_post)
    # Sizing the clip is the step after the refresh, and it is a streamed
    # ranged GET rather than a HEAD — see _source_size.
    monkeypatch.setattr(httpx, "stream", stop)


def test_tiktok_saves_the_rotated_refresh_token(monkeypatch):
    hub = FakeHub(credential=dict(TIKTOK_CREDENTIAL))
    tiktok_refresh(
        monkeypatch,
        {"access_token": "at", "refresh_token": "new_refresh"},
    )

    with pytest.raises(PublishError):
        _publish_tiktok(hub, make_job({"assetId": "a1"}), {"assetId": "a1"}, lambda *_: None)

    assert hub.rotations == [("tiktok", {"refresh_token": "new_refresh"})]


def test_tiktok_leaves_an_unchanged_token_alone(monkeypatch):
    # TikTok does not always rotate. Writing back an identical value would
    # be a pointless mutation on every single publish.
    hub = FakeHub(credential=dict(TIKTOK_CREDENTIAL))
    tiktok_refresh(
        monkeypatch,
        {"access_token": "at", "refresh_token": "old_refresh"},
    )

    with pytest.raises(PublishError):
        _publish_tiktok(hub, make_job({"assetId": "a1"}), {"assetId": "a1"}, lambda *_: None)

    assert hub.rotations == []


def test_tiktok_explains_an_error_sent_with_a_200(monkeypatch):
    # TikTok answers 200 with an error body. Checking only the status fell
    # through to a KeyError on access_token, so the job reported a Python
    # traceback instead of the sentence TikTok wrote about what is wrong.
    hub = FakeHub(credential=dict(TIKTOK_CREDENTIAL))
    tiktok_refresh(
        monkeypatch,
        {
            "error": "invalid_grant",
            "error_description": "Refresh token is invalid or expired.",
        },
    )

    with pytest.raises(PublishError) as caught:
        _publish_tiktok(hub, make_job({"assetId": "a1"}), {"assetId": "a1"}, lambda *_: None)

    assert "invalid or expired" in str(caught.value)
    assert hub.rotations == []


# ── Sizing the source file ──────────────────────────────────────────────────
#
# The download URL is signed for GET, and SigV4 puts the HTTP method into the
# signature. A HEAD against a GET-signed URL is a 403 every time, however
# healthy the object and the credentials are — which is exactly how the first
# real YouTube upload died: Google already authenticated, the file sitting in
# the bucket, and a 403 that read like a permissions problem.


class FakeStream:
    """Enough of httpx.stream's context manager to size a file."""

    def __init__(self, headers: dict, status: int = 206):
        self.headers = headers
        self.status_code = status

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "boom",
                request=httpx.Request("GET", "https://example.invalid"),
                response=httpx.Response(self.status_code),
            )


def test_size_comes_from_a_ranged_get_not_a_head(monkeypatch):
    seen = {}

    def fake_stream(method, url, **kwargs):
        seen["method"] = method
        seen["range"] = kwargs.get("headers", {}).get("Range")
        return FakeStream({"content-range": "bytes 0-0/2147483648"})

    monkeypatch.setattr(httpx, "stream", fake_stream)
    monkeypatch.setattr(
        httpx,
        "head",
        lambda *a, **k: pytest.fail("HEAD is signed differently and 403s"),
    )

    assert _source_size("https://s3.example/signed-for-get") == 2147483648
    assert seen["method"] == "GET"
    assert seen["range"] == "bytes=0-0"


def test_size_says_so_when_the_range_is_ignored(monkeypatch):
    # A server that answers 200 with the whole body tells us nothing about
    # the total. Better to stop than to start an upload declaring a length
    # that is wrong, which YouTube rejects only after every byte is sent.
    monkeypatch.setattr(
        httpx, "stream", lambda method, url, **k: FakeStream({}, status=200)
    )
    with pytest.raises(PublishError) as caught:
        _source_size("https://s3.example/signed-for-get")
    assert "how big" in str(caught.value)
