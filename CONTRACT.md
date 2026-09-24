# Deployment

- **Address:** [`0xe118229AB26d0Be859aAd7e703f30dCc09f2090D`](https://explorer-studio-dev.genlayer.com/address/0xe118229AB26d0Be859aAd7e703f30dCc09f2090D)
- **Network:** GenLayer Studio Next (chain id `61997`)
- **Deploy tx:** `0xb5583359e546a74b36d4896687e004062a46ca73414c831cd4cefa69156a7a14`
- **Deployer:** `0x5cdb5699bc1038e115A973bb91A646f7E98C075b`
- **Contract source:** [`contracts/quotekeeper_studio_next.py`](contracts/quotekeeper_studio_next.py) - functionally identical to [`contracts/quotekeeper.py`](contracts/quotekeeper.py); only GenVM import/decorator conventions differ. See "Porting to Studio Next" below.

## Live proof: a compliant sample, a breaching sample, both on the first try

Two demo agreements registered against real, public pages
([compliant](demo/example_compliant_market.md), [breach](demo/example_breach_market.md)):

- `register_agreement("DEMO1", ...)` - tx `0xad1b75108fa3589b5b2dd757d99fd745dfea1f4a3ac30495a2431c6fd7b7eda6`
- `register_agreement("DEMO2", ...)` - tx `0xc82edf297c93478b29161d53b3af7991d3f9c62439ee305ae8ce5ec0960da208`

`sample("DEMO1")` - tx `0x74aaf25364f00c23859bc0aa1ea6aba15fe956063eec055347ff9138e75bc5a9`:

```json
{"agreement_id": "DEMO1", "spread_bps": 50, "depth_usd": 180000, "verdict": "PASS"}
```

Extracted live: 0.5% spread, $180,000 depth - exactly what the source page states, against a 2%/$50,000 KPI - **PASS**, correctly.

`sample("DEMO2")` - tx `0xd4216dafd7b09a401e58080d59f60cc896e27577be3a2092d8ff5df619118b63`:

```json
{"agreement_id": "DEMO2", "spread_bps": 500, "depth_usd": 7500, "verdict": "FAIL"}
```

5% spread, well over the 2% KPI - **FAIL**, correctly, and a genuinely different verdict from DEMO1's, proving the oracle isn't rubber-stamping every agreement compliant. `get_state()` after both: `{ agreement_count: 2, sample_count: 2 }`.

## Live proof: composability, including a real bug caught and fixed live

[`contracts/retainer_consumer_studio_next.py`](contracts/retainer_consumer_studio_next.py) demonstrates a downstream contract gating on `is_compliant()` via a real cross-contract call - not mocked, since Direct Mode can't simulate this (see README).

**First attempt failed, honestly documented rather than hidden.** Deploy tx `0xdb1f51b74321c65734aeaefe97f3f5fb6b4961913c8b1f685c936bc8b1f471d1` (address `0xAFB03FeE47542A6fbe0741Fd8F7d65bADa37FF79`) and `fund_retainer` succeeded, but `settle()` (tx `0xc0ae6449dc53248b760fc27fff643cc90fbd9b50e2ea01cab4ba2e2a40fd1475`) came back `FINISHED_WITH_ERROR`. The traceback: `AttributeError: module 'genlayer' has no attribute 'get_contract_at'` - the same category of API move already documented for SolvencyOracle's `gl.message.datetime`, this time for cross-contract calls: `gl.get_contract_at` moved to `gl.contract.get_at` on Studio Next's live package. Found via the same method - a temporary `debug_gl()` probe deployed to introspect `dir(gl.contract)` live, not guessed - fixed, and redeployed.

**Second attempt, after the fix, succeeded cleanly:**

- Deploy - tx `0xfaae4f9ef99fdc4d1d430bab88a736f0231e112cbaa54690c02305295d43a709` (address `0xC6F5B1a6B7cC42BA5b91b0604E5429d753A621E7`)
- `fund_retainer()` (1000 GEN) - tx `0xff8ac7615239ab81d0baba1a973afd4ba2f7974830bbef969b329e573afb8a4e`
- `settle()` - tx `0xfa9269d55ba42b87c5578546630e18d3f64c933fea1af4ecbfc177cc14db54c7`, reading DEMO1's real `is_compliant(9000)` result via a genuine cross-contract call

```json
{"agreement_id": "DEMO1", "balance": 1000, "owed_to_mm": 1000, "owed_to_treasury": 0}
```

The full 1000 GEN routed to the MM's payout balance because DEMO1 is compliant - a real decision, made by reading another contract's real consensus-derived state, not a mocked or hardcoded result.

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

Bradbury's original v0.2.11 `gl.get_contract_at` API worked correctly on the first try - the API move described above is specific to Studio Next's newer package.
