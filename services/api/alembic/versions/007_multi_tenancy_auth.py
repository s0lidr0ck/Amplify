"""Multi-tenancy auth — add invite_tokens, extend users/organizations, seed asanders

Revision ID: 007
Revises: 006
Create Date: 2026-04-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NLC_ORG_ID = "00000000-0000-0000-0000-000000000001"
ASANDERS_USER_ID = "00000000-0000-0000-0000-000000000002"

# bcrypt hash of "TempPass2026!"
ASANDERS_PASSWORD_HASH = "$2b$12$Ss/09P9m5FlwS.O4pEvWsuS3pviUqJG1PTzNptde0E..3.rhRm5ue"


def upgrade() -> None:
    # --- organizations: add plan, is_active, settings_json ---
    op.add_column("organizations", sa.Column("plan", sa.String(50), server_default="starter", nullable=False))
    op.add_column("organizations", sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False))
    op.add_column("organizations", sa.Column("settings_json", JSONB, server_default="{}", nullable=False))

    # Rename the default org to NLC
    op.execute(
        "UPDATE organizations SET name='New Life Church of Perdue', slug='new-life-church' "
        f"WHERE id='{NLC_ORG_ID}'"
    )

    # --- users: add is_active, invited_by_user_id ---
    op.add_column("users", sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False))
    op.add_column(
        "users",
        sa.Column(
            "invited_by_user_id",
            UUID(as_uuid=False),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )

    # --- invite_tokens: new table ---
    op.create_table(
        "invite_tokens",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=False), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("created_by_user_id", UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("role", sa.String(50), server_default="member", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by_user_id", UUID(as_uuid=False), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_invite_tokens_token", "invite_tokens", ["token"], unique=True)
    op.create_index("ix_invite_tokens_org_id", "invite_tokens", ["org_id"])

    # --- seed asanders as super_admin ---
    op.execute(
        f"""
        INSERT INTO users (id, organization_id, email, name, password_hash, role, is_active, created_at, updated_at)
        VALUES (
            '{ASANDERS_USER_ID}',
            '{NLC_ORG_ID}',
            'asanders@pursuitchannel.com',
            'Adam Sanders',
            '{ASANDERS_PASSWORD_HASH}',
            'super_admin',
            true,
            now(),
            now()
        )
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    # Remove seeded user
    op.execute(f"DELETE FROM users WHERE id='{ASANDERS_USER_ID}'")

    # Revert org rename
    op.execute(
        f"UPDATE organizations SET name='Default', slug='default' WHERE id='{NLC_ORG_ID}'"
    )

    # Drop invite_tokens
    op.drop_index("ix_invite_tokens_token", table_name="invite_tokens")
    op.drop_index("ix_invite_tokens_org_id", table_name="invite_tokens")
    op.drop_table("invite_tokens")

    # Remove added user columns
    op.drop_column("users", "invited_by_user_id")
    op.drop_column("users", "is_active")

    # Remove added org columns
    op.drop_column("organizations", "settings_json")
    op.drop_column("organizations", "is_active")
    op.drop_column("organizations", "plan")
