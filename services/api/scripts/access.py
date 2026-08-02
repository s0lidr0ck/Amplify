"""Approve, suspend and inspect church access.

Amplify is invite-only: a new sign-in creates a church on the "pending" plan,
which grants nothing. This script is how that queue gets worked.

    python -m scripts.access list                 # everyone, newest first
    python -m scripts.access pending              # just the queue
    python -m scripts.access approve <org-id>     # let them in (beta)
    python -m scripts.access approve <org-id> --plan starter
    python -m scripts.access suspend <org-id>     # turn access off
    python -m scripts.access name <org-id> "Grace Fellowship"

A script rather than an admin page, deliberately: an approval UI is a
permanent surface with its own auth story, and the queue is currently short
enough to work from a terminal. When it stops being short, the plan column
is already the right shape for a page to edit.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.db import async_session
from app.lib.plans import PLANS, get_plan
from app.models import Organization, User


async def _rows(only_pending: bool = False) -> list[tuple[Organization, int, str | None]]:
    async with async_session() as db:
        query = select(Organization).order_by(Organization.created_at.desc())
        if only_pending:
            query = query.where(Organization.plan == "pending")
        orgs = list(await db.scalars(query))

        out = []
        for org in orgs:
            members = await db.scalar(
                select(func.count(User.id)).where(User.organization_id == org.id)
            )
            # The first member's email is the most useful label available:
            # the hub token carries no email, so this is populated only once
            # the web app has sent the user's profile.
            contact = await db.scalar(
                select(User.email)
                .where(User.organization_id == org.id, User.email.isnot(None))
                .limit(1)
            )
            out.append((org, members or 0, contact))
        return out


def _print(rows) -> None:
    if not rows:
        print("Nothing to show.")
        return
    print(f"{'ORG ID':38}  {'PLAN':12}  {'PEOPLE':>6}  NAME / CONTACT")
    print("-" * 96)
    for org, members, contact in rows:
        plan = get_plan(org.plan)
        mark = " " if plan.grants_access else "*"
        label = org.name or "(unnamed)"
        if contact:
            label = f"{label}  <{contact}>"
        print(f"{mark}{org.id:37}  {org.plan:12}  {members:>6}  {label}")
    print("\n* = no access")


async def cmd_list(args) -> int:
    _print(await _rows(only_pending=args.command == "pending"))
    return 0


async def _set_plan(org_id: str, plan_key: str) -> int:
    if plan_key not in PLANS:
        print(f"Unknown plan '{plan_key}'. Known: {', '.join(sorted(PLANS))}")
        return 2
    async with async_session() as db:
        org = await db.get(Organization, org_id)
        if org is None:
            print(f"No church with id {org_id}.")
            return 1
        was = org.plan
        org.plan = plan_key
        # Stamped on the way in only. Keeping the original approval date
        # through a suspend-and-restore is more useful than tracking the
        # latest toggle.
        if get_plan(plan_key).grants_access and org.approved_at is None:
            org.approved_at = datetime.now(timezone.utc)
        await db.commit()
        print(f"{org.name or org.id}: {was} -> {plan_key}")
        return 0


async def cmd_approve(args) -> int:
    return await _set_plan(args.org_id, args.plan)


async def cmd_suspend(args) -> int:
    return await _set_plan(args.org_id, "suspended")


async def cmd_name(args) -> int:
    async with async_session() as db:
        org = await db.get(Organization, args.org_id)
        if org is None:
            print(f"No church with id {args.org_id}.")
            return 1
        org.name = args.name
        await db.commit()
        print(f"{args.org_id}: named '{args.name}'")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="every church")
    sub.add_parser("pending", help="churches waiting for approval")

    approve = sub.add_parser("approve", help="grant access")
    approve.add_argument("org_id")
    approve.add_argument(
        "--plan",
        default="beta",
        help="plan to grant (default: beta)",
    )

    suspend = sub.add_parser("suspend", help="withdraw access")
    suspend.add_argument("org_id")

    rename = sub.add_parser("name", help="give a church a readable name")
    rename.add_argument("org_id")
    rename.add_argument("name")

    args = parser.parse_args()
    handler = {
        "list": cmd_list,
        "pending": cmd_list,
        "approve": cmd_approve,
        "suspend": cmd_suspend,
        "name": cmd_name,
    }[args.command]
    return asyncio.run(handler(args))


if __name__ == "__main__":
    sys.exit(main())
