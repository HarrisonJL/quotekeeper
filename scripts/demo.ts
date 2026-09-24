// One-off: registers a demo agreement, fires a compliant sample and a
// breaching sample against the live QuoteKeeper deployment, then deploys
// RetainerConsumer, funds it, and settles it against the live
// is_compliant() result - the first real (non-Direct-Mode) exercise of
// the cross-contract call.
//
// Usage: npx tsx scripts/demo.ts <quotekeeper_address>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = join(__dirname, "..", "contracts");
const RAW_BASE = "https://raw.githubusercontent.com/HarrisonJL/quotekeeper/main/demo";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function writeAndWait(client: any, address: string, functionName: string, args: unknown[], value = 0n) {
  const txHash = await client.writeContract({ address, functionName, args, value });
  console.log(`${functionName}(${JSON.stringify(args[0] ?? "")}) submitted ${txHash} - waiting...`);
  const receipt: any = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}` & { length: 66 },
    status: "FINALIZED" as any,
    interval: 15000,
    retries: 240,
  });
  console.log(`  -> ${receipt.txExecutionResultName} (result ${receipt.result})`);
  return receipt;
}

async function deployContract(client: any, fileName: string, args: unknown[]) {
  const code = readFileSync(join(CONTRACTS_DIR, fileName), "utf-8");
  const txHash = await client.deployContract({ code, args });
  console.log(`Deploying ${fileName} - tx ${txHash} - waiting...`);
  const receipt: any = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}` & { length: 66 },
    status: "FINALIZED" as any,
    interval: 15000,
    retries: 240,
  });
  const address = receipt.to_address ?? receipt.recipient;
  console.log(`  -> deployed at ${address}`);
  return address;
}

async function main() {
  const qkAddress = process.argv[2];
  if (!qkAddress) throw new Error("Usage: tsx scripts/demo.ts <quotekeeper_address>");

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: testnetBradbury, account });
  console.log(`Acting as ${account.address}, QuoteKeeper at ${qkAddress}`);

  await writeAndWait(client, qkAddress, "register_agreement", [
    "DEMO1",
    "Example Market Maker LLC",
    "Maintain a maximum spread of 2% and minimum depth of $50,000.",
    [`${RAW_BASE}/example_compliant_market.md`],
    500,
  ]);

  await writeAndWait(client, qkAddress, "register_agreement", [
    "DEMO2",
    "Example Market Maker LLC",
    "Maintain a maximum spread of 2% and minimum depth of $50,000.",
    [`${RAW_BASE}/example_breach_market.md`],
    500,
  ]);

  await writeAndWait(client, qkAddress, "sample", ["DEMO1"]);
  await writeAndWait(client, qkAddress, "sample", ["DEMO2"]);

  const state: any = await client.readContract({ address: qkAddress, functionName: "get_state", args: [] });
  console.log("\nQuoteKeeper get_state():", state);
  for (let i = 0; i < Number(state.sample_count); i++) {
    const s = await client.readContract({ address: qkAddress, functionName: "get_sample", args: [i] });
    console.log(`get_sample(${i}):`, safeJson(s));
  }

  // Now deploy the consumer, pointed at DEMO1 (compliant), fund it, settle,
  // and confirm the MM gets credited via the real cross-contract read.
  const rcAddress = await deployContract(client, "retainer_consumer.py", [
    qkAddress, "DEMO1", 9000, account.address, account.address,
  ]);

  await writeAndWait(client, rcAddress, "fund_retainer", [], 1000n);
  await writeAndWait(client, rcAddress, "settle", []);

  const rcState: any = await client.readContract({ address: rcAddress, functionName: "get_state", args: [] });
  console.log("\nRetainerConsumer get_state():", rcState);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
