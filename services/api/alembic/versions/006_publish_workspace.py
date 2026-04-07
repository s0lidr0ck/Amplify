"""Add publish_bundles and publish_variants tables

Revision ID: 006
Revises: 005
Create Date: 2026-04-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "publish_bundles",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("project_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("organization_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("bundle_type", sa.String(length=50), nullable=False),
        sa.Column("label", sa.String(length=500), nullable=True),
        sa.Column("thumbnail_asset_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),
        sa.Column("week_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["thumbnail_asset_id"], ["media_assets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "publish_variants",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("bundle_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("platform", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tags", JSONB(), nullable=True),
        sa.Column("hashtags", JSONB(), nullable=True),
        sa.Column("extra_json", JSONB(), nullable=True),
        sa.Column("media_asset_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("publish_status", sa.String(length=50), nullable=False, server_default="draft"),
        sa.Column("publish_result_json", JSONB(), nullable=True),
        sa.Column("ai_generated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["bundle_id"], ["publish_bundles.id"]),
        sa.ForeignKeyConstraint(["media_asset_id"], ["media_assets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bundle_id", "platform", name="uq_publish_variants_bundle_platform"),
    )


def downgrade() -> None:
    op.drop_table("publish_variants")
    op.drop_table("publish_bundles")
