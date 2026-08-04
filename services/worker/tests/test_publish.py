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


# ── Wix ─────────────────────────────────────────────────────────────────────


def wix_credential(**over):
    base = {
        "bearerToken": "t",
        "siteId": "s",
        "collectionId": "Sermons",
        "blogMemberId": "m",
        "apiBase": "https://www.wixapis.com",
        "fieldMap": {"title": "title", "blogUrl": "link", "image": "image"},
    }
    base.update(over)
    return base


def wix_job():
    return make_job(
        {
            "destination": "blog",
            "platform": "wix",
            "title": "Repairing the Altar",
            "markdown": "## One\n\nText.",
            "coverAssetId": "a1",
            "metadata": {"description": "A summary."},
            "sermonDate": "2026-08-02",
            "speakerDisplayName": "Sis. Misti",
        }
    )


def test_wix_names_the_missing_credential_field(tmp_path):
    from worker.publish import _publish_wix

    hub = FakeHub(credential={"bearerToken": "t"})
    job = wix_job()
    with pytest.raises(PublishError) as caught:
        _publish_wix(hub, job, json.loads(job.payload_json), lambda p, m: None)
    # Names the field. "Wix rejected this" sends somebody to the wrong place.
    assert "siteId" in str(caught.value)


def _wix_responses(collection_status: int = 200):
    def fake_post(url, **kwargs):
        if "files/import" in url:
            return httpx.Response(200, json={"file": {"id": "media_1"}})
        if "draft-posts" in url:
            return httpx.Response(
                200,
                json={
                    "draftPost": {
                        "id": "post_1",
                        "url": {"base": "https://nlc.org", "path": "/post/altar"},
                    }
                },
            )
        if "items" in url:
            if collection_status >= 400:
                return httpx.Response(
                    collection_status, json={"message": "unknown field 'speaker'"}
                )
            return httpx.Response(200, json={"dataItem": {"id": "item_1"}})
        return httpx.Response(404, json={"message": "no route"})

    return fake_post


def test_wix_publishes_the_post_and_files_the_item(monkeypatch, tmp_path):
    from worker import publish as pub

    monkeypatch.setattr(pub.httpx, "post", _wix_responses())
    hub = FakeHub(credential=wix_credential())
    job = wix_job()
    out = pub._publish_wix(hub, job, json.loads(job.payload_json), lambda p, m: None)

    assert out["externalId"] == "post_1"
    assert out["externalUrl"] == "https://nlc.org/post/altar"


def test_wix_reports_a_partial_when_the_collection_insert_fails(monkeypatch, tmp_path):
    """The post is live and the collection item is not.

    The only state where a retry must not repeat the whole thing, so the
    post id has to travel out attached to the error.
    """
    from worker import publish as pub

    monkeypatch.setattr(pub.httpx, "post", _wix_responses(collection_status=400))
    hub = FakeHub(credential=wix_credential())
    job = wix_job()

    with pytest.raises(pub.PartialPublish) as caught:
        pub._publish_wix(hub, job, json.loads(job.payload_json), lambda p, m: None)
    assert caught.value.external_id == "post_1"
    assert caught.value.external_url == "https://nlc.org/post/altar"
    assert "unknown field" in str(caught.value)


def test_wix_sends_only_the_fields_the_collection_has(monkeypatch, tmp_path):
    """A collection without a speaker field is a different shape, not an error."""
    from worker import publish as pub

    sent: dict = {}

    def capture(url, **kwargs):
        if "items" in url:
            sent.update(kwargs["json"]["dataItem"]["data"])
        return _wix_responses()(url, **kwargs)

    monkeypatch.setattr(pub.httpx, "post", capture)
    hub = FakeHub(credential=wix_credential())
    job = wix_job()
    pub._publish_wix(hub, job, json.loads(job.payload_json), lambda p, m: None)

    # fieldMap holds title, blogUrl and image only.
    assert set(sent) == {"title", "link", "image"}
    assert sent["link"] == "https://nlc.org/post/altar"


def test_publish_verdict_carries_both_id_and_error_on_partial(monkeypatch, tmp_path):
    """A partial must reach Convex as id AND error on one row."""
    from worker import publish as pub

    def boom(hub, job, payload, on_progress):
        raise pub.PartialPublish(
            "Collection insert rejected",
            external_id="post_1",
            external_url="https://nlc.org/post/altar",
        )

    monkeypatch.setitem(pub.PUBLISHERS, "wix", boom)
    hub = FakeHub(credential={})
    rows = pub.publish(hub, wix_job(), tmp_path)
    assert rows[0]["externalId"] == "post_1"
    assert rows[0]["externalUrl"] == "https://nlc.org/post/altar"
    assert "Collection insert rejected" in rows[0]["error"]
