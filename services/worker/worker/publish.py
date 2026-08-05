"""Putting it on the internet.

Four platforms, four different ideas of what an upload is:

  YouTube    hands you a URL and you push bytes at it
  Instagram  fetches the file from a URL you give it, then you publish it
  TikTok     hands you a URL and you push bytes at it, then you poll
  Facebook   takes a message and posts it

This runs on the worker rather than in Convex for the same reason the trims
do: a sermon master is a couple of gigabytes, and that is not a thing to push
through a serverless function with a request timeout. The worker already has
the queue, the retries, the progress reporting and a link built for moving
video.

Nothing here holds a credential longer than the job. Each handler asks the
hub for it at the moment of use, and the hub only answers while this worker
still holds the claim.

Two rules everything here follows:

  Never log the credential. Not the token, not a prefix of it, not its
  length. These messages go to the job log, which people paste into chat —
  that is exactly how the AWS keys in this repo got exposed.

  Report the platform's own words. "Upload failed" sends somebody to the
  wrong place; "The channel has not been verified for videos over 15
  minutes" tells them what to actually go and do.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Callable

import httpx

from worker.hub import Hub, Job
from worker.loop import handles

logger = logging.getLogger(__name__)

# Long: these are file uploads over somebody else's link, and a timeout in
# the middle of one costs the whole transfer.
UPLOAD_TIMEOUT = httpx.Timeout(connect=30.0, read=600.0, write=None, pool=30.0)
API_TIMEOUT = 60.0

GRAPH = "https://graph.facebook.com/v21.0"


class PublishError(RuntimeError):
    """Something the church can act on, safe to show and safe to log."""


def _need(credential: dict[str, Any], *keys: str) -> list[str]:
    """Pull required fields, naming the missing one rather than KeyError-ing.

    A connection saved with the wrong shape fails at publish time, weeks
    after somebody pasted it, usually against a deadline. Saying which field
    is absent turns a mystery into a two-minute fix.
    """
    out = []
    for key in keys:
        value = credential.get(key)
        if not value:
            raise PublishError(
                f"The saved connection has no {key}. Reconnect it in Settings."
            )
        out.append(str(value))
    return out


def _source_size(url: str) -> int:
    """How many bytes the signed URL points at.

    Deliberately not a HEAD. The URL is signed for GET, and SigV4 puts the
    HTTP method into the signature — so HEAD against a GET-signed URL is a
    403 every time, however healthy the object and the credentials are. It
    reads exactly like a permissions problem and is nothing of the kind: the
    first real YouTube upload died here, with Google already authenticated
    and the file sitting in the bucket.

    A one-byte ranged GET asks the same question with the signature we have.
    Streamed, so that a server which ignored the Range header would cost a
    dropped connection rather than a two-gigabyte download.
    """
    with httpx.stream(
        "GET",
        url,
        headers={"Range": "bytes=0-0"},
        timeout=API_TIMEOUT,
        follow_redirects=True,
    ) as probe:
        probe.raise_for_status()
        # "bytes 0-0/1234567" — the total is what we came for.
        total = probe.headers.get("content-range", "").rsplit("/", 1)[-1]

    if not total.isdigit():
        raise PublishError(
            "Could not work out how big the video file is, so the upload "
            "would have been rejected part way through. Try again."
        )
    return int(total)


def _explain(response: httpx.Response, what: str) -> PublishError:
    """The platform's complaint, not ours."""
    detail = ""
    try:
        body = response.json()
        # `error` is an object on Meta and TikTok and a bare string on
        # Google, so reaching straight for error.message throws on Google and
        # the whole raw JSON body ends up on screen — which is what happened
        # the first time this ran against a bad credential.
        error = body.get("error")
        nested = error if isinstance(error, dict) else {}
        detail = (
            nested.get("message")
            or nested.get("error_user_msg")
            # Google's readable sentence lives here.
            or body.get("error_description")
            or body.get("message")
            or (error if isinstance(error, str) else "")
            or ""
        )
    except Exception:
        detail = response.text[:300]
    return PublishError(f"{what}: {detail or response.status_code}")


# ── YouTube ─────────────────────────────────────────────────────────────────


def _google_access_token(credential: dict[str, Any]) -> str:
    client_id, client_secret, refresh_token = _need(
        credential, "client_id", "client_secret", "refresh_token"
    )
    response = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=API_TIMEOUT,
    )
    if response.status_code != 200:
        raise _explain(response, "YouTube would not accept the saved connection")
    return response.json()["access_token"]


def _publish_youtube(
    hub: Hub, job: Job, payload: dict[str, Any], on_progress: Callable[[float, str], None]
) -> dict[str, str]:
    credential = hub.credential(job, "youtube")
    token = _google_access_token(credential)

    source_url, _ = hub.download_url(job, payload["assetId"])

    # Ask S3 how big it is before starting. YouTube's resumable endpoint
    # wants the length up front, and a chunked PUT without one is rejected
    # after the whole file has been sent.
    size = _source_size(source_url)

    body = {
        "snippet": {
            "title": str(payload.get("title") or "")[:100],
            "description": str(payload.get("description") or "")[:5000],
            "tags": [str(t) for t in payload.get("tags", [])][:30],
            # 22 is "People & Blogs". Sermons are not one of YouTube's
            # categories, and 22 is where church channels sit in practice.
            "categoryId": "22",
        },
        "status": {
            # Private by default. Amplify's job is to get it onto the
            # channel, not to decide the moment a church's sermon goes
            # public — and an accidental public post cannot be taken back
            # from subscribers who already got the notification. A finisher
            # in Convex sets the real visibility once the thumbnail is on.
            #
            # A short is the exception and says so explicitly: there is no
            # thumbnail to wait for and no finisher scheduled, so a private
            # short would stay private with nothing left to change it.
            "privacyStatus": str(payload.get("privacyStatus") or "private"),
            "selfDeclaredMadeForKids": False,
        },
    }

    start = httpx.post(
        "https://www.googleapis.com/upload/youtube/v3/videos",
        params={"uploadType": "resumable", "part": "snippet,status"},
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": str(size),
            "X-Upload-Content-Type": "video/*",
        },
        json=body,
        timeout=API_TIMEOUT,
    )
    if start.status_code not in (200, 201):
        raise _explain(start, "YouTube refused the upload")
    session_url = start.headers.get("Location")
    if not session_url:
        raise PublishError("YouTube did not give us anywhere to upload to.")

    on_progress(10.0, f"Sending {size // (1024 * 1024)} MB to YouTube")

    # Straight from S3 to YouTube — the bytes never touch this container's
    # disk. A sermon master is gigabytes and the worker box is not sized to
    # hold one per concurrent publish.
    with httpx.stream(
        "GET", source_url, timeout=UPLOAD_TIMEOUT, follow_redirects=True
    ) as source:
        source.raise_for_status()
        sent = httpx.put(
            session_url,
            content=source.iter_bytes(),
            headers={"Content-Length": str(size), "Content-Type": "video/*"},
            timeout=UPLOAD_TIMEOUT,
        )
    if sent.status_code not in (200, 201):
        raise _explain(sent, "YouTube rejected the video")

    video_id = sent.json()["id"]
    return {
        "externalId": video_id,
        "externalUrl": f"https://www.youtube.com/watch?v={video_id}",
    }


# ── Facebook ────────────────────────────────────────────────────────────────


def _publish_facebook(
    hub: Hub, job: Job, payload: dict[str, Any], on_progress: Callable[[float, str], None]
) -> dict[str, str]:
    credential = hub.credential(job, "facebook")
    page_id, token = _need(credential, "page_id", "access_token")

    message = str(payload.get("message") or "").strip()
    if not message:
        raise PublishError("There's nothing written to post.")

    on_progress(40.0, "Posting to the page")
    response = httpx.post(
        f"{GRAPH}/{page_id}/feed",
        data={"message": message, "access_token": token},
        timeout=API_TIMEOUT,
    )
    if response.status_code != 200:
        raise _explain(response, "Facebook refused the post")

    post_id = response.json()["id"]
    return {
        "externalId": post_id,
        "externalUrl": f"https://www.facebook.com/{post_id}",
    }


# ── Instagram ───────────────────────────────────────────────────────────────


def _publish_instagram(
    hub: Hub, job: Job, payload: dict[str, Any], on_progress: Callable[[float, str], None]
) -> dict[str, str]:
    credential = hub.credential(job, "instagram")
    ig_user_id, token = _need(credential, "ig_user_id", "access_token")

    # Instagram fetches the file itself, so it needs a URL it can reach —
    # which is what the signed S3 link is. Four hours is the signature's
    # life and far more than Meta takes.
    source_url, _ = hub.download_url(job, payload["assetId"])

    on_progress(20.0, "Handing the clip to Instagram")
    container = httpx.post(
        f"{GRAPH}/{ig_user_id}/media",
        data={
            "media_type": "REELS",
            "video_url": source_url,
            "caption": str(payload.get("caption") or "")[:2200],
            "access_token": token,
        },
        timeout=API_TIMEOUT,
    )
    if container.status_code != 200:
        raise _explain(container, "Instagram refused the clip")
    creation_id = container.json()["id"]

    # Meta downloads and transcodes before it will publish. Publishing early
    # fails with a message about the container not being ready, so wait.
    deadline = time.monotonic() + 15 * 60
    while True:
        status = httpx.get(
            f"{GRAPH}/{creation_id}",
            params={"fields": "status_code,status", "access_token": token},
            timeout=API_TIMEOUT,
        )
        if status.status_code != 200:
            raise _explain(status, "Instagram stopped answering about the clip")
        code = status.json().get("status_code")
        if code == "FINISHED":
            break
        if code == "ERROR":
            raise PublishError(
                f"Instagram could not process the clip: "
                f"{status.json().get('status') or 'no reason given'}"
            )
        if time.monotonic() > deadline:
            raise PublishError(
                "Instagram is still processing the clip after fifteen minutes. "
                "It may still appear — check the account before sending again."
            )
        on_progress(50.0, "Instagram is processing the clip")
        time.sleep(10)

    on_progress(85.0, "Publishing the reel")
    published = httpx.post(
        f"{GRAPH}/{ig_user_id}/media_publish",
        data={"creation_id": creation_id, "access_token": token},
        timeout=API_TIMEOUT,
    )
    if published.status_code != 200:
        raise _explain(published, "Instagram would not publish the reel")
    media_id = published.json()["id"]

    # The permalink is a second call. Worth making: an id nobody can click is
    # not much of a record, and this is the row somebody opens on Tuesday to
    # check the reel went up.
    link = ""
    try:
        permalink = httpx.get(
            f"{GRAPH}/{media_id}",
            params={"fields": "permalink", "access_token": token},
            timeout=API_TIMEOUT,
        )
        if permalink.status_code == 200:
            link = permalink.json().get("permalink", "")
    except Exception:
        logger.warning("could not fetch the Instagram permalink", exc_info=True)

    return {"externalId": media_id, "externalUrl": link}


# ── TikTok ──────────────────────────────────────────────────────────────────


def _publish_tiktok(
    hub: Hub, job: Job, payload: dict[str, Any], on_progress: Callable[[float, str], None]
) -> dict[str, str]:
    credential = hub.credential(job, "tiktok")
    client_key, client_secret, refresh_token = _need(
        credential, "client_key", "client_secret", "refresh_token"
    )

    refreshed = httpx.post(
        "https://open.tiktokapis.com/v2/oauth/token/",
        data={
            "client_key": client_key,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=API_TIMEOUT,
    )
    # Status is not enough on its own here. TikTok answers 200 with an error
    # body — {"error": "invalid_grant", ...} — so a status check alone falls
    # through to a KeyError on access_token, and the job reports a Python
    # traceback instead of the sentence TikTok wrote about what is wrong.
    granted = refreshed.json() if refreshed.status_code == 200 else {}
    token = granted.get("access_token")
    if not token:
        raise _explain(refreshed, "TikTok would not accept the saved connection")

    # TikTok retires the refresh token as it hands back a new one: "You must
    # use the newly-returned token if the value is different than the
    # previous one." Reading only the access token, which is what this did,
    # left the saved credential stale from the first successful publish — so
    # the second send failed with invalid_grant, and the connection appeared
    # to break itself by working.
    rotated = granted.get("refresh_token")
    if rotated and rotated != refresh_token:
        hub.rotate_credential(job, "tiktok", {"refresh_token": rotated})

    source_url, _ = hub.download_url(job, payload["assetId"])
    size = _source_size(source_url)

    # FILE_UPLOAD rather than PULL_FROM_URL. Pulling requires the URL's
    # domain to be verified in the TikTok developer portal, which an S3
    # bucket is not — so the tidier-looking option is the one that fails for
    # every church. Pushing the bytes needs no domain verification at all.
    #
    # One chunk: clips are seconds long, well under TikTok's 64 MB limit.
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=UTF-8",
    }
    source_info = {
        "source": "FILE_UPLOAD",
        "video_size": size,
        "chunk_size": size,
        "total_chunk_count": 1,
    }

    init = httpx.post(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
        headers=headers,
        json={
            "post_info": {
                "title": str(payload.get("caption") or "")[:2200],
                # Same reasoning as YouTube: Amplify gets it onto the
                # account, a person decides when the world sees it. Unaudited
                # TikTok apps are forced to SELF_ONLY anyway, so anything
                # else would fail for most churches.
                "privacy_level": "SELF_ONLY",
                "disable_comment": False,
            },
            "source_info": source_info,
        },
        timeout=API_TIMEOUT,
    )

    # Direct Post is only for apps TikTok has audited. Everyone else gets a
    # 403 saying "review our integration guidelines", which reads like a
    # mistake in the request and is not one — it is the app's status.
    #
    # So fall back to the creator's inbox, which needs only video.upload and
    # takes no post_info at all. The clip lands in TikTok's drafts and a
    # person finishes it on the phone. Tried in this order rather than going
    # straight to the inbox, so the day the app is audited direct posting
    # starts working on its own.
    note = None
    if init.status_code == 403:
        init = httpx.post(
            "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
            headers=headers,
            json={"source_info": source_info},
            timeout=API_TIMEOUT,
        )
        # No post_info means no caption went with it. Saying so matters:
        # the words Amplify wrote are not on the clip, and somebody has to
        # paste them in before posting.
        # Where it lands is worth being exact about. It is NOT in Drafts,
        # which is where "we uploaded it for you" makes everybody look
        # first. TikTok raises a notification in the Inbox tab and the
        # editing flow opens from there.
        note = (
            "TikTok hasn't audited this app yet, so the clip couldn't go "
            "straight to the profile. It's waiting in the TikTok app: open "
            "the Inbox tab (not Drafts) and tap the notification to finish "
            "and post it. The caption isn't attached — copy it from here."
        )

    if init.status_code != 200:
        raise _explain(init, "TikTok refused the upload")
    data = init.json().get("data", {})
    upload_url = data.get("upload_url")
    publish_id = data.get("publish_id")
    if not upload_url or not publish_id:
        raise _explain(init, "TikTok did not give us anywhere to upload to")

    on_progress(40.0, "Sending the clip to TikTok")
    with httpx.stream(
        "GET", source_url, timeout=UPLOAD_TIMEOUT, follow_redirects=True
    ) as source:
        source.raise_for_status()
        sent = httpx.put(
            upload_url,
            content=source.iter_bytes(),
            headers={
                "Content-Type": "video/mp4",
                "Content-Length": str(size),
                "Content-Range": f"bytes 0-{size - 1}/{size}",
            },
            timeout=UPLOAD_TIMEOUT,
        )
    if sent.status_code not in (200, 201):
        raise _explain(sent, "TikTok rejected the clip")

    # TikTok accepts the bytes and then decides separately whether to keep
    # them. Returning "posted" at the PUT would be a lie a third of the time.
    deadline = time.monotonic() + 10 * 60
    while True:
        status = httpx.post(
            "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
            },
            json={"publish_id": publish_id},
            timeout=API_TIMEOUT,
        )
        if status.status_code != 200:
            raise _explain(status, "TikTok stopped answering about the clip")
        state = status.json().get("data", {}).get("status")
        if state in ("PUBLISH_COMPLETE", "SEND_TO_USER_INBOX"):
            break
        if state == "FAILED":
            reason = status.json().get("data", {}).get("fail_reason", "")
            raise PublishError(f"TikTok could not publish the clip: {reason}")
        if time.monotonic() > deadline:
            raise PublishError(
                "TikTok is still processing the clip after ten minutes. "
                "Check the account before sending again."
            )
        on_progress(75.0, "TikTok is processing the clip")
        time.sleep(10)

    out: dict[str, str] = {"externalId": publish_id, "externalUrl": ""}
    if note:
        out["note"] = note
    return out


PUBLISHERS: dict[str, Callable[..., dict[str, str]]] = {
    "youtube": _publish_youtube,
    "facebook": _publish_facebook,
    "instagram": _publish_instagram,
    "tiktok": _publish_tiktok,
}


@handles("publish")
def publish(hub: Hub, job: Job, scratch: Path) -> list[dict[str, object]]:
    """Send one sermon to one place.

    Always reports a publication, success or failure. A publish job that ends
    without one leaves the row at "sending" and the destination unretryable —
    the church can neither see what happened nor try again.
    """
    payload = json.loads(job.payload_json or "{}")
    destination = payload.get("destination") or job.subject_id or ""
    platform = payload.get("platform") or destination
    # Which reel, when the sermon has several. Echoed back on every verdict
    # so the result lands on the row that asked for it — a sermon with four
    # reels would otherwise show one posted and three still waiting.
    subject = payload.get("subjectId")

    def verdict(**fields: object) -> list[dict[str, object]]:
        row: dict[str, object] = {"kind": "publication", "destination": destination}
        if subject:
            row["subjectId"] = subject
        row.update(fields)
        return [row]

    publisher = PUBLISHERS.get(platform)
    if not publisher:
        return verdict(error=f"Amplify doesn't know how to post to {platform}.")

    def on_progress(percent: float, message: str) -> None:
        hub.progress(job, percent, message)

    hub.progress(job, 5.0, f"Sending to {destination}")
    try:
        result = publisher(hub, job, payload, on_progress)
    except PublishError as exc:
        # Expected badness — a wrong credential, a rejected video, a channel
        # that is not verified. The church can act on all of these, so the
        # message goes through as written.
        hub.log(job, str(exc), level="error")
        return verdict(error=str(exc))
    except Exception as exc:
        # Unexpected badness. The type and message only — a traceback here
        # can carry a signed URL, and these lines are shown in the app.
        logger.exception("publish to %s failed", platform)
        hub.log(job, f"{type(exc).__name__}: {exc}", level="error")
        return verdict(error=f"{type(exc).__name__}: {exc}")

    hub.progress(job, 100.0, f"Posted to {destination}")
    return verdict(
        externalId=result.get("externalId", ""),
        externalUrl=result.get("externalUrl", ""),
    )
