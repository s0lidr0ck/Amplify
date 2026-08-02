"""Amplify is invite-only for now, and will sell packages later. Both are the
same question — what is this church allowed to do — so both are one plan.

These tests are mostly about failing closed. The expensive mistake here is
not refusing someone who should be let in; it is letting in someone who
should not be, which is silent.
"""

from app.lib.plans import DEFAULT_PLAN, PLANS, get_plan, grants_access


def test_a_new_church_is_not_admitted_by_default():
    # The whole point: signing in must not be the same as being approved.
    assert grants_access(DEFAULT_PLAN) is False
    assert grants_access(None) is False


def test_an_unknown_plan_name_grants_nothing():
    # A typo in the database, or a tier dropped in a later release, must not
    # read as "probably fine".
    assert grants_access("gold-tier") is False
    assert grants_access("") is False
    assert get_plan("nonsense").key == DEFAULT_PLAN


def test_approving_a_church_admits_it():
    assert grants_access("beta") is True
    assert get_plan("beta").uploads_per_week is None


def test_suspended_is_distinct_from_pending():
    # Both refuse, but they mean different things to the person on the other
    # end, and the front end shows different screens for them.
    assert grants_access("suspended") is False
    assert get_plan("suspended").key != get_plan("pending").key


def test_the_paid_tiers_carry_their_limits():
    # Not sold yet, but the shape is fixed so the upload counter written
    # against it has something real to read.
    assert get_plan("starter").uploads_per_week == 1
    assert get_plan("unlimited").uploads_per_week is None
    assert grants_access("starter") is True


def test_every_plan_that_denies_access_allows_no_uploads():
    # A plan that says "no access" but "unlimited uploads" is a contradiction
    # waiting for someone to read only half of it.
    for plan in PLANS.values():
        if not plan.grants_access:
            assert plan.uploads_per_week == 0, plan.key


def test_every_plan_is_keyed_by_its_own_name():
    # PLANS is hand-written; a copy-paste that leaves the wrong key would
    # make get_plan("starter").key return something else.
    for key, plan in PLANS.items():
        assert plan.key == key
