"""What a church is allowed to do.

Today this answers one question — is this church approved at all — because
Amplify is invite-only while it settles. It is written as a plan rather than
an `approved` flag because the next question is already known: churches will
subscribe to packages, one upload a week or unlimited, and a boolean would
have to be migrated away the moment that lands.

A plan is a name in the database and a row here. Keeping the limits in code
rather than in columns means changing what "starter" includes is an edit,
not a migration over every church that holds one.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Plan:
    key: str
    label: str
    #: May this church use the product at all?
    grants_access: bool
    #: Uploads permitted per rolling week; None means no limit.
    uploads_per_week: int | None


PLANS: dict[str, Plan] = {
    # Where every new sign-up lands. Deliberately grants nothing: an unknown
    # person reaching the sign-in page should end up in a queue, not in the
    # product with a free tier.
    "pending": Plan("pending", "Awaiting approval", grants_access=False, uploads_per_week=0),
    # Hand-approved during the invite-only period. No limits, no billing.
    "beta": Plan("beta", "Beta", grants_access=True, uploads_per_week=None),
    # Access withdrawn, kept distinct from "pending" so a church that was
    # turned off is not confused with one that was never looked at.
    "suspended": Plan("suspended", "Suspended", grants_access=False, uploads_per_week=0),
    # The paid tiers. Present so the shape is fixed and the upload counter
    # written against it has something real to read; not yet sold.
    "starter": Plan("starter", "Starter", grants_access=True, uploads_per_week=1),
    "unlimited": Plan("unlimited", "Unlimited", grants_access=True, uploads_per_week=None),
}

DEFAULT_PLAN = "pending"


def get_plan(key: str | None) -> Plan:
    """The plan for `key`, falling back to no access.

    An unrecognised plan name — a typo in the database, a tier removed in a
    later release — must fail closed. Letting an unknown string through as
    "probably fine" is how a suspended church gets back in.
    """
    return PLANS.get(key or DEFAULT_PLAN, PLANS[DEFAULT_PLAN])


def grants_access(key: str | None) -> bool:
    return get_plan(key).grants_access
