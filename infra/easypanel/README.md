# EasyPanel Deployment

Deploy Amplify as multiple app services in one EasyPanel project.

## Services

- **amplify-web**: Next.js frontend (port 3000)
- **amplify-api**: FastAPI backend (port 8000)
- **amplify-worker**: Python worker (no public port)
- **postgres**: Database
- **redis**: Queue and cache

## Build

Each service uses its own Dockerfile from `infra/docker/`.

## Environment Variables

See `.env.example` in repo root. Configure in EasyPanel service settings.

## Migrations

Run migrations as part of API startup or via a one-off job before first API deploy.
