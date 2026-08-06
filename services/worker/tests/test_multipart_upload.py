"""Uploading a master too big for one PUT.

S3 refuses a single PUT over 5GiB. A sermon cut from a long service came to
6.64GiB and had been failing every week — three attempts, eight minutes each,
all refused at the same wall after the work was already done.

What is worth pinning here is not that it uploads, but the three things that
go wrong silently: sending the parts in the wrong order, throwing away an
hour of transfer because one part blipped, and leaving six gigabytes of
abandoned parts in the bucket every time it fails.
"""

from __future__ import annotations

import os
import tempfile
from unittest.mock import patch

import pytest

from worker.hub import MULTIPART_THRESHOLD, PART_SIZE, Hub, Job


class FakeResponse:
    def __init__(self, status=200, headers=None, text=""):
        self.status_code = status
        self.headers = headers or {}
        self.text = text

    @property
    def is_error(self):
        return self.status_code >= 400


def a_job():
    return Job(
        job_id="job1",
        project_id="p1",
        church_id="c1",
        job_type="trim",
        subject_id=None,
        payload_json=None,
        attempt=1,
    )


def a_hub(posts):
    """A Hub whose Convex calls are recorded rather than made."""
    hub = Hub.__new__(Hub)
    hub._worker = "test-worker"
    hub._base = "https://example.invalid"

    def fake_post(path, body):
        posts.append((path, body))
        if path == "multipart/create":
            return {"uploadId": "up-1", "storageKey": "Amplify/c1/p1/k/f.mp4"}
        if path == "multipart/part-url":
            return {"uploadUrl": f"https://s3.invalid/part/{body['partNumber']}"}
        return {"ok": True}

    hub._post = fake_post  # type: ignore[method-assign]
    return hub


def a_file(size: int) -> str:
    handle = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    handle.write(b"\0" * size)
    handle.close()
    return handle.name


def test_small_files_still_go_up_in_one_put():
    # The common path must not change: almost every upload is a clip or a
    # cover, and multipart would be four round trips instead of one.
    posts: list = []
    hub = a_hub(posts)
    hub.upload_url = lambda *_: ("https://s3.invalid/put", "key")  # type: ignore
    path = a_file(1024)
    try:
        with patch("worker.hub.httpx.put", return_value=FakeResponse()):
            hub.upload_file(a_job(), "clip", path, "video/mp4")
    finally:
        os.unlink(path)
    assert not any("multipart" in p for p, _ in posts)


def test_parts_are_numbered_from_one_and_in_order():
    # S3 rejects a parts list out of order, and part numbers start at 1 — a
    # zero-based loop is refused only at the end, after everything is sent.
    posts: list = []
    hub = a_hub(posts)
    size = PART_SIZE * 2 + 1024
    path = a_file(size)
    try:
        with patch(
            "worker.hub.httpx.put",
            return_value=FakeResponse(headers={"ETag": '"abc"'}),
        ):
            hub._multipart_upload(a_job(), "sermon_master", path, "video/mp4", size)
    finally:
        os.unlink(path)

    complete = [b for p, b in posts if p == "multipart/complete"][0]
    numbers = [part["partNumber"] for part in complete["parts"]]
    assert numbers == [1, 2, 3]


def test_a_blipping_part_is_retried_rather_than_losing_the_upload():
    posts: list = []
    hub = a_hub(posts)
    size = PART_SIZE + 10
    path = a_file(size)
    attempts = {"n": 0}

    def flaky(*_args, **_kwargs):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise OSError("connection reset")
        return FakeResponse(headers={"ETag": '"ok"'})

    try:
        with patch("worker.hub.httpx.put", side_effect=flaky), patch(
            "worker.hub.time.sleep"
        ):
            hub._multipart_upload(a_job(), "sermon_master", path, "video/mp4", size)
    finally:
        os.unlink(path)

    assert any(p == "multipart/complete" for p, _ in posts)
    assert not any(p == "multipart/abort" for p, _ in posts)


def test_a_part_that_never_succeeds_abandons_the_upload():
    # Without the abort, every failed attempt leaves its parts in the bucket,
    # stored and billed, with nothing pointing at them.
    posts: list = []
    hub = a_hub(posts)
    size = PART_SIZE + 10
    path = a_file(size)
    try:
        with patch(
            "worker.hub.httpx.put", side_effect=OSError("gone")
        ), patch("worker.hub.time.sleep"), pytest.raises(RuntimeError):
            hub._multipart_upload(a_job(), "sermon_master", path, "video/mp4", size)
    finally:
        os.unlink(path)

    assert any(p == "multipart/abort" for p, _ in posts)
    assert not any(p == "multipart/complete" for p, _ in posts)


def test_a_missing_etag_is_a_failure_not_an_empty_part():
    # S3 can answer 200 without an ETag header through a proxy. Recording ""
    # would complete the upload with a part that does not match, and the
    # object would be silently wrong.
    posts: list = []
    hub = a_hub(posts)
    size = PART_SIZE + 10
    path = a_file(size)
    try:
        with patch(
            "worker.hub.httpx.put", return_value=FakeResponse(headers={})
        ), patch("worker.hub.time.sleep"), pytest.raises(RuntimeError):
            hub._multipart_upload(a_job(), "sermon_master", path, "video/mp4", size)
    finally:
        os.unlink(path)
    assert any(p == "multipart/abort" for p, _ in posts)


def test_the_threshold_sits_below_the_5gib_limit():
    # The cap applies to what S3 receives, so the switch has to happen before
    # it, not at it.
    assert MULTIPART_THRESHOLD < 5 * 1024 * 1024 * 1024


def test_parts_stay_within_the_10000_limit_for_a_plausible_master():
    # 10,000 parts is S3's maximum. A three-hour service at high bitrate is
    # the biggest thing this will meet.
    biggest = 200 * 1024 * 1024 * 1024
    assert (biggest + PART_SIZE - 1) // PART_SIZE <= 10_000
