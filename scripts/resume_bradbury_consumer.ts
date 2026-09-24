// Resumes scripts/demo.ts after the RetainerConsumer deploy hit Bradbury's
// known raw-EVM consensus-contract revert (DEMO1/DEMO2 already registered
// and sampled - this just retries the consumer deploy + fund + settle).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = join(__dirname, "..", "contracts");

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

async function main() {
  const qkAddress = process.argv[2];
  if (!qkAddress) throw new Error("Usage: tsx scripts/resume_bradbury_consumer.ts <quotekeeper_address>");

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: testnetBradbury, account });
  console.log(`Acting as ${account.address}`);

  const code = readFileSync(join(CONTRACTS_DIR, "retainer_consumer.py"), "utf-8");
  const txHash = await client.deployContract({ code, args: [qkAddress, "DEMO1", 9000, account.address, account.address] });
  console.log(`Deploying retainer_consumer.py - tx ${txHash} - waiting...`);
  const receipt: any = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}` & { length: 66 },
    status: "FINALIZED" as any,
    interval: 15000,
    retries: 240,
  });
  const rcAddress = receipt.to_address ?? receipt.recipient;
  console.log(`  -> deployed at ${rcAddress} (${receipt.txExecutionResultName})`);

  await writeAndWait(client, rcAddress, "fund_retainer", [], 1000n);
  await writeAndWait(client, rcAddress, "settle", []);

  const rcState: any = await client.readContract({ address: rcAddress, functionName: "get_state", args: [] });
  console.log("\nRetainerConsumer get_state():", safeJson(rcState));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
