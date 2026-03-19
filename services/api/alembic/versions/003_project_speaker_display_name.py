"""Add speaker display name to projects

Revision ID: 003
Revises: 002
Create Date: 2026-03-19

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("speaker_display_name", sa.String(length=255), nullable=True))
    op.execute("UPDATE projects SET speaker_display_name = speaker WHERE speaker_display_name IS NULL")


def downgrade() -> None:
    op.drop_column("projects", "speaker_display_name")
