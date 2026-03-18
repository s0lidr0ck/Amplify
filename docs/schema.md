# Amplify Database Schema

## Tables

### organizations

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | |
| slug | text | unique |
| timezone | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### users

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK |
| email | text | |
| password_hash | text | nullable |
| name | text | |
| role | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### projects

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK |
| title | text | |
| speaker | text | |
| sermon_date | date | |
| status | text | draft, source_ready, trimmed, transcribed, clips_ready, reel_ready, published, archived |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### media_assets

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| asset_kind | text | source_video, sermon_master, clip_export, final_reel_video, thumbnail, caption_file, audio_extract |
| source_type | text | upload, youtube |
| storage_key | text | |
| mime_type | text | |
| filename | text | |
| duration_seconds | float | nullable |
| width | int | nullable |
| height | int | nullable |
| status | text | pending, processing, ready, failed, superseded, archived |
| parent_asset_id | uuid | FK nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### trim_operations

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| source_asset_id | uuid | FK |
| output_asset_id | uuid | FK nullable |
| start_seconds | float | |
| end_seconds | float | |
| status | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### transcripts

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| asset_id | uuid | FK |
| transcript_scope | text | sermon, final_reel |
| status | text | |
| language | text | |
| raw_text | text | |
| cleaned_text | text | nullable |
| segments_json | jsonb | |
| word_timestamps_json | jsonb | nullable |
| is_current | bool | |
| approved_at | timestamptz | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### clip_analysis_runs

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| sermon_asset_id | uuid | FK |
| transcript_id | uuid | FK |
| status | text | |
| model_version | text | nullable |
| started_at | timestamptz | nullable |
| completed_at | timestamptz | nullable |
| summary_json | jsonb | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### clip_candidates

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| analysis_run_id | uuid | FK |
| title | text | |
| hook_text | text | nullable |
| start_seconds | float | |
| end_seconds | float | |
| duration_seconds | float | |
| score | float | |
| status | text | |
| selected_at | timestamptz | nullable |
| analysis_payload_json | jsonb | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### final_reels

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| video_asset_id | uuid | FK |
| thumbnail_asset_id | uuid | FK nullable |
| source_clip_candidate_id | uuid | FK nullable |
| source_clip_asset_id | uuid | FK nullable |
| status | text | |
| notes | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### content_documents

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| source_transcript_id | uuid | FK nullable |
| doc_type | text | blog_post, youtube_package, facebook_long_post, thumbnail_prompts |
| status | text | |
| title | text | nullable |
| body_text | text | nullable |
| structured_payload_json | jsonb | nullable |
| version_no | int | |
| is_current | bool | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### platform_metadata

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| final_reel_id | uuid | FK |
| platform | text | youtube_shorts, facebook, instagram, tiktok |
| status | text | |
| title | text | nullable |
| description | text | nullable |
| caption | text | nullable |
| hashtags_json | jsonb | nullable |
| cta | text | nullable |
| metadata_json | jsonb | nullable |
| version_no | int | |
| is_current | bool | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### published_content

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| final_reel_id | uuid | FK |
| platform | text | |
| platform_content_id | text | nullable |
| permalink | text | nullable |
| published_at | timestamptz | nullable |
| status | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### metrics_snapshots

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| published_content_id | uuid | FK |
| snapshot_time | timestamptz | |
| raw_metrics_json | jsonb | |
| normalized_metrics_json | jsonb | nullable |
| created_at | timestamptz | |

### processing_jobs

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK |
| job_type | text | ingest_source, trim_sermon, transcribe_sermon, analyze_clips, export_clip, etc. |
| subject_type | text | |
| subject_id | uuid | nullable |
| parent_job_id | uuid | FK nullable |
| attempt_no | int | |
| status | text | queued, starting, running, waiting_for_input, completed, failed, cancelled |
| progress_percent | int | nullable |
| current_step | text | nullable |
| current_message | text | nullable |
| queue_name | text | nullable |
| worker_name | text | nullable |
| idempotency_key | text | nullable |
| triggered_by_user_id | uuid | FK nullable |
| started_at | timestamptz | nullable |
| completed_at | timestamptz | nullable |
| error_code | text | nullable |
| error_text | text | nullable |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### processing_job_events

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| processing_job_id | uuid | FK |
| sequence_no | int | |
| event_type | text | state_changed, step_started, progress, step_completed, artifact_created, warning, requires_input, error, job_completed, job_cancelled |
| step_code | text | nullable |
| level | text | nullable |
| message | text | |
| progress_percent | int | nullable |
| payload_json | jsonb | nullable |
| created_at | timestamptz | |

### audit_log

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK nullable |
| actor_user_id | uuid | FK nullable |
| entity_type | text | |
| entity_id | uuid | |
| action | text | |
| before_json | jsonb | nullable |
| after_json | jsonb | nullable |
| created_at | timestamptz | |

## Status Enums

- **Artifact**: pending, processing, ready, failed, superseded, archived
- **Editable**: draft, ready, approved, superseded
- **Job**: queued, starting, running, waiting_for_input, completed, failed, cancelled
- **Project**: draft, source_ready, trimmed, transcribed, clips_ready, reel_ready, published, archived
