# QuoteKeeper

A reusable market-maker KPI compliance attestor for [GenLayer](https://genlayer.com): register a market-making agreement with its KPI clause and public venue data pages, and any wallet can trigger a real validator committee to independently sample live market quality and reach consensus on whether the MM is meeting its obligations - `PASS` / `FAIL` / `INCONCLUSIVE`, not one dashboard's word.

**Live on GenLayer Studio Next. Testnet only.** (Also live, separately, on Bradbury - see [`CONTRACT.md`](CONTRACT.md).)

## The problem this solves

Market-maker oversight today means trusting the MM's own reporting, or paying a single data vendor whose numbers nobody cross-checks. A plain EVM contract can't read a live order book. A single off-chain oracle recreates the exact conflict of interest the oversight exists to police - whoever controls that one feed controls the verdict. GenLayer's validator committee changes that: multiple independent validators each fetch the same public market-data pages themselves, extract the same figures, and only agree on a verdict if their independent readings actually imply the same decision.

## How it works

`register_agreement(agreement_id, mm_label, clause_text, venue_urls, noise_bps)` - permissionless, and once registered, immutable:

- `clause_text`: the KPI clause in free text (e.g. `"maintain a maximum spread of 2% and minimum depth of $50,000"`). Parsed into `max_spread_bps` / `min_depth_usd` via a single nondet LLM call checked with `gl.eq_principle.strict_eq` - not the decision-margin check below, deliberately (see "Design notes"). If the clause is ambiguous enough that validators can't reproduce the same extracted JSON, registration fails outright rather than silently keeping whichever value the leader guessed.
- `venue_urls`: 1-3 `https://` public pages reporting live spread/depth for the venues being monitored.
- `noise_bps`: how wide a band around each KPI threshold counts as sampling noise rather than a real signal (capped at `MAX_NOISE_BPS = 2000`, 20%).

`sample(agreement_id)` - permissionless, runs the actual consensus check:

```python
def leader_fn() -> str:
    return _fetch_metrics(venue_urls)          # fetch every venue fresh, extract via LLM

def validator_fn(leaders_res) -> bool:
    if not isinstance(leaders_res, gl.vm.Return):
        return False
    mine_data = json.loads(_fetch_metrics(venue_urls))   # this validator's OWN independent reading
    leader_verdict = _local_verdict(leader_data..., max_spread_bps, min_depth_usd, noise_bps)
    my_verdict = _local_verdict(mine_data..., max_spread_bps, min_depth_usd, noise_bps)
    return leader_verdict == my_verdict         # agree on the DECISION, not the number
```

Every validator (leader included) fetches every venue URL live via `gl.nondet.web.render` and extracts `spread_bps`/`depth_usd` via `gl.nondet.exec_prompt`. Each sample increments the agreement's running `pass_count`/`fail_count`/`inconclusive_count`; `compliance_bps` reports `PASS / (PASS + FAIL)` in basis points, excluding `INCONCLUSIVE` from the denominator, and `is_compliant(agreement_id, min_compliance_bps)` is the view a downstream contract calls. [`contracts/retainer_consumer.py`](contracts/retainer_consumer.py) is a small worked example: it holds a funded retainer and, on `settle()`, reads `is_compliant` to decide whether the MM or the treasury gets paid - a real cross-contract call, not a mocked one.

## Design notes

**Decision-margin equivalence: agree on the decision, not the number.** Ballpark and SolvencyOracle both ask "are two numbers within tolerance of each other?" - the right question when the underlying figure (a reserve balance, a stated liability) is genuinely close to static between the leader's fetch and a validator's fetch a few seconds later. Live market data isn't static: spread and depth can legitimately move meaningfully between two fetches seconds apart, so exact numeric agreement is the wrong bar here, and a naive tolerance band on the raw numbers is also wrong - a value near a threshold can swing to either side between fetches even when nothing is actually wrong. QuoteKeeper asks a different question instead: does each validator's own reading imply the *same PASS/FAIL/INCONCLUSIVE decision*? A reading within `noise_bps` of a threshold is `INCONCLUSIVE` for that validator, not forced to a side - so a leader claiming a clean `PASS` on a reading that's actually borderline gets rejected by any honest validator whose own (possibly quite different) reading is also borderline and therefore also reports `INCONCLUSIVE`. `tests/test_quotekeeper.py::test_validator_rejects_leader_pass_on_borderline_reading` proves exactly this scenario; the paired `test_validator_agrees_when_both_decisively_pass_different_numbers` proves two different-but-decisive readings still agree, which is the entire point - genuinely different exact numbers, same decision, real consensus.

**Clause parsing uses `strict_eq`, sampling uses a custom validator - deliberately different equivalence principles for different kinds of nondeterminism.** Parsing free text into a fixed two-field schema either has one clearly correct extraction or the clause is genuinely ambiguous; there's no legitimate reason for two honest validators to extract different canonical JSON from the same static text, so exact equality is the right bar and an ambiguous clause should fail registration outright. Live market sampling is the opposite: honest validators fetching seconds apart are *expected* to see different numbers, so the right question moves from "do the numbers match" to "does the decision match" - see above.

**All-or-nothing across both metrics per sample**, same reasoning as Ballpark's metric vector and SolvencyOracle's reserves/liabilities pair: both metrics are combined into one decision *before* consensus, so a leader/validator disagreement on either metric fails the whole sample rather than reaching partial agreement metric-by-metric.

**A confirmed FAIL on either metric wins over an INCONCLUSIVE on the other.** `_local_verdict` checks `FAIL` before `INCONCLUSIVE`. A pre-submission self-audit caught that the original code checked them in the opposite order, so a decisive breach on one metric got silently masked into `INCONCLUSIVE` whenever the *other* metric happened to sit inside its own noise band. Since `compliance_bps` excludes `INCONCLUSIVE` from its denominator and a new agreement reports 100% compliant by default with zero decisive samples, that ordering meant an MM breaching one KPI on *every* sample could still read as perfectly compliant, just by keeping the other KPI near its threshold - see CONTRACT.md for the full writeup and the regression tests that catch this. The corrected priority (`FAIL` > `INCONCLUSIVE` > `PASS`) matches this account's consistent direction to err toward catching a real problem rather than toward an ambiguous free pass.

**Prompt injection.** Both prompts explicitly fence fetched content as untrusted data, the same defensive pattern used throughout this account's other GenLayer projects.

**Cumulative compliance, not time-windowed.** `compliance_bps` aggregates every sample ever taken for an agreement, not a rolling 30-day window. Explicit time-windowed reporting is a natural v2 extension once there's a real usage pattern to design the bucketing around; it wasn't worth the added state-management complexity for a first version where the actual contribution is the decision-margin equivalence check itself, not the aggregation scheme.

## Verified platform facts

This contract exists in two source files: [`contracts/quotekeeper.py`](contracts/quotekeeper.py)
(Bradbury, GenVM v0.2.11, test-covered by the suite below) and a Studio Next variant (a
newer GenVM generation - the primary live deployment, ported using the same mechanical
process documented in the sibling [SolvencyOracle](https://github.com/HarrisonJL/solvency-oracle)
project's `studio-next/README.md`). `gl.eq_principle.strict_eq` and `gl.vm.run_nondet`
were confirmed directly against the version-matched SDK source before writing this
contract, not assumed.

Porting `retainer_consumer.py` specifically surfaced one more real API move beyond what
SolvencyOracle's port needed: `gl.get_contract_at(address)` doesn't exist on Studio Next's
live package - it moved to `gl.contract.get_at(address)`. Found the same way as
SolvencyOracle's `gl.message.datetime` fix: a temporary `debug_gl()` probe deployed to
introspect `dir(gl.contract)` live, not guessed. That same probe also surfaced
`gl.vm.run_nondet_default` existing alongside `gl.vm.run_nondet` in the live package -
worth knowing about (a previous project session flagged a version where these two names
had swapped meaning), but not something this contract needed to change: `run_nondet`'s
actual behavior, confirmed by every consensus test passing exactly as expected on both
networks, is still the "safe" custom-validator primitive this contract relies on.

Direct Mode cannot simulate cross-contract calls without a "glsim" hook this project
doesn't configure - confirmed in `gltest`'s own source (`CallContract` falls through to
"Unknown gl_call request type" without one). `retainer_consumer.py`'s `settle()` method,
which makes exactly one such call, is therefore verified live only - see CONTRACT.md.

## Testing

`tests/test_quotekeeper.py` (23 tests) and `tests/test_retainer_consumer.py` (6 tests),
`genlayer-test` Direct Mode:

1. **Registration** - clause-parsing success and rejection paths (ambiguous clause missing either KPI), input validation, immutability.
2. **Integration** (real `sample()` calls, both the web fetch and the LLM extraction mocked) - `PASS`/`FAIL`/`INCONCLUSIVE` for each metric independently, `compliance_bps` correctly excluding `INCONCLUSIVE` from its denominator, multi-venue source-hash recording.
3. **Consensus-boundary tests** via `direct_vm.run_validator(leader_result=...)` - the actual point of this contract: agreement despite different exact numbers when both are decisively on the same side, rejection of a leader's clean verdict when a validator's own reading is borderline, exact-edge-of-the-noise-band agreement, and the all-or-nothing-across-metrics case.
4. **Self-audit regression** - a decisive `FAIL` on one metric correctly wins over an `INCONCLUSIVE` on the other, in both metric directions. Confirmed to genuinely fail against the pre-fix ordering before being confirmed to pass against the fix - see "Design notes."
5. `test_retainer_consumer.py` covers everything `settle()` doesn't touch (constructor validation, `fund_retainer` balance bookkeeping, `withdraw_*` access control) and documents, with a passing test, exactly why `settle()` itself can't run in Direct Mode.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install genlayer-py==0.16.3 genlayer-test==0.29.2 pytest==9.1.1 genvm-linter==0.11.0
genvm-lint check contracts/quotekeeper.py
genvm-lint check contracts/retainer_consumer.py
python -m pytest tests/ -v
```

## Deployment

See [`CONTRACT.md`](CONTRACT.md) for live addresses, deploy transactions, and a real
end-to-end run: an agreement registered, a compliant sample, a breaching sample, and
`RetainerConsumer` settling a funded retainer against the live `is_compliant` result.

## Known limitations

- **Testnet only.**
- **Two fixed KPI metrics** (`max_spread_bps`, `min_depth_usd`), not an open-ended clause schema. A v2 generalizing to arbitrary KPI types would need a more careful canonical-schema design - the fixed two-field schema here keeps clause-parsing reliable enough for `strict_eq` to actually work in practice.
- **No live third-party market-data integration yet.** The demo venue pages are self-authored (clearly labeled, not real trading venues) for the same reason SolvencyOracle's demo pages are self-authored: real exchange APIs and aggregator pages are frequently JS-rendered, paginated, or rate-limited in ways that would need real-world testing (and real risk of an unreliable live demo) beyond this scope. `venue_urls` accepts any public page reporting spread/depth, so pointing it at a real venue's data page is a drop-in change, not a redesign.
- **`clause_text_hash` is audit evidence, not a consensus input** - same reasoning as SolvencyOracle's source hashes: it lets a reader verify what text a registration was actually based on, without being part of what validators have to agree on.
- **Cumulative, not time-windowed, compliance** - see "Design notes."
- **No spam/cost control on `sample()` beyond the venue-count and noise caps** - a production deployment serving untrusted callers would likely want a small fee, mirroring the fee mechanisms already used elsewhere in this account's contracts.
