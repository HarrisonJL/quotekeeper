# v0.1.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# RetainerConsumer - a minimal example of composing with QuoteKeeper: holds
# a funded retainer and, on settle(), routes it to the market maker if
# QuoteKeeper currently reports them compliant, or back to the treasury if
# not. Demonstrates that is_compliant() is a real primitive another
# contract can gate on, not just a display value.
# Header must end in a blank line (real GenVM v0.2.11 requirement).

from genlayer import *

MAX_COMPLIANCE_BPS = u32(10000)


class RetainerConsumer(gl.Contract):
    quotekeeper_address: Address
    agreement_id: str
    min_compliance_bps: u32
    mm_payout_address: Address
    treasury_address: Address
    owed_to_mm: u256
    owed_to_treasury: u256

    # Addresses taken as hex strings, not Address, purely so callers (and
    # tests) can pass a plain "0x..." literal without needing an
    # SDK-specific Address type in scope - converted once, here.
    def __init__(
        self,
        quotekeeper_address: str,
        agreement_id: str,
        min_compliance_bps: u32,
        mm_payout_address: str,
        treasury_address: str,
    ) -> None:
        assert min_compliance_bps <= MAX_COMPLIANCE_BPS, f"min_compliance_bps must be <= {MAX_COMPLIANCE_BPS}"
        self.quotekeeper_address = Address(quotekeeper_address)
        self.agreement_id = agreement_id
        self.min_compliance_bps = min_compliance_bps
        self.mm_payout_address = Address(mm_payout_address)
        self.treasury_address = Address(treasury_address)
        self.owed_to_mm = u256(0)
        self.owed_to_treasury = u256(0)

    # Held undivided until settle() decides who it's owed to. A real
    # deployment would separate "unsettled deposits" from "settled but
    # unwithdrawn balances"; kept simple here since this exists to
    # demonstrate the cross-contract read, not to be a production escrow.
    @gl.public.write.payable
    def fund_retainer(self) -> None:
        pass

    # Permissionless - any keeper can trigger settlement. Deterministic:
    # this contract makes no nondet call of its own, it only reads a
    # decision QuoteKeeper's own validator committee already reached.
    @gl.public.write
    def settle(self) -> None:
        qk = gl.get_contract_at(self.quotekeeper_address)
        compliant = qk.view().is_compliant(self.agreement_id, self.min_compliance_bps)
        available = self.balance - self.owed_to_mm - self.owed_to_treasury
        assert available > 0, "nothing to settle"
        if compliant:
            self.owed_to_mm += available
        else:
            self.owed_to_treasury += available

    @gl.public.write
    def withdraw_mm(self) -> None:
        assert gl.message.sender_address == self.mm_payout_address, "only the MM payout address can withdraw"
        amount = self.owed_to_mm
        assert amount > 0, "nothing owed"
        self.owed_to_mm = u256(0)
        gl.get_contract_at(self.mm_payout_address).emit_transfer(value=amount)

    @gl.public.write
    def withdraw_treasury(self) -> None:
        assert gl.message.sender_address == self.treasury_address, "only the treasury address can withdraw"
        amount = self.owed_to_treasury
        assert amount > 0, "nothing owed"
        self.owed_to_treasury = u256(0)
        gl.get_contract_at(self.treasury_address).emit_transfer(value=amount)

    @gl.public.view
    def get_state(self) -> dict:
        return {
            "quotekeeper_address": self.quotekeeper_address.as_hex,
            "agreement_id": self.agreement_id,
            "min_compliance_bps": self.min_compliance_bps,
            "balance": self.balance,
            "owed_to_mm": self.owed_to_mm,
            "owed_to_treasury": self.owed_to_treasury,
        }
