# Deployment

- **Address:** [`0x1A0A3594CDB6b650D1e417269BC64152B87B503d`](https://explorer-studio-dev.genlayer.com/address/0x1A0A3594CDB6b650D1e417269BC64152B87B503d)
- **Network:** GenLayer Studio Next (chain id `61997`)
- **Deploy tx:** `0x6fd2031c92421b794b05b115654ccd1745ef02f22b61b121046f146ca0d1908d`
- **Deployer:** `0x5cdb5699bc1038e115A973bb91A646f7E98C075b`
- **Contract source:** [`contracts/quotekeeper_studio_next.py`](contracts/quotekeeper_studio_next.py) - functionally identical to [`contracts/quotekeeper.py`](contracts/quotekeeper.py); only GenVM import/decorator conventions differ. See "Porting to Studio Next" below.

*(This is the second redeployment. A pre-submission self-audit found and fixed a real correctness bug (see "Self-audit" below); a subsequent GenLayer steward review then found a second, independent gap - see "Steward review: is_compliant() could report zero evidence as full compliance" immediately below. The address above is the fully corrected contract; both earlier deployments are retired.)*

## Verify the deployed source matches this repo

**`0x1A0A3594CDB6b650D1e417269BC64152B87B503d` is the deployment to review.** Its on-chain code, fetched from the chain itself with `gen_getContractCode`, not from this repo, is byte-identical to [`contracts/quotekeeper_studio_next.py`](contracts/quotekeeper_studio_next.py), the source containing the fail-closed `is_compliant()` (zero decisive samples is never compliant) and the corrected `FAIL > INCONCLUSIVE > PASS` priority. The consumer ([`contracts/retainer_consumer_studio_next.py`](contracts/retainer_consumer_studio_next.py)) is identical on-chain too. The Bradbury deployment `0xECD44d71E3c7e7c366A4d971b4AbFc3C6E1d8428` runs the same fixed logic (the tested v0.2.11 source) and is identical to it on-chain too. Every earlier deployment ran older source and is listed below as superseded: **do not use them to evaluate the contract**.

| Deployment | Network | SHA-256 of the code on-chain | Same as this repo's source? | `is_compliant()` fails closed on zero evidence? |
|---|---|---|---|---|
| [`0x1A0A3594CDB6b650D1e417269BC64152B87B503d`](https://explorer-studio-dev.genlayer.com/address/0x1A0A3594CDB6b650D1e417269BC64152B87B503d) QuoteKeeper | Studio Next | `9af41940db597d6a259ce013ac024cdad56e904e8e187431485ced660a87c350` | **Yes, byte-identical** | **Yes** |
| [`0x46bc8b6670146F902441248F74dc95c106285E3d`](https://explorer-studio-dev.genlayer.com/address/0x46bc8b6670146F902441248F74dc95c106285E3d) RetainerConsumer (DEMO1) | Studio Next | `5e7347295bac0e55bc9367d3757a8d0ce60ab27fbdff1c040578148d335e90af` | **Yes, byte-identical** | n/a (consumer) |
| [`0x873a571f866575DD92dA7A3E89CB0ae2FC65830C`](https://explorer-studio-dev.genlayer.com/address/0x873a571f866575DD92dA7A3E89CB0ae2FC65830C) RetainerConsumer (ZEROSAMPLE1) | Studio Next | `5e7347295bac0e55bc9367d3757a8d0ce60ab27fbdff1c040578148d335e90af` | **Yes, byte-identical** | n/a (consumer) |
| `0xF48a62c51214ee7330D60569711FCa47C2C71f3E` | Studio Next | `969ede32d2c05d306188a0098327e1a2d3946438d4bcda64f5e05b382a938f36` | No: second deployment, before the zero-evidence fix | **No** |
| `0xe118229AB26d0Be859aAd7e703f30dCc09f2090D` | Studio Next | `ee7d6696622f4ed06d33b075066342d1ce4f535dba5ddd53691ad46bd2007043` | No: first deployment, before both fixes | **No** |
| [`0xECD44d71E3c7e7c366A4d971b4AbFc3C6E1d8428`](https://explorer-bradbury.genlayer.com/address/0xECD44d71E3c7e7c366A4d971b4AbFc3C6E1d8428) QuoteKeeper | Bradbury | `6ee88c4514f79057934a940e1475340c15dbaf4fe4ee75d32a622a844c0c692d` | **Yes, byte-identical to [`contracts/quotekeeper.py`](contracts/quotekeeper.py)** | **Yes** |
| [`0xA158a70447BaC4E3d7A9c58884454B237Ae31519`](https://explorer-bradbury.genlayer.com/address/0xA158a70447BaC4E3d7A9c58884454B237Ae31519) RetainerConsumer | Bradbury | `3dabf78a4350436a839dd1cebbc0d48bd9e3f34fb38c9f310669a38a6f0731ad` | **Yes, byte-identical to [`contracts/retainer_consumer.py`](contracts/retainer_consumer.py)** | n/a (consumer) |
| `0x753632506c5CBbdf727F84C7DA6B48e16cf3D79F` | Bradbury | `b2ba9b46dd379214f964410917ac08835b4bbf58fd40acced2fd0fb16f1c7654` | No: the first Bradbury deployment, pre-fix source (superseded by the Bradbury deployment above) | **No** |
| `0xAFB03FeE47542A6fbe0741Fd8F7d65bADa37FF79` | Studio Next | `0e21bb0ca822c3bf483766eea8f94d26c0bf9ed6a6c5518d6bba37b6773a8067` | No: the first RetainerConsumer attempt, using the pre-port cross-contract call (see "Porting to Studio Next") | n/a (consumer) |

Reproduce it:

```bash
cd studio-next && npm ci
npx tsx verify_code.ts                       # QuoteKeeper at the reviewed address
# 0x1A0A3594CDB6b650D1e417269BC64152B87B503d
#   on-chain  sha256 9af41940db597d6a259ce013ac024cdad56e904e8e187431485ced660a87c350 (15218 chars)
#   ../contracts/quotekeeper_studio_next.py sha256 9af41940db597d6a259ce013ac024cdad56e904e8e187431485ced660a87c350 (15218 chars)
# IDENTICAL
npx tsx verify_code.ts 0x46bc8b6670146F902441248F74dc95c106285E3d ../contracts/retainer_consumer_studio_next.py
CHAIN=bradbury npx tsx verify_code.ts 0xECD44d71E3c7e7c366A4d971b4AbFc3C6E1d8428 ../contracts/quotekeeper.py            # Bradbury: IDENTICAL
CHAIN=bradbury npx tsx verify_code.ts 0xA158a70447BaC4E3d7A9c58884454B237Ae31519 ../contracts/retainer_consumer.py       # Bradbury: IDENTICAL
```

`shasum -a 256 contracts/quotekeeper_studio_next.py` gives the same hash locally, and `npx tsx verify_code.ts <old address>` prints `DIFFERENT` for any deployment above marked superseded. The old `is_compliant()` on all three superseded QuoteKeeper deployments is the single line `return self.compliance_bps(agreement_id) >= min_compliance_bps`, with no zero-evidence guard.

**The studio source is a mechanical port of the tested source.** `python3 scripts/port_to_studio_next.py` regenerates `contracts/*_studio_next.py` from `contracts/*.py` (five import/decorator/base-class/message substitutions) and exits non-zero if either committed port differs. Both are `IDENTICAL`.

## Steward review: is_compliant() could report zero evidence as full compliance

A GenLayer steward reviewed this contract after submission and found a real gap distinct from
the self-audit below: `compliance_bps()` deliberately returns `10000` (100%) when an agreement
has zero decisive samples, so a brand-new agreement isn't misreported as 0% before anyone has
sampled it. But `is_compliant()` simply compared that same optimistic default against the
caller's threshold - so an agreement that had **never been sampled at all**, or had been sampled
only into `INCONCLUSIVE` results, reported as fully compliant for *any* `min_compliance_bps`,
including the lowest possible bar. Because `RetainerConsumer.settle()` gates purely on
`is_compliant()`, the practical consequence was real and live-provable: a retainer could be paid
out to a market maker with **zero decisive evidence ever gathered** about whether they actually
met their KPIs.

**Fix:** `is_compliant()` now returns `False` outright whenever `pass_count + fail_count == 0`,
regardless of `min_compliance_bps` - an agreement with no decisive evidence is unevaluated, not
compliant. `compliance_bps()` itself is unchanged (still informational display data, not a
fund-gating value); the real gate is in `is_compliant()`, so no downstream caller needed to
change.

Proven by a new regression test (`test_is_compliant_fails_closed_with_zero_decisive_samples`,
covering both the never-sampled and the all-`INCONCLUSIVE` paths), confirmed the rigorous way:
run against the old code first and confirmed to genuinely **fail** (`assert True is False` - the
old code really did report compliant), then confirmed passing after the fix, alongside the full
suite (30 tests). Live proof that the fix closes the exploit through the actual cross-contract
path `RetainerConsumer.settle()` uses (not just the unit-testable view) is below.

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

- `register_agreement("DEMO1", ...)` - tx `0xd06aec2e30664b3d10a15dde3dbada74852fabfc7e0b9829933801d052e8dbc1`
- `register_agreement("DEMO2", ...)` - tx `0x7f67683f44455dec820edf137b514e8f1414e291dca297ca38c6cd7142d263f4`

`sample("DEMO1")` - tx `0x19c5cd7dac0b6af2efe0326da90dbf364468ace2f1f3eeeea3c70804c4cb4476`:

```json
{"agreement_id": "DEMO1", "spread_bps": 50, "depth_usd": 180000, "verdict": "PASS"}
```

Extracted live: 0.5% spread, $180,000 depth - exactly what the source page states, against a 2%/$50,000 KPI - **PASS**, correctly.

`sample("DEMO2")` - tx `0xdd7ebceddcf11edfe9227e7a9f146ffab52ab2451fc13d183c929a55f15dfa31`:

```json
{"agreement_id": "DEMO2", "spread_bps": 500, "depth_usd": 3500, "verdict": "FAIL"}
```

5% spread, well over the 2% KPI - **FAIL**, correctly, and a genuinely different verdict from DEMO1's, proving the oracle isn't rubber-stamping every agreement compliant. `get_state()` after both: `{ agreement_count: 2, sample_count: 2 }`.

## Live proof: composability (fixed contract)

[`contracts/retainer_consumer_studio_next.py`](contracts/retainer_consumer_studio_next.py) demonstrates a downstream contract gating on `is_compliant()` via a real cross-contract call - not mocked, since Direct Mode can't simulate this (see README).

- Deploy - tx `0x371881f3c8147f8564339e9f44914198a3672f975016c8c5f210f71aa3be4dc6` (address `0x46bc8b6670146F902441248F74dc95c106285E3d`)
- `fund_retainer()` (1000 GEN) - tx `0x792d983c72d906d8343689ad74646d3df0c7aab9c0676da607e2c419a09e124f`
- `settle()` - tx `0x3934913a3601cba3c9113d34168b747d29ae32ad4e1a96f7f6f00ed475ca77e9`, reading DEMO1's real `is_compliant(9000)` result via a genuine cross-contract call

```json
{"agreement_id": "DEMO1", "balance": 1000, "owed_to_mm": 1000, "owed_to_treasury": 0}
```

The full 1000 GEN routed to the MM's payout balance because DEMO1 is compliant - a real decision, made by reading another contract's real consensus-derived state, not a mocked or hardcoded result.

*(The `gl.get_contract_at` -> `gl.contract.get_at` API move needed for this cross-contract call on Studio Next was already found and fixed before this redeployment - see "Porting to Studio Next" below; it did not need rediscovering.)*

## Live proof: the steward-flagged exploit, closed end to end

A third agreement, `ZEROSAMPLE1`, registered and **never sampled at all** - zero decisive
evidence by construction:

- `register_agreement("ZEROSAMPLE1", ...)` - tx `0xdf7f64751bd60746ad1f1ea71414e16efc6fac33eff92dd33c5a966ee89e812a`
- `compliance_bps("ZEROSAMPLE1")` reads `10000` (100%) - the deliberate optimistic display default for zero decisive samples, unchanged by the fix.
- `is_compliant("ZEROSAMPLE1", 0)` reads **`false`** - even `min_compliance_bps = 0`, the lowest possible bar, is not satisfiable with zero decisive evidence.

A `RetainerConsumer` deployed against `ZEROSAMPLE1` with `min_compliance_bps = 0` - the most
permissive possible configuration, maximally favorable to the old bug:

- Deploy - tx `0x3e0abfe1f4bb6fee16c509619938dcc32c0b4b2a17059da24841932676e4d5d8` (address `0x873a571f866575DD92dA7A3E89CB0ae2FC65830C`)
- `fund_retainer()` (1000 GEN) - tx `0x3409c2111bf867b87475f8fd0d9e07a91dc18b99324c343ce62e92da74f82223`
- `settle()` - tx `0x61c5c96eda8d804cae5b9f5ab8b219fe0d6acdfd2779a69166d69324b7c10d3f`

```json
{"agreement_id": "ZEROSAMPLE1", "balance": 1000, "min_compliance_bps": 0, "owed_to_mm": 0, "owed_to_treasury": 1000}
```

The full 1000 GEN routed to the **treasury**, not the market maker, despite `min_compliance_bps`
being set to the lowest possible value - live, on-chain confirmation that the exploit the steward
flagged is closed through the real cross-contract path, not just in the unit-testable view.

## Porting to Studio Next

Same mechanical process as [SolvencyOracle](https://github.com/HarrisonJL/solvency-oracle)'s port (pinned runner hash, `import genlayer as gl`, `@gl.storage.allow` + `@dataclass`, `gl.contract.Contract`, `gl.message.datetime`), plus one contract-specific find: `gl.get_contract_at` -> `gl.contract.get_at`, described above. `gl.vm.run_nondet` and `gl.eq_principle.strict_eq` - the actual consensus primitives this contract depends on - were confirmed unchanged in behavior by every test and live call behaving exactly as designed on both networks.

## Bradbury deployment (current: runs the fixed source)

- **QuoteKeeper:** [`0xECD44d71E3c7e7c366A4d971b4AbFc3C6E1d8428`](https://explorer-bradbury.genlayer.com/address/0xECD44d71E3c7e7c366A4d971b4AbFc3C6E1d8428), deploy tx [`0x05fcfc40…`](https://explorer-bradbury.genlayer.com/tx/0x05fcfc409617517d44b3e22a4318054bb3ff08cd2230ec787b1fee9a39f94276) (finalized)
- **RetainerConsumer:** [`0xA158a70447BaC4E3d7A9c58884454B237Ae31519`](https://explorer-bradbury.genlayer.com/address/0xA158a70447BaC4E3d7A9c58884454B237Ae31519), deploy tx [`0xe1e60c8d…`](https://explorer-bradbury.genlayer.com/tx/0xe1e60c8dc52dc5f10cb79318eb706adcc8d8d9e2baec00d5cb034c426efcd325)
- **Source:** [`contracts/quotekeeper.py`](contracts/quotekeeper.py) and [`contracts/retainer_consumer.py`](contracts/retainer_consumer.py) (the tested GenVM v0.2.11 sources, deployed as they are). Both are byte-identical on-chain (table under "Verify the deployed source").
- **Why this exists:** the first Bradbury deployment (below) ran the source from before the self-audit and steward fixes. This one runs the fixed source, and the live run below exercises the fix.
- **Proof log:** [`studio-next/bradbury_proof.json`](studio-next/bradbury_proof.json), written by [`scripts/bradbury_proof.ts`](scripts/bradbury_proof.ts) (a resumable run: it records each tx as it goes).

Every transaction below reached `FINISHED_WITH_RETURN` at consensus status `ACCEPTED` (the deploy has since finalized; Bradbury finalizes after an appeal window that can take far longer, as the README notes):

| Step | Tx | Result |
|---|---|---|
| `register_agreement("DEMO1")` | [`0x66acd9c9…`](https://explorer-bradbury.genlayer.com/tx/0x66acd9c96f6c7797b6d03f9581d9e00e7eb120aec8df212fecc224ecf66b61f2) | ✓ |
| `register_agreement("DEMO2")` | [`0xfe97cc66…`](https://explorer-bradbury.genlayer.com/tx/0xfe97cc66f80083182d24345a2190417a5dde5021aa378fc16d0696ed3bae3dee) | ✓ |
| `sample("DEMO1")` | [`0x28919b3f…`](https://explorer-bradbury.genlayer.com/tx/0x28919b3f367b80e756156519870edd6a0df0deafe8062ab8fab82900f95515f0) | `{"spread_bps": 50, "depth_usd": 180000, "verdict": "PASS"}` |
| `sample("DEMO2")`, first submission | [`0xbcbbbf7f…`](https://explorer-bradbury.genlayer.com/tx/0xbcbbbf7f39b2d90a6c791e8f6e945ba732be552418beffba3360f8264b792a79) | sat in Bradbury's `COMMITTING` phase (round 4, 16 votes committed, none revealed) for over 16 minutes, so it was resubmitted; it did eventually execute (`FAIL`) |
| `sample("DEMO2")`, resubmission | [`0x83dac54d…`](https://explorer-bradbury.genlayer.com/tx/0x83dac54d6abbccd6c12deb851ff056a094214a7e918c09908e4fd59e3c76d93f) | `{"spread_bps": 500, "depth_usd": 3500, "verdict": "FAIL"}` |
| `RetainerConsumer` deploy (DEMO1, `min_compliance_bps` 9000) | [`0xe1e60c8d…`](https://explorer-bradbury.genlayer.com/tx/0xe1e60c8dc52dc5f10cb79318eb706adcc8d8d9e2baec00d5cb034c426efcd325) | ✓ |
| `fund_retainer()` (1000) | [`0x9f0abe45…`](https://explorer-bradbury.genlayer.com/tx/0x9f0abe4595b9c650db34d1f7ae604f2bd8a03bdf95e2d712ff7380e60de39ae5) | ✓ |
| `settle()` | [`0x05acb50d…`](https://explorer-bradbury.genlayer.com/tx/0x05acb50d9bc6e6752c52cbf8faf7490adbb54fe6e451987cda3ba61ccf981152) | `{"balance": 1000, "owed_to_mm": 1000, "owed_to_treasury": 0}`: a real cross-contract read of DEMO1's compliance |
| `register_agreement("ZEROSAMPLE1")`, never sampled | [`0xfd79cb4b…`](https://explorer-bradbury.genlayer.com/tx/0xfd79cb4b9ec9fd9b1d6c64332c4e003f53f7ba85d72a59adacef122e978f5bc5) | ✓ |

Because both of DEMO2's samples executed, the contract holds three samples (`sample_count` 3): one `PASS` for DEMO1 and two identical `FAIL`s for DEMO2.

**The steward-flagged fix, live on Bradbury.** `compliance_bps("ZEROSAMPLE1")` reads `10000` (the deliberate display default for zero decisive samples), but `is_compliant("ZEROSAMPLE1", 0)` reads **`false`**, even at the lowest possible bar. `is_compliant("DEMO1", 9000)` reads `true`, and `is_compliant("DEMO2", 9000)` reads `false`.

## Superseded: the first Bradbury deployment (runs the pre-fix source)

**Do not use this deployment to evaluate the contract.** It was deployed before the self-audit and steward fixes: its `is_compliant()` has no zero-evidence guard, and its on-chain code (SHA-256 in the table under "Verify the deployed source") differs from this repo's source. It is kept only as a record of the original cross-network test.


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
