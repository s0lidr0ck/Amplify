"""Making S3's refusal readable.

Two sermon trims failed for weeks showing "400 Bad Request" and nothing else.
The download worked, the trim worked, and the upload was refused — but the
message named neither the file nor the reason, so it read as the trim being
broken. S3 had explained itself every time, in a body raise_for_status threw
away.
"""

from __future__ import annotations

from worker.hub import _s3_reason

ENTITY_TOO_LARGE = """<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>EntityTooLarge</Code><Message>Your proposed upload exceeds the \
maximum allowed size</Message><ProposedSize>6442450944</ProposedSize>\
<MaxSizeAllowed>5368709120</MaxSizeAllowed><RequestId>ABC</RequestId></Error>"""


def test_gives_the_code_and_the_message():
    reason = _s3_reason(ENTITY_TOO_LARGE)
    assert "EntityTooLarge" in reason
    assert "exceeds the maximum allowed size" in reason


def test_falls_back_to_the_code_alone():
    assert _s3_reason("<Error><Code>AccessDenied</Code></Error>") == "AccessDenied"


def test_says_something_when_the_body_is_not_xml():
    assert "upstream exploded" in _s3_reason("upstream exploded")


def test_handles_an_empty_body_rather_than_blowing_up():
    # This runs while handling a failure; it must not add a second one.
    assert _s3_reason("") == "(no response body)"


def test_survives_a_truncated_body():
    assert _s3_reason("<Error><Code>EntityTooLarge") != ""


def test_keeps_it_short_enough_for_a_job_log():
    assert len(_s3_reason("x" * 5000)) <= 300
