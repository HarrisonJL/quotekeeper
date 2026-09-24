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
  console.log(`${functionName} submitted ${txHash} - waiting...`);
  const receipt: any = await client.waitForTransactionReceipt({ hash: txHash, waitUntil: "finalized", interval: 5000, retries: 60 });
  console.log(`  -> ${receipt.txExecutionResultName}`);
  return receipt;
}

async function main() {
  const qkAddress = "0xe118229AB26d0Be859aAd7e703f30dCc09f2090D";
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });

  const code = fs.readFileSync("../contracts/retainer_consumer_studio_next.py", "utf-8");
  const fees = await client.estimateTransactionFees({});
  const txHash = await client.deployContract({
    code,
    args: [qkAddress, "DEMO1", 9000, account.address, account.address],
    fees: { distribution: fees.distribution, feeValue: fees.feeValue },
  });
  console.log("Deploy tx:", txHash);
  const receipt: any = await client.waitForTransactionReceipt({ hash: txHash, waitUntil: "finalized", interval: 5000, retries: 60 });
  const address = receipt.to_address ?? receipt.recipient;
  console.log(`Contract address: ${address} (${receipt.txExecutionResultName})`);

  await writeAndWait(client, address, "fund_retainer", [], 1000n);
  await writeAndWait(client, address, "settle", []);

  const state: any = await client.readContract({ address, functionName: "get_state", args: [] });
  console.log("\nget_state():", safeJson(state));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
