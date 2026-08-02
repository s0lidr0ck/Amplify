"""Reconstruct the schema changes made from a machine whose migrations were lost.

The live database is stamped 006, 007 and 008 — three rows in a table meant
to hold one — and none of those three migrations exist in any branch of this
repository. They were applied from a developer machine that is gone. What
they did has been read back off the live schema (2026-08-02) and written
here so a fresh database can be built to match.

This is a reconstruction, not a recovery. It is deliberately ONE migration
rather than three: which change belonged to which revision is unknowable, and
inventing that detail would be a lie that reads as history.

**Not reconstructed:** nine tables the live database carries which no code in
this repository references — invite_tokens, publish_bundles, publish_variants,
published_content, publication_jobs, distribution_assets,
distribution_packages, distribution_targets, metrics_snapshots. They belong
to a publishing design that the current code replaced with
project_content_drafts. They still hold rows in production and are left
alone there; recreating them for fresh databases would propagate a dead
design into every new environment.

Applying this to the live database is a no-op — every column already exists —
and the guards below make that explicit rather than relying on it.

Revision ID: 006
Revises: 005
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def _columns(table: str) -> set[str]:
    bind = op.get_bind()
    return {
        row[0]
        for row in bind.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name=:t"
            ),
            {"t": table},
        )
    }


def upgrade() -> None:
    # Guarded because this migration exists to describe a state the live
    # database is already in. On production every branch below is skipped; on
    # a fresh database every one runs.
    org = _columns("organizations")
    if "plan" not in org:
        op.add_column(
            "organizations",
            sa.Column(
                "plan", sa.String(50), nullable=False, server_default="starter"
            ),
        )
    if "is_active" not in org:
        op.add_column(
            "organizations",
            sa.Column(
                "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
            ),
        )
    if "settings_json" not in org:
        op.add_column(
            "organizations",
            sa.Column(
                "settings_json",
                sa.dialects.postgresql.JSONB(),
                nullable=False,
                server_default=sa.text("'{}'::jsonb"),
            ),
        )

    users = _columns("users")
    if "is_active" not in users:
        op.add_column(
            "users",
            sa.Column(
                "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
            ),
        )
    if "invited_by_user_id" not in users:
        op.add_column(
            "users",
            sa.Column(
                "invited_by_user_id",
                sa.dialects.postgresql.UUID(as_uuid=False),
                sa.ForeignKey("users.id"),
                nullable=True,
            ),
        )

    bind = op.get_bind()
    existing_indexes = {
        row[0]
        for row in bind.execute(
            sa.text(
                "SELECT indexname FROM pg_indexes "
                "WHERE schemaname='public' AND tablename='users'"
            )
        )
    }
    if "ix_users_organization_email" not in existing_indexes:
        op.create_index(
            "ix_users_organization_email",
            "users",
            ["organization_id", "email"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index("ix_users_organization_email", table_name="users")
    op.drop_column("users", "invited_by_user_id")
    op.drop_column("users", "is_active")
    op.drop_column("organizations", "settings_json")
    op.drop_column("organizations", "is_active")
    op.drop_column("organizations", "plan")
