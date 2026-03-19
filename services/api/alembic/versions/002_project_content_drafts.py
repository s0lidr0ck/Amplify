"""Add project content drafts

Revision ID: 002
Revises: 001
Create Date: 2026-03-19

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "project_content_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=False), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("draft_kind", sa.String(100), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_project_content_drafts_project_kind",
        "project_content_drafts",
        ["project_id", "draft_kind"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_project_content_drafts_project_kind", table_name="project_content_drafts")
    op.drop_table("project_content_drafts")
