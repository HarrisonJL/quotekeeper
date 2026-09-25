# Deployment

- **Address:** [`0xF48a62c51214ee7330D60569711FCa47C2C71f3E`](https://explorer-studio-dev.genlayer.com/address/0xF48a62c51214ee7330D60569711FCa47C2C71f3E)
- **Network:** GenLayer Studio Next (chain id `61997`)
- **Deploy tx:** `0x87909901bb0d1d77108d54b57383da3182be16c65f0bf535b73b70cc59e86a8f`
- **Deployer:** `0x5cdb5699bc1038e115A973bb91A646f7E98C075b`
- **Contract source:** [`contracts/quotekeeper_studio_next.py`](contracts/quotekeeper_studio_next.py) - functionally identical to [`contracts/quotekeeper.py`](contracts/quotekeeper.py); only GenVM import/decorator conventions differ. See "Porting to Studio Next" below.

*(This is a redeployment. A pre-submission self-audit found and fixed a real correctness bug after the first deployment went live - see "Self-audit: a FAIL that could be masked as INCONCLUSIVE" below. The address above is the corrected contract; the original deployment's address is retired.)*

## Self-audit: a FAIL that could be masked as INCONCLUSIVE

Before treating this contract as submission-ready, it was reviewed the way the real GenLayer
steward (Pavel Kolosov) has reviewed sibling projects in this account's work in the past -
specifically, his repeated focus on whether an equivalence/decision check actually catches
what it claims to catch. That review found a real bug in `_local_verdict`, the function that
turns a spread reading and a depth reading into one `PASS`/`FAIL`/`INCONCLUSIVE` decision:

`_local_verdict` checked for `INCONCLUSIVE` *before* checking for `FAIL`. So whenever one
metric was a decisive breach (e.g. spread wildly over its cap) but the *other* metric happened
to land inside its own noise band, the combined verdict came back `INCONCLUSIVE` - masking a
confirmed violation. `compliance_bps` excludes `INCONCLUSIVE` samples from its denominator, and
a new agreement with zero decisive samples reports 100% compliant by default - so under the old
ordering, a market maker breaching its spread cap on *every single sample* could read as
perfectly compliant forever, simply by keeping depth hovering near its own threshold. Because
`RetainerConsumer.settle()` (below) pays out based on exactly this `is_compliant()` result, the
practical consequence was real: a retainer could be paid to a market maker with a fully
consensus-confirmed KPI breach on record.

**Fix:** check `FAIL` before `INCONCLUSIVE` - a confirmed breach on either metric now wins
regardless of the other metric's ambiguity, matching the same "err toward catching a real
problem" direction already used throughout this account's attestors (AuditScope's self-audit
found the analogous mistake in the opposite direction - see its own CONTRACT.md).

Proven by two new regression tests in `tests/test_quotekeeper.py`
(`test_sample_fail_when_spread_decisively_fails_even_if_depth_is_borderline` and its depth/spread
mirror), both confirmed the rigorous way: run against the old ordering first and confirmed to
genuinely **fail** (`assert 'INCONCLUSIVE' == 'FAIL'`), then confirmed passing after the fix was
restored, alongside the full suite (29 tests). The demo pages below don't happen to exercise this
combination (both metrics are decisively on the same side in both demo agreements), so this
redeployment reproduces the same PASS/FAIL results as before - the fix changes behavior only for
the mixed-metric case the original demo never exercised, which is exactly why a dedicated
self-audit, not just re-running the demo, was needed to catch it.

## Live proof: a compliant sample, a breaching sample, both on the first try (fixed contract)

Two demo agreements registered against real, public pages
([compliant](demo/example_compliant_market.md), [breach](demo/example_breach_market.md)):

- `register_agreement("DEMO1", ...)` - tx `0x79b14bc501485b5efa8ae470ff33b4a83effb26ef697c4e28a8ea5fb81d2c4fb`
- `register_agreement("DEMO2", ...)` - tx `0x6a7d9ee3a7aaf56633483b90b507a5a7488ac33a08d170e7ab1ad8dc2722d3e9`

`sample("DEMO1")` - tx `0x19787ad473e7a0b3c4facaade80ef15028523632c0ba60b1e51786cae5b1a641`:

```json
{"agreement_id": "DEMO1", "spread_bps": 50, "depth_usd": 180000, "verdict": "PASS"}
```

Extracted live: 0.5% spread, $180,000 depth - exactly what the source page states, against a 2%/$50,000 KPI - **PASS**, correctly.

`sample("DEMO2")` - tx `0x372891a1c1d94f7e78f844f406a87b2677fbe82953f671ef648643d1ca98269f`:

```json
{"agreement_id": "DEMO2", "spread_bps": 500, "depth_usd": 3500, "verdict": "FAIL"}
```

5% spread, well over the 2% KPI - **FAIL**, correctly, and a genuinely different verdict from DEMO1's, proving the oracle isn't rubber-stamping every agreement compliant. `get_state()` after both: `{ agreement_count: 2, sample_count: 2 }`.

## Live proof: composability (fixed contract)

[`contracts/retainer_consumer_studio_next.py`](contracts/retainer_consumer_studio_next.py) demonstrates a downstream contract gating on `is_compliant()` via a real cross-contract call - not mocked, since Direct Mode can't simulate this (see README).

- Deploy - tx `0xd2dfc11b9ff368c948c1214a5db43e4cf498ad70bc6d87fa71c1ce0871762322` (address `0xdb15BFc6AabeE68d98ec02E187EFdCC8fBddA8C2`)
- `fund_retainer()` (1000 GEN) - tx `0x50c8495c69b7f36bd5f5845707c9a2139d1d1aa331856070e9b308f0a9c848e9`
- `settle()` - tx `0xd904ddef4405ad35c027d30dc396f8ce65aa6cc8cdea9cd7b514dedcad1d82d5`, reading DEMO1's real `is_compliant(9000)` result via a genuine cross-contract call

```json
{"agreement_id": "DEMO1", "balance": 1000, "owed_to_mm": 1000, "owed_to_treasury": 0}
```

The full 1000 GEN routed to the MM's payout balance because DEMO1 is compliant - a real decision, made by reading another contract's real consensus-derived state, not a mocked or hardcoded result.

*(The `gl.get_contract_at` -> `gl.contract.get_at` API move needed for this cross-contract call on Studio Next was already found and fixed before this redeployment - see "Porting to Studio Next" below; it did not need rediscovering.)*

## Porting to Studio Next

Same mechanical process as [SolvencyOracle](https://github.com/HarrisonJL/solvency-oracle)'s port (pinned runner hash, `import genlayer as gl`, `@gl.storage.allow` + `@dataclass`, `gl.contract.Contract`, `gl.message.datetime`), plus one contract-specific find: `gl.get_contract_at` -> `gl.contract.get_at`, described above. `gl.vm.run_nondet` and `gl.eq_principle.strict_eq` - the actual consensus primitives this contract depends on - were confirmed unchanged in behavior by every test and live call behaving exactly as designed on both networks.

## Historical: Bradbury deployment

- **Address:** [`0x753632506c5CBbdf727F84C7DA6B48e16cf3D79F`](https://explorer-bradbury.genlayer.com/address/0x753632506c5CBbdf727F84C7DA6B48e16cf3D79F)
- **Deploy tx:** `0xef93a0687a6c9c36f2130eb34b4560c6b52b4e159ad518649539827abdfcc5c9`

Kept live as evidence the underlying mechanics work on more than one network, matching this account's established pattern (see SolvencyOracle). Registration, both demo samples, and the deploy itself each needed one retry for real, transient Bradbury infrastructure issues already documented elsewhere in this account's work (an RPC gas-rate-limit on the initial deploy, a raw EVM/consensus-contract revert on the first `RetainerConsumer` deploy attempt) - not code issues, and not hidden:

- `register_agreement("DEMO1")` - tx `0xdb4536d1c8279b7350c58d50068ec5ea3425049c85fbe14b35fa93c41b7fd2b4`
- `register_agreement("DEMO2")` - tx `0x88520504940a364f096bffa6a9d2c1f3ee42babed63f52bc8476961409c4c656`
- `sample("DEMO1")` - tx `0x7370ba658c38ba97c0b1ef5c36ca8b4835114a14bd2895d99a84ac467d8fbd68`: `{"spread_bps": 50, "depth_usd": 180000, "verdict": "PASS"}`
- `sample("DEMO2")` - tx `0xe10a34d0c23dc09774b9ebf9ec693b8463a4ea0bfe449b403557576521ffb318`: `{"spread_bps": 500, "depth_usd": 3500, "verdict": "FAIL"}`
- `RetainerConsumer` deployed at `0xC7637Fb54565267178B63364f66CA02131Fc4A0a` (tx `0x6ef3e436ec0486e628062057ff70002214802504e2fb6b14615d037227c5e068`, after a first attempt reverted at the raw consensus-contract layer)
- `fund_retainer()` (1000 GEN) - tx `0xe0a90e691506d8f639430bdfb875ff329a259a078e4fb4b122f9f14eda10968f`
- `settle()` - tx `0xb079847fdb65c3430bfa843df3f0eabab7da3a8eea7013e1b234c50205f0c985`: `{"agreement_id": "DEMO1", "balance": 1000, "owed_to_mm": 1000, "owed_to_treasury": 0}` - the same correct result as Studio Next, via Bradbury's original v0.2.11 `gl.get_contract_at` API, which worked on the first try - the API move described above is specific to Studio Next's newer package.

`get_state()` after both networks' full flow matches exactly: two agreements, two samples (one PASS, one FAIL), one settled retainer correctly routed to the compliant MM - the whole mechanism proven end to end, on both networks, independently.
