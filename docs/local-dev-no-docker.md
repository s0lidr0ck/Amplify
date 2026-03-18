# Local Development Without Docker

Develop on your machine without Docker. Use cloud-hosted Postgres (free tier). Deploy with Docker on EasyPanel.

## Prerequisites

- Node.js 20+
- Python 3.12+
- npm or pnpm

## 1. Create a Free Postgres Database

Use one of these (no local install):

| Provider | Free tier | Sign up |
|----------|-----------|---------|
| [Neon](https://neon.tech) | 0.5 GB | Create project → copy connection string |
| [Supabase](https://supabase.com) | 500 MB | Create project → Settings → Database → connection string |
| [Railway](https://railway.app) | $5 credit | New project → Add Postgres |

**Connection string format:**
```
postgresql://user:password@host/database?sslmode=require
```

## 2. Environment Setup

Create `.env` in the project root:

```env
# App
APP_URL=http://localhost:3000
API_URL=http://localhost:8000
CORS_ORIGIN=http://localhost:3000

# Database - use your cloud Postgres URL, add +asyncpg for the API
DATABASE_URL=postgresql+asyncpg://user:password@host/db?sslmode=require

# Redis - required for trim jobs; API enqueues, worker processes
REDIS_URL=redis://localhost:6379/0

# Object storage - leave empty for dev (uploads use dev seed)
S3_BUCKET=amplify
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_ENDPOINT=

# Auth
JWT_SECRET=dev-secret-change-in-prod

# Dev mode: creates placeholder trim/transcript/clips without the worker
SYNC_TRANSCRIPT_DEV=true
```

**Neon example:**
```env
DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

## 3. Run the API

```powershell
cd services/api
pip install -e .
alembic upgrade head
python -m uvicorn app.main:app --reload
```

Or use the restart script from project root: `.\restart-services.ps1` (closes existing API/Web first). If port 8000 is stuck, the script will use 8001 and set the web to connect there.

## 4. Run the Web App

In a new terminal:

```powershell
cd apps/web
npm install
npm run dev
```

## 5. Test the Flow

1. Open http://localhost:3000
2. Create a project
3. Source tab → "Upload video" or "Seed source (dev)"
4. Trim tab → set in/out → "Generate sermon master"
5. Transcript tab → "Start transcription"
6. Clip Lab → "Run clip analysis" → edit clips → Export

## Full Trim Flow (Redis + Worker)

To test the real trim pipeline (FFmpeg), you need Redis running on localhost:6379 and the worker. Without Redis, use dev mode instead.

## What You Don't Need Locally

- **Redis** – Set `SYNC_TRIM_DEV=true` in `.env` for instant trim without Redis/worker
- **MinIO/S3** – Dev uses local uploads; real storage comes later
- **Worker** – Set `SYNC_TRANSCRIPT_DEV=true` or `SYNC_TRIM_DEV=true` to create placeholders without Redis/worker

## Deployment (EasyPanel)

Use Docker for production. See `infra/compose/docker-compose.yml` and `infra/easypanel/` for the full stack (Postgres, Redis, MinIO, API, Worker, Web).
