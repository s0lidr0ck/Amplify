"""Add speakers table

Revision ID: 005
Revises: 004
Create Date: 2026-03-19

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "speakers",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("organization_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("speaker_name", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.execute(
        """
        INSERT INTO speakers (id, organization_id, speaker_name, display_name, is_active, sort_order)
        VALUES
          ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Chris Tidwell', 'Pastor Chris', true, 10),
          ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Mickey Kelly', 'Brother Mickey', true, 20),
          ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Misty Sanders', 'Sister Misty', true, 30)
        """
    )


def downgrade() -> None:
    op.drop_table("speakers")
