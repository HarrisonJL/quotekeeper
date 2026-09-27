// Live-proves the exact steward-flagged exploit is closed end to end,
// through the real cross-contract path RetainerConsumer.settle() uses
// (which Direct Mode can't simulate - see the sibling test suite's own
// documented limitation). Registers a brand-new agreement, takes ZERO
// samples, then funds and settles a RetainerConsumer against it. Under
// the old is_compliant(), zero decisive samples still reported 100%
// compliant and this would have routed the funds to the market maker.
//
// Usage: npx tsx prove_zero_sample_fix.ts <quotekeeper_address>
import { createClient, createAccount, chains } from "genlayer-js";
import "dotenv/config";
import * as fs from "fs";

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
  if (!qkAddress) throw new Error("Usage: tsx prove_zero_sample_fix.ts <quotekeeper_address>");

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });
  console.log(`Acting as ${account.address}, QuoteKeeper at ${qkAddress}`);

  await writeAndWait(client, qkAddress, "register_agreement", [
    "ZEROSAMPLE1", "Example Market Maker LLC (never sampled)",
    "Maintain a maximum spread of 2% and minimum depth of $50,000.",
    ["https://raw.githubusercontent.com/HarrisonJL/quotekeeper/main/demo/example_compliant_market.md"], 500,
  ]);

  const complianceBps: any = await client.readContract({ address: qkAddress, functionName: "compliance_bps", args: ["ZEROSAMPLE1"] });
  console.log("compliance_bps(ZEROSAMPLE1) with zero samples:", complianceBps);
  const isCompliant: any = await client.readContract({ address: qkAddress, functionName: "is_compliant", args: ["ZEROSAMPLE1", 0] });
  console.log("is_compliant(ZEROSAMPLE1, 0) with zero samples:", isCompliant);

  const rcAddress = await deployContract(client, "retainer_consumer_studio_next.py", [
    qkAddress, "ZEROSAMPLE1", 0, account.address, account.address,  // min_compliance_bps=0, the lowest possible bar
  ]);
  await writeAndWait(client, rcAddress, "fund_retainer", [], 1000n);
  await writeAndWait(client, rcAddress, "settle", []);

  const rcState: any = await client.readContract({ address: rcAddress, functionName: "get_state", args: [] });
  console.log("\nRetainerConsumer get_state():", safeJson(rcState));
  console.log(Number(rcState.owed_to_mm) === 0 ? "CORRECTLY routed to treasury, not the MM" : "BUG: routed to the MM with zero decisive samples");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
