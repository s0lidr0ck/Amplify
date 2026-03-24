"""One-time helper for generating a YouTube refresh token locally."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path


def _bootstrap_path() -> None:
    current = Path(__file__).resolve()
    service_root = current.parents[1]
    if str(service_root) not in sys.path:
        sys.path.insert(0, str(service_root))


_bootstrap_path()

from app.config import settings  # noqa: E402
from app.lib.youtube_publishing import build_youtube_oauth_url, exchange_youtube_auth_code  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a YouTube refresh token for Amplify.")
    parser.add_argument(
        "--redirect-uri",
        default="http://localhost:3000/publish/youtube/callback",
        help="OAuth redirect URI configured in Google Cloud.",
    )
    args = parser.parse_args()

    if not settings.youtube_client_id.strip() or not settings.youtube_client_secret.strip():
        raise SystemExit("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env or .env.txt first.")

    auth_url = build_youtube_oauth_url(redirect_uri=args.redirect_uri)
    print("\nOpen this URL in your browser and approve access:\n")
    print(auth_url)
    print("\nAfter Google redirects, copy the 'code' query parameter and paste it below.\n")

    code = input("Authorization code: ").strip()
    if not code:
        raise SystemExit("No authorization code provided.")

    result = await exchange_youtube_auth_code(code=code, redirect_uri=args.redirect_uri)
    refresh_token = (result.get("refresh_token") or "").strip()
    channel = result.get("channel") or {}

    print("\nOAuth exchange complete.\n")
    if refresh_token:
        print(f"YOUTUBE_REFRESH_TOKEN={refresh_token}")
    else:
        print("No refresh token was returned. Re-run after revoking prior consent or using prompt=consent on a fresh authorization.")

    if channel:
        print(f"YOUTUBE_CHANNEL_ID={channel.get('id', '')}")
        print(f"# Channel: {channel.get('title', '')}")


if __name__ == "__main__":
    asyncio.run(main())
