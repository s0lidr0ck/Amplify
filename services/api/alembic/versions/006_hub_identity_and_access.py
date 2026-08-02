"""Link users to A1:8 hub identities, and gate access on an approved plan.

Two changes that arrive together because they are the same story: the service
learns who is calling, and learns whether that caller is allowed in.

users.hub_user_id
    The hub's own user id. Amplify holds no passwords — sign-in happens at
    the hub — so this is the only durable link between a session and a row.
    Nullable because rows predating this migration have no hub identity yet;
    unique so two locals can never claim one hub account.

users.email now nullable
    The hub's token carries only a subject. There is no email claim to
    provision from, so a row is created with the identity we can verify and
    the address is filled in later from the user's hub profile.

organizations.plan
    Access control, shaped so subscriptions can grow into it. "pending" is
    the default and grants nothing: a stranger who signs in lands in a queue
    rather than in the product. Approving a church means moving it to a plan
    that grants access.

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


def upgrade() -> None:
    op.add_column("users", sa.Column("hub_user_id", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_users_hub_user_id", "users", ["hub_user_id"])
    op.create_index("ix_users_hub_user_id", "users", ["hub_user_id"])

    # Provisioning happens from a token carrying neither an email nor a name.
    op.alter_column("users", "email", existing_type=sa.String(255), nullable=True)
    op.alter_column("users", "name", existing_type=sa.String(255), nullable=True)

    op.add_column(
        "organizations",
        sa.Column(
            "plan",
            sa.String(50),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "organizations",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )

    # The org that existed before access control did is the one already in
    # use. Locking it out on deploy would be a self-inflicted outage.
    op.execute(
        "UPDATE organizations SET plan = 'unlimited', approved_at = now() "
        "WHERE id = '00000000-0000-0000-0000-000000000001'"
    )


def downgrade() -> None:
    op.drop_column("organizations", "approved_at")
    op.drop_column("organizations", "plan")
    op.alter_column("users", "name", existing_type=sa.String(255), nullable=False)
    op.alter_column("users", "email", existing_type=sa.String(255), nullable=False)
    op.drop_index("ix_users_hub_user_id", table_name="users")
    op.drop_constraint("uq_users_hub_user_id", "users", type_="unique")
    op.drop_column("users", "hub_user_id")
