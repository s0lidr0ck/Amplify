"""Link users to A1:8 hub identities, and make the access default fail closed.

Sign-in moves to the A1:8 hub — the same account behind Crew, Study and
UpScreen — so this service needs somewhere to record which hub identity a
local user row belongs to.

The access control it plugs into already exists: `organizations.plan` was
added from the old machine and the one live church holds "starter". This
migration reuses that column rather than adding a second one beside it. See
app/lib/plans.py for what each plan name grants.

The one behavioural change here is the default. The column arrived defaulting
to "starter", which grants access — so any organisation created without an
explicit plan would be admitted. It now defaults to "pending", which grants
nothing. Existing rows keep whatever they hold; only the default moves.

Revision ID: 007
Revises: 006
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # The hub's user id. Unique so two local rows can never claim one hub
    # account; nullable because the row that predates this migration has no
    # hub identity until that person next signs in.
    op.add_column("users", sa.Column("hub_user_id", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_users_hub_user_id", "users", ["hub_user_id"])
    op.create_index("ix_users_hub_user_id", "users", ["hub_user_id"])

    # The hub's token carries a subject and nothing else — no email claim, no
    # name — so a row is provisioned from the identity we can verify and the
    # rest is filled in afterwards from the user's hub profile.
    #
    # The unique index on (organization_id, email) tolerates this: Postgres
    # treats NULLs as distinct, so several unprofiled users can coexist.
    op.alter_column("users", "email", existing_type=sa.String(255), nullable=True)
    op.alter_column("users", "name", existing_type=sa.String(255), nullable=True)

    # When a church was let in. Nullable: nobody has been through the new
    # approval path yet, and backfilling a date we do not know would be
    # inventing one.
    op.add_column(
        "organizations",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Fail closed. A church created without an explicit plan should wait to be
    # approved, not arrive inside the product.
    op.alter_column(
        "organizations",
        "plan",
        existing_type=sa.String(50),
        server_default="pending",
    )

    # The live church has been using Amplify all along; it keeps its access
    # and gets the approval date it plainly earned.
    op.execute(
        "UPDATE organizations SET approved_at = now() "
        "WHERE approved_at IS NULL AND plan <> 'pending'"
    )


def downgrade() -> None:
    op.alter_column(
        "organizations",
        "plan",
        existing_type=sa.String(50),
        server_default="starter",
    )
    op.drop_column("organizations", "approved_at")
    op.alter_column("users", "name", existing_type=sa.String(255), nullable=False)
    op.alter_column("users", "email", existing_type=sa.String(255), nullable=False)
    op.drop_index("ix_users_hub_user_id", table_name="users")
    op.drop_constraint("uq_users_hub_user_id", "users", type_="unique")
    op.drop_column("users", "hub_user_id")
