"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("timezone", sa.String(50), server_default="UTC"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)
    op.execute(
        "INSERT INTO organizations (id, name, slug, timezone) VALUES "
        "('00000000-0000-0000-0000-000000000001', 'Default', 'default', 'UTC')"
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), server_default="member"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_organization_email", "users", ["organization_id", "email"], unique=True)

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("speaker", sa.String(255), nullable=False),
        sa.Column("sermon_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_projects_org_date", "projects", ["organization_id", "sermon_date"])

    op.create_table(
        "media_assets",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("asset_kind", sa.String(50), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=True),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("parent_asset_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("media_assets.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_media_assets_project_kind", "media_assets", ["project_id", "asset_kind", "status"])

    op.create_table(
        "trim_operations",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("source_asset_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("media_assets.id"), nullable=False),
        sa.Column("output_asset_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("media_assets.id"), nullable=True),
        sa.Column("start_seconds", sa.Float(), nullable=False),
        sa.Column("end_seconds", sa.Float(), nullable=False),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "transcripts",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("media_assets.id"), nullable=False),
        sa.Column("transcript_scope", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("language", sa.String(20), server_default="en"),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("cleaned_text", sa.Text(), nullable=True),
        sa.Column("segments_json", postgresql.JSONB(), nullable=True),
        sa.Column("word_timestamps_json", postgresql.JSONB(), nullable=True),
        sa.Column("is_current", sa.Boolean(), server_default="true"),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_transcripts_asset_current", "transcripts", ["asset_id", "is_current"])

    op.create_table(
        "clip_analysis_runs",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("sermon_asset_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("media_assets.id"), nullable=False),
        sa.Column("transcript_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("transcripts.id"), nullable=False),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("model_version", sa.String(100), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_clip_analysis_runs_project", "clip_analysis_runs", ["project_id"])

    op.create_table(
        "clip_candidates",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("analysis_run_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("clip_analysis_runs.id"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("hook_text", sa.Text(), nullable=True),
        sa.Column("start_seconds", sa.Float(), nullable=False),
        sa.Column("end_seconds", sa.Float(), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("status", sa.String(50), server_default="draft"),
        sa.Column("selected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("analysis_payload_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_clip_candidates_run_score", "clip_candidates", ["analysis_run_id", "score"])

    op.create_table(
        "processing_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("job_type", sa.String(100), nullable=False),
        sa.Column("subject_type", sa.String(100), nullable=True),
        sa.Column("subject_id", postgresql.UUID(as_uuid=False), nullable=True),
        sa.Column("parent_job_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("processing_jobs.id"), nullable=True),
        sa.Column("attempt_no", sa.Integer(), server_default="1"),
        sa.Column("status", sa.String(50), server_default="queued"),
        sa.Column("progress_percent", sa.Integer(), nullable=True),
        sa.Column("current_step", sa.String(200), nullable=True),
        sa.Column("current_message", sa.String(500), nullable=True),
        sa.Column("queue_name", sa.String(100), nullable=True),
        sa.Column("worker_name", sa.String(100), nullable=True),
        sa.Column("idempotency_key", sa.String(255), nullable=True),
        sa.Column("triggered_by_user_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("error_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_processing_jobs_project_status", "processing_jobs", ["project_id", "status", "created_at"])

    op.create_table(
        "processing_job_events",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("processing_job_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("processing_jobs.id"), nullable=False),
        sa.Column("sequence_no", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("step_code", sa.String(100), nullable=True),
        sa.Column("level", sa.String(20), nullable=True),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("progress_percent", sa.Integer(), nullable=True),
        sa.Column("payload_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_processing_job_events_job_seq", "processing_job_events", ["processing_job_id", "sequence_no"], unique=True)


def downgrade() -> None:
    op.drop_table("processing_job_events")
    op.drop_table("processing_jobs")
    op.drop_table("clip_candidates")
    op.drop_table("clip_analysis_runs")
    op.drop_table("transcripts")
    op.drop_table("trim_operations")
    op.drop_table("media_assets")
    op.drop_table("projects")
    op.drop_table("users")
    op.drop_table("organizations")
