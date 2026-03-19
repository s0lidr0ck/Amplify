"""Add project source fields

Revision ID: 004
Revises: 003
Create Date: 2026-03-19

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("source_type", sa.String(length=50), nullable=True))
    op.add_column("projects", sa.Column("source_url", sa.Text(), nullable=True))
    op.execute("UPDATE projects SET source_type = 'upload' WHERE source_type IS NULL")
    op.alter_column("projects", "source_type", nullable=False)


def downgrade() -> None:
    op.drop_column("projects", "source_url")
    op.drop_column("projects", "source_type")
