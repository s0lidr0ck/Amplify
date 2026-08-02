"""Which browsers may talk to this API.

The web app moved to Vercel, whose preview deployments get a fresh hostname on
every push and so cannot be listed. Matching a pattern instead is the risky
part: anyone can deploy to vercel.app, so the pattern has to pin the team.
"""

from app.config import settings

# Bound to a local before use, deliberately. Asserting directly on
# `settings.is_allowed_origin(...)` makes pytest print the repr of the whole
# Settings object on failure — which includes every API key, refresh token and
# database password this service holds. That output goes to CI logs.
allowed = settings.is_allowed_origin


def test_the_production_app_is_allowed():
    assert allowed("https://amplify.a1-8.com")


def test_local_development_is_allowed():
    for origin in [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ]:
        assert allowed(origin), origin


def test_our_own_vercel_previews_are_allowed():
    assert allowed(
        "https://amplify-jniwvylya-a18-s-projects.vercel.app"
    )


def test_somebody_elses_vercel_deployment_is_not():
    # The whole risk in the pattern. A stranger can create "amplify-evil" on
    # vercel.app in about a minute; they cannot create our team slug.
    for origin in [
        "https://amplify-evil.vercel.app",
        "https://amplify.vercel.app",
        "https://amplify-abc-someone-else.vercel.app",
        "https://a18-s-projects.vercel.app",
    ]:
        assert not allowed(origin), origin


def test_the_pattern_is_anchored_at_both_ends():
    # re.match anchors the start but not the end, so the trailing $ in the
    # pattern is doing real work — without it, everything below matches.
    for origin in [
        "https://amplify-abc-a18-s-projects.vercel.app.evil.com",
        "http://localhost:3000.evil.com",
        "https://evil.com/https://amplify-abc-a18-s-projects.vercel.app",
    ]:
        assert not allowed(origin), origin


def test_nothing_is_allowed_without_an_origin():
    assert not allowed(None)
    assert not allowed("")
