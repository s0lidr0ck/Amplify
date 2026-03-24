"""Application configuration."""

import json
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from pydantic import field_validator
from pydantic.aliases import AliasChoices
from pydantic.fields import Field
from pydantic_settings import BaseSettings

# Load environment files from project root (parent of services/api)
_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _ROOT / ".env"
_ENV_TXT_FILE = _ROOT / ".env.txt"

# Load from project root; fallback to cwd.parent.parent when run from services/api.
# Support `.env.txt` as well to match the current local workspace setup.
for candidate in (
    _ENV_FILE,
    _ENV_TXT_FILE,
    Path.cwd() / ".env",
    Path.cwd() / ".env.txt",
    Path.cwd().parent.parent / ".env",
    Path.cwd().parent.parent / ".env.txt",
):
    if candidate.exists():
        load_dotenv(candidate, override=True)
        break


class Settings(BaseSettings):
    """App settings from environment."""

    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ],
        validation_alias=AliasChoices("CORS_ORIGINS", "CORS_ORIGIN"),
    )
    cors_origin_regex: str = r"http://(localhost|127\.0\.0\.1)(:\d+)?$"
    database_url: str = "postgresql+asyncpg://amplify:amplify@localhost:5432/amplify"
    redis_url: str = "redis://localhost:6379/0"
    s3_bucket: str = "amplify"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_endpoint: str = ""
    s3_region: str = "us-east-1"
    upload_dir: str = "uploads"  # Local dir for dev uploads (relative to project root)
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    sync_transcript_dev: bool = False  # When True, create placeholder transcript immediately (no worker)
    sync_trim_dev: bool = False  # When True, create placeholder sermon_master immediately (no worker)
    clip_analysis_model: str = "arn:aws:bedrock:us-east-1:644190502535:inference-profile/us.anthropic.claude-sonnet-4-6"
    clip_analysis_host: str = "us-east-1"
    wix_api_base: str = "https://www.wixapis.com"
    wix_site_id: str = ""
    wix_blog_member_id: str = ""
    wix_bearer_token: str = ""
    youtube_client_id: str = ""
    youtube_client_secret: str = ""
    youtube_refresh_token: str = ""
    youtube_channel_id: str = ""
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_user_access_token: str = ""
    meta_user_token_expires_at: str = ""
    facebook_page_id: str = ""
    facebook_page_access_token: str = ""
    instagram_business_account_id: str = ""
    instagram_access_token: str = ""
    tiktok_client_key: str = ""
    tiktok_client_secret: str = ""
    tiktok_oauth_scope: str = "user.info.basic,user.info.profile,video.publish,video.upload"
    tiktok_access_token: str = ""
    tiktok_open_id: str = ""
    tiktok_refresh_token: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        """Accept JSON arrays or simple comma/newline-separated origin strings."""
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return []
            if text.startswith("["):
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            parts = [part.strip() for part in text.replace("\n", ",").split(",")]
            return [part for part in parts if part]
        return value

    def is_allowed_origin(self, origin: str | None) -> bool:
        """Return True when the given request Origin should receive CORS headers."""
        if not origin:
            return False
        if origin in self.cors_origins:
            return True
        return re.match(self.cors_origin_regex, origin) is not None

    def database_url_clean(self) -> str:
        """URL without ssl params (asyncpg needs ssl via connect_args, not URL)."""
        url = self.database_url
        for param in ("sslmode", "ssl"):
            if f"{param}=" in url:
                from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

                parsed_url = urlparse(url)
                query = parse_qs(parsed_url.query)
                query.pop(param, None)
                new_query = urlencode(query, doseq=True)
                url = urlunparse(parsed_url._replace(query=new_query))
        return url

    def database_connect_args(self) -> dict:
        """connect_args for asyncpg when SSL is disabled."""
        url = self.database_url
        if "sslmode=disable" in url or "ssl=false" in url:
            return {"ssl": False}
        return {}

    class Config:
        env_file = str(_ENV_FILE if _ENV_FILE.exists() else (_ENV_TXT_FILE if _ENV_TXT_FILE.exists() else ".env"))
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra env vars (e.g. CORS_ORIGIN, AWS_BEARER_TOKEN_BEDROCK)


settings = Settings()
