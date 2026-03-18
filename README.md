# Amplify

Sermon-to-content operating system for churches.

## Architecture

- **Web** (`apps/web`): Next.js frontend
- **API** (`services/api`): FastAPI backend
- **Worker** (`services/worker`): Python background jobs (FFmpeg, Faster-Whisper, clip analysis)
- **Postgres**: Primary database
- **Redis**: Queue broker + progress pub/sub
- **Object storage**: S3-compatible for uploads and generated assets

## Local Development

### Option A: No Docker (recommended for local dev)

Use a free cloud Postgres (Neon, Supabase) and run API + web directly. No Docker needed.

See **[docs/local-dev-no-docker.md](docs/local-dev-no-docker.md)** for full instructions.

**Quick start:**
1. Create a free Postgres DB at [Neon](https://neon.tech) or [Supabase](https://supabase.com)
2. Copy `.env.example` to `.env`, set `DATABASE_URL` (add `+asyncpg` before `://`) and `SYNC_TRANSCRIPT_DEV=true`
3. `cd services/api` → `pip install -e .` → `alembic upgrade head` → `python -m uvicorn app.main:app --reload`
4. In another terminal: `cd apps/web` → `npm install` → `npm run dev`

### Option B: With Docker

For parity with production or when you need Redis/MinIO:

```bash
cd infra/compose
docker compose up -d
```

Then follow steps 3–4 from Option A. Use `DATABASE_URL=postgresql+asyncpg://amplify:amplify@localhost:5432/amplify` in `.env`.

### Dev Mode (SYNC_TRANSCRIPT_DEV=true)

When `SYNC_TRANSCRIPT_DEV=true`, the API creates placeholder outputs immediately so you can test the full flow without the worker:

1. Create a project
2. On Source tab: click "Seed source (dev)"
3. On Trim tab: set in/out, click "Generate sermon master"
4. On Transcript tab: click "Start transcription"
5. On Clip Lab: click "Run clip analysis", edit clips, export

### Deployment (EasyPanel)

Use Docker for production. See `infra/compose/` and `infra/easypanel/` for the full stack.

## Project Structure

```
amplify/
├── apps/
│   └── web/           # Next.js frontend
├── services/
│   ├── api/           # FastAPI backend
│   └── worker/        # Python worker
├── packages/
│   └── api-client/    # Generated TS client from OpenAPI
├── infra/
│   ├── docker/        # Dockerfiles
│   ├── compose/       # Docker Compose
│   └── easypanel/     # Deployment notes
└── docs/              # Architecture, schema, product specs
```

## License

Proprietary.
