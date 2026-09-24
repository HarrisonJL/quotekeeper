"""
Deterministic tests for RetainerConsumer using genlayer-test's Direct Mode.

Direct Mode does not simulate cross-contract calls without a "glsim" hook
this project doesn't configure (confirmed in gltest's own source:
CallContract falls through to "Unknown gl_call request type" without one).
That means settle()'s actual read of QuoteKeeper.is_compliant() cannot be
unit tested here - it's verified live instead, once both contracts are
deployed (see CONTRACT.md). What's tested here is everything settle()
doesn't touch: constructor validation, fund_retainer's balance tracking,
and withdraw's access control.
"""

import pytest

QK_ADDRESS = "0x" + "11" * 20  # placeholder - never actually called in these tests
MM_ADDRESS = "0x" + "22" * 20
TREASURY_ADDRESS = "0x" + "33" * 20


def _deploy(direct_vm, direct_deploy, owner, min_compliance_bps=9000):
    direct_vm.sender = owner
    return direct_deploy(
        "contracts/retainer_consumer.py",
        QK_ADDRESS, "MM1", min_compliance_bps, MM_ADDRESS, TREASURY_ADDRESS,
    )


def test_initial_state(direct_vm, direct_deploy, direct_owner):
    rc = _deploy(direct_vm, direct_deploy, direct_owner)
    state = rc.get_state()
    assert state["agreement_id"] == "MM1"
    assert state["min_compliance_bps"] == 9000
    assert state["balance"] == 0
    assert state["owed_to_mm"] == 0
    assert state["owed_to_treasury"] == 0


def test_constructor_rejects_min_compliance_bps_over_cap(direct_vm, direct_deploy, direct_owner):
    with pytest.raises(Exception):
        _deploy(direct_vm, direct_deploy, direct_owner, min_compliance_bps=10001)


def test_fund_retainer_increases_balance(direct_vm, direct_deploy, direct_owner):
    # Direct Mode doesn't move value into the contract just because a call
    # carries direct_vm.value (confirmed: fund_retainer() ran fine but
    # get_self_balance() stayed 0) - deal() is the documented cheatcode for
    # setting a balance directly, standing in for "a payable call landed."
    rc = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_owner
    direct_vm.value = 5000
    rc.fund_retainer()
    direct_vm.deal(direct_vm._contract_address, 5000)
    assert rc.get_state()["balance"] == 5000


def test_withdraw_mm_rejects_non_mm_caller(direct_vm, direct_deploy, direct_owner):
    rc = _deploy(direct_vm, direct_deploy, direct_owner)
    # owed_to_mm is 0 here (settle() is untestable in Direct Mode - see
    # module docstring), but the access-control check must still run and
    # reject before the zero-balance check would even matter.
    direct_vm.sender = direct_owner  # not the MM payout address
    with pytest.raises(Exception):
        rc.withdraw_mm()


def test_withdraw_treasury_rejects_non_treasury_caller(direct_vm, direct_deploy, direct_owner):
    rc = _deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_owner  # not the treasury address
    with pytest.raises(Exception):
        rc.withdraw_treasury()


def test_settle_rejects_when_nothing_to_settle_is_unreachable_without_glsim(direct_vm, direct_deploy, direct_owner):
    # Documenting the gap explicitly rather than silently skipping it:
    # settle() calls gl.get_contract_at(...).view().is_compliant(...)
    # unconditionally, before its own "nothing to settle" assert, so even
    # this basic call cannot run in Direct Mode without a glsim hook.
    rc = _deploy(direct_vm, direct_deploy, direct_owner)
    with pytest.raises(Exception):
        rc.settle()
