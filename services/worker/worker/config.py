"""Worker configuration."""

from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env from project root (parent of services/worker)
_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_ENV_FILE = _ROOT / ".env"
# override=False so env vars (e.g. API_URL from restart script) take precedence over .env
for candidate in (_ENV_FILE, Path.cwd() / ".env", Path.cwd().parent.parent / ".env"):
    if candidate.exists():
        load_dotenv(candidate, override=False)
        break


class Settings(BaseSettings):
    """Worker settings from environment."""

    redis_url: str = "redis://localhost:6379/0"
    database_url: str = "postgresql+asyncpg://amplify:amplify@localhost:5432/amplify"
    api_url: str = "http://localhost:8000"

    def database_url_clean(self) -> str:
        """URL without ssl params (asyncpg needs ssl via connect_args, not URL)."""
        url = self.database_url
        for param in ("sslmode", "ssl"):
            if f"{param}=" in url:
                p = urlparse(url)
                qs = parse_qs(p.query)
                qs.pop(param, None)
                new_query = urlencode(qs, doseq=True)
                url = urlunparse(p._replace(query=new_query))
        return url

    def database_connect_args(self) -> dict:
        """connect_args for asyncpg when SSL is disabled."""
        url = self.database_url
        if "sslmode=disable" in url or "ssl=false" in url:
            return {"ssl": False}
        return {}
    upload_dir: str = "uploads"
    s3_bucket: str = "amplify"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_endpoint: str = ""
    s3_region: str = "us-east-1"

    class Config:
        env_file = str(_ENV_FILE) if _ENV_FILE.exists() else ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
