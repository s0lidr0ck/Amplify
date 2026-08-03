"""Worker configuration."""

from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load environment files from project root (parent of services/worker)
_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_ENV_FILE = _ROOT / ".env"
_ENV_TXT_FILE = _ROOT / ".env.txt"
# override=False so env vars (e.g. API_URL from restart script) take precedence over .env
for candidate in (
    _ENV_FILE,
    _ENV_TXT_FILE,
    Path.cwd() / ".env",
    Path.cwd() / ".env.txt",
    Path.cwd().parent.parent / ".env",
    Path.cwd().parent.parent / ".env.txt",
):
    if candidate.exists():
        load_dotenv(candidate, override=False)
        break


class Settings(BaseSettings):
    """Worker settings from environment."""

    redis_url: str = "redis://localhost:6379/0"
    database_url: str = "postgresql+asyncpg://amplify:amplify@localhost:5432/amplify"
    api_url: str = "http://localhost:8000"
    # Where the worker asks for work. Convex's HTTP host — the .site domain,
    # not .cloud, which serves functions rather than HTTP routes.
    hub_url: str = "https://hushed-chinchilla-210.convex.site"
    # Shared with the Convex deployment. The worker is a machine, not a user:
    # this says "I am the worker", never "I may touch this church".
    amplify_worker_secret: str = ""
    # Which Whisper model this box runs. Smaller is faster and hungrier for
    # nothing; the cost is accuracy on names and scripture references, which
    # is exactly the text that gets published. Benchmark before choosing:
    # services/worker/bench_whisper.py
    whisper_model: str = "large-v3"
    # "cuda" or "cpu", and the matching compute type. Stated rather than
    # auto-detected: on a box that shares its GPU with other work, silently
    # falling back to CPU turns a five-minute job into an hour and nothing
    # says so.
    whisper_device: str = "auto"
    whisper_compute_type: str = "auto"
    upload_dir: str = "uploads"
    s3_bucket: str = "amplify"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_endpoint: str = ""
    s3_region: str = "us-east-1"

    def database_url_clean(self) -> str:
        """URL without ssl params (asyncpg needs ssl via connect_args, not URL)."""
        url = self.database_url
        for param in ("sslmode", "ssl"):
            if f"{param}=" in url:
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
        extra = "ignore"


settings = Settings()
