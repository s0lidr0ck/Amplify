# Amplify Job Processing

## Job Types

| job_type | Input | Output | Blocking |
|----------|-------|--------|----------|
| ingest_source | file upload or YouTube URL | source media record, stored file | Yes |
| trim_sermon | source media + in/out points | sermon master video | Yes |
| transcribe_sermon | sermon master video | transcript, segments, caption source | Yes |
| analyze_clips | sermon audio + transcript | ranked clip candidates | Yes |
| export_clip | clip candidate + adjusted timestamps | exported raw clip | Yes |
| generate_blog | sermon transcript | blog draft | No |
| generate_longform_package | transcript/blog | YouTube package, thumbnail prompts, Facebook post | No |
| ingest_final_reel | uploaded reel + thumbnail | final reel asset | Yes |
| transcribe_final_reel | final reel video | reel transcript, caption source | Yes |
| generate_platform_metadata | reel transcript | per-platform copy drafts | No |
| refresh_metrics | published content | metrics snapshot | No |

## Job States

```
queued → starting → running → completed
                    ↓
              waiting_for_input
                    ↓
              failed / cancelled
```

## Event Types

- `state_changed`
- `step_started`
- `progress`
- `step_completed`
- `artifact_created`
- `warning`
- `requires_input`
- `error`
- `job_completed`
- `job_cancelled`

## Standard Job Payload (API response)

```json
{
  "job_id": "uuid",
  "project_id": "uuid",
  "step_name": "clip_analysis",
  "status": "running",
  "progress_percent": 64,
  "current_message": "Pass 2 of 3: scoring candidate segments",
  "started_at": "2026-03-17T16:15:00Z"
}
```

## Standard Event Payload

```json
{
  "job_id": "uuid",
  "event_type": "progress",
  "message": "Ranking candidate clips",
  "progress_percent": 78,
  "payload": {
    "pass": 3,
    "candidate_count": 22
  },
  "timestamp": "2026-03-17T16:19:22Z"
}
```

## UX Behavior

Every long-running screen shows:

- Status badge
- Progress bar
- Current step message
- Expandable event log
- Retry button on failure
- Output card when ready

## Retry Rules

- Retry creates a new attempt (new job row with `attempt_no` incremented)
- Never mutate or delete job history
- Upstream reruns mark downstream artifacts as `superseded`
