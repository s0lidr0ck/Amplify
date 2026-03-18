"""Quick script to verify database connection and which URL is used."""
import asyncio
from pathlib import Path

from dotenv import load_dotenv

# scripts/ is services/api/scripts/, so go up to project root
load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

from app.config import settings

# Redact password for display
url = settings.database_url
if "@" in url and ":" in url:
    parts = url.split("@")
    user_part = parts[0]
    if ":" in user_part:
        scheme, rest = user_part.split("://", 1)
        user = rest.split(":")[0]
        safe_url = f"{scheme}://{user}:****@{parts[1]}"
    else:
        safe_url = url
else:
    safe_url = url

print("DATABASE_URL (password redacted):", safe_url)


async def test():
    from sqlalchemy.ext.asyncio import create_async_engine
    engine = create_async_engine(
        settings.database_url_clean(),
        connect_args=settings.database_connect_args(),
    )
    try:
        async with engine.connect() as conn:
            result = await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
            print("Connection OK:", result.scalar())
    except Exception as e:
        print("Connection FAILED:", e)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(test())
