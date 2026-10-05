// Resumable Bradbury proof for QuoteKeeper: deploys the (post-fix) source, then
// registers two agreements, samples both, deploys RetainerConsumer, funds and
// settles it. Every step's tx hash and result is kept in brad_state.json, so a
// run cut off by Bradbury's slow finality (or its rate limits) resumes where it
// stopped. Usage: npx tsx scripts/brad_proof.ts
import * as fs from "fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

const RAW_BASE = "https://raw.githubusercontent.com/HarrisonJL/quotekeeper/main/demo";
const STATE = "brad_state.json";
const BUDGET_MS = 480_000;
const started = Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state: any = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf-8")) : { steps: {} };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Map ? Object.fromEntries(x) : x));

async function main() {
  const raw = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`);
  const client: any = createClient({ chain: testnetBradbury, account });

  // Submit (once), then wait for FINALIZED within the time budget.
  async function step(name: string, submit: () => Promise<string>) {
    const s = (state.steps[name] ??= {});
    if (s.result) return s;
    if (!s.tx) {
      for (let attempt = 1; ; attempt++) {
        try { s.tx = await submit(); break; }
        catch (e: any) {
          const msg = String(e?.shortMessage ?? e?.message ?? e).slice(0, 140);
          console.log(`  ${name}: submit failed (${msg})${attempt < 4 ? " - retrying" : ""}`);
          if (attempt >= 4) { save(); throw e; }
          await sleep(20_000);
        }
      }
      s.submitted_at = new Date().toISOString(); save();
      console.log(`${name}: submitted ${s.tx}`);
    }
    while (true) {
      if (Date.now() - started > BUDGET_MS) { console.log(`(time budget reached while waiting for ${name} ${s.tx} - run again)`); save(); process.exit(0); }
      let receipt: any;
      try { receipt = await client.getTransaction({ hash: s.tx }); } catch { await sleep(10_000); continue; }
      const status = String(receipt.statusName ?? receipt.status_name ?? receipt.status);
      // ACCEPTED is the decided result (FINALIZED follows after Bradbury's appeal window, which can take much longer).
      if (/ACCEPTED|FINALIZED/i.test(status) || [5, 7].includes(Number(receipt.status))) {
        s.status_when_recorded = status;
        s.result = receipt.txExecutionResultName ?? receipt.result_name ?? "?";
        s.to = receipt.to_address ?? receipt.recipient;
        s.finalized_at = new Date().toISOString(); save();
        console.log(`${name}: ${s.result} (${status})`);
        if (s.result === "FINISHED_WITH_ERROR") throw new Error(`${name} finished with error`);
        return s;
      }
      await sleep(10_000);
    }
  }

  const code = (f: string) => fs.readFileSync(`contracts/${f}`, "utf-8");
  const d = await step("deploy_quotekeeper", () => client.deployContract({ code: code("quotekeeper.py"), args: [] }));
  const qk = d.to; state.quotekeeper = qk; save();
  console.log("QuoteKeeper:", qk);
  const reg = (id: string, file: string) => () => client.writeContract({ address: qk, functionName: "register_agreement",
    args: [id, "Example Market Maker LLC", "Maintain a maximum spread of 2% and minimum depth of $50,000.", [`${RAW_BASE}/${file}`], 500], value: 0n });
  await step("register_DEMO1", reg("DEMO1", "example_compliant_market.md"));
  await step("register_DEMO2", reg("DEMO2", "example_breach_market.md"));
  await step("sample_DEMO1", () => client.writeContract({ address: qk, functionName: "sample", args: ["DEMO1"], value: 0n }));
  await step("sample_DEMO2", () => client.writeContract({ address: qk, functionName: "sample", args: ["DEMO2"], value: 0n }));
  const rcStep = await step("deploy_retainer_consumer", () => client.deployContract({ code: code("retainer_consumer.py"), args: [qk, "DEMO1", 9000, account.address, account.address] }));
  const rc = rcStep.to; state.retainer_consumer = rc; save();
  await step("fund_retainer", () => client.writeContract({ address: rc, functionName: "fund_retainer", args: [], value: 1000n }));
  await step("settle", () => client.writeContract({ address: rc, functionName: "settle", args: [], value: 0n }));
  await step("register_ZEROSAMPLE1", reg("ZEROSAMPLE1", "example_compliant_market.md")); // registered, never sampled: zero decisive evidence

  await sleep(3000);
  state.final = {
    quotekeeper_state: JSON.parse(json(await client.readContract({ address: qk, functionName: "get_state", args: [] }))),
    samples: [] as unknown[], retainer_state: JSON.parse(json(await client.readContract({ address: rc, functionName: "get_state", args: [] }))),
    is_compliant_DEMO1: await client.readContract({ address: qk, functionName: "is_compliant", args: ["DEMO1", 9000] }),
    is_compliant_DEMO2_at_9000: await client.readContract({ address: qk, functionName: "is_compliant", args: ["DEMO2", 9000] }),
    is_compliant_ZEROSAMPLE1_at_0: await client.readContract({ address: qk, functionName: "is_compliant", args: ["ZEROSAMPLE1", 0] }),
    compliance_bps_ZEROSAMPLE1: await client.readContract({ address: qk, functionName: "compliance_bps", args: ["ZEROSAMPLE1"] }),
  };
  for (let i = 0; i < Number(state.final.quotekeeper_state.sample_count); i++)
    state.final.samples.push(JSON.parse(json(await client.readContract({ address: qk, functionName: "get_sample", args: [i] }))));
  save();
  console.log("DONE", JSON.stringify(state.final).slice(0, 600));
  process.exit(0);
}
main().catch((e) => { console.error(String(e?.shortMessage ?? e?.message ?? e).slice(0, 300)); process.exit(1); });
