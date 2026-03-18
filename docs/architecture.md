# Amplify Architecture

## Overview

Amplify is a multi-service application:

- **Web**: Next.js frontend
- **API**: FastAPI backend
- **Worker**: Python background jobs
- **Postgres**: Primary database
- **Redis**: Queue broker + progress pub/sub
- **Object storage**: S3-compatible for media

## Service Boundaries

### Web (`apps/web`)

- Presentation only
- Direct browser uploads via signed URLs
- Consumes typed API client
- No direct database access

### API (`services/api`)

- Owns durable state transitions
- Issues signed upload/download URLs
- Creates jobs and validates inputs
- Exposes read models for UI
- Persists job status
- Serves SSE for live updates

### Worker (`services/worker`)

- Long-running, retryable tasks
- Media transforms (FFmpeg)
- Transcription (Faster-Whisper)
- Clip analysis
- Must be idempotent
- Writes status back to Postgres

## Data Flow

```
User → Web → API → Postgres
         ↓
    Object Storage (signed upload)
         ↓
    API enqueues job → Redis
         ↓
    Worker pulls job → processes → updates Postgres
         ↓
    Worker publishes progress → Redis pub/sub
         ↓
    API SSE → Web (live updates)
```

## Realtime Pattern

- **SSE** from API to Web for job progress
- **Polling** fallback if SSE disconnects
- **Postgres** is canonical truth for job state
- **Event stream** is best-effort UX enhancement

## Storage

| Store | Purpose |
|-------|---------|
| Postgres | Users, projects, media metadata, jobs, transcripts, clips |
| Redis | Queue, cache, progress pub/sub |
| Object storage | Source videos, sermon masters, exported clips, thumbnails |

## Security

- Signed URLs for object storage (short expiry)
- JWT or session-based auth for API
- Never expose raw bucket paths to client
- CORS restricted to app origin
