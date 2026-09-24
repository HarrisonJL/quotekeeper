// One-off: registers a compliant and a breaching demo agreement, samples
// both, deploys RetainerConsumer against the compliant one, funds it, and
// settles it - exercising the real cross-contract call for the first time.
//
// Usage: npx tsx demo.ts <quotekeeper_address>
import { createClient, createAccount, chains } from "genlayer-js";
import "dotenv/config";
import * as fs from "fs";

const RAW_BASE = "https://raw.githubusercontent.com/HarrisonJL/quotekeeper/main/demo";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function writeAndWait(client: any, address: string, functionName: string, args: unknown[], value: bigint = 0n) {
  const fees = await client.estimateTransactionFees({});
  const txHash = await client.writeContract({
    address, functionName, args, value,
    fees: { distribution: fees.distribution, feeValue: fees.feeValue },
  });
  console.log(`${functionName}(${JSON.stringify(args[0] ?? "")}) submitted ${txHash} - waiting...`);
  const receipt: any = await client.waitForTransactionReceipt({ hash: txHash, waitUntil: "finalized", interval: 5000, retries: 60 });
  console.log(`  -> ${receipt.txExecutionResultName} status_name=${receipt.status_name} result_name=${receipt.result_name}`);
  return receipt;
}

async function deployContract(client: any, fileName: string, args: unknown[]) {
  const code = fs.readFileSync(`../contracts/${fileName}`, "utf-8");
  const fees = await client.estimateTransactionFees({});
  const txHash = await client.deployContract({ code, args, fees: { distribution: fees.distribution, feeValue: fees.feeValue } });
  console.log(`Deploying ${fileName} - tx ${txHash} - waiting...`);
  const receipt: any = await client.waitForTransactionReceipt({ hash: txHash, waitUntil: "finalized", interval: 5000, retries: 60 });
  const address = receipt.to_address ?? receipt.recipient;
  console.log(`  -> deployed at ${address} (${receipt.txExecutionResultName})`);
  return address;
}

async function main() {
  const qkAddress = process.argv[2];
  if (!qkAddress) throw new Error("Usage: tsx demo.ts <quotekeeper_address>");

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });
  console.log(`Acting as ${account.address}, QuoteKeeper at ${qkAddress}`);

  await writeAndWait(client, qkAddress, "register_agreement", [
    "DEMO1", "Example Market Maker LLC",
    "Maintain a maximum spread of 2% and minimum depth of $50,000.",
    [`${RAW_BASE}/example_compliant_market.md`], 500,
  ]);
  await writeAndWait(client, qkAddress, "register_agreement", [
    "DEMO2", "Example Market Maker LLC",
    "Maintain a maximum spread of 2% and minimum depth of $50,000.",
    [`${RAW_BASE}/example_breach_market.md`], 500,
  ]);

  await writeAndWait(client, qkAddress, "sample", ["DEMO1"]);
  await writeAndWait(client, qkAddress, "sample", ["DEMO2"]);

  const state: any = await client.readContract({ address: qkAddress, functionName: "get_state", args: [] });
  console.log("\nQuoteKeeper get_state():", state);
  for (let i = 0; i < Number(state.sample_count); i++) {
    const s = await client.readContract({ address: qkAddress, functionName: "get_sample", args: [i] });
    console.log(`get_sample(${i}):`, safeJson(s));
  }

  const rcAddress = await deployContract(client, "retainer_consumer_studio_next.py", [
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
