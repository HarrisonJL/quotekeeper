// Completes the demo flow after register_agreement/sample already landed:
// deploys RetainerConsumer, funds it, and settles it against the live
// is_compliant() result.
//
// Usage: npx tsx finish_demo.ts <quotekeeper_address>
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
  if (!qkAddress) throw new Error("Usage: tsx finish_demo.ts <quotekeeper_address>");

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });
  console.log(`Acting as ${account.address}, QuoteKeeper at ${qkAddress}`);

  const rcAddress = await deployContract(client, "retainer_consumer_studio_next.py", [
    qkAddress, "DEMO1", 9000, account.address, account.address,
  ]);
  await writeAndWait(client, rcAddress, "fund_retainer", [], 1000n);
  await writeAndWait(client, rcAddress, "settle", []);

  const rcState: any = await client.readContract({ address: rcAddress, functionName: "get_state", args: [] });
  console.log("\nRetainerConsumer get_state():", safeJson(rcState));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
