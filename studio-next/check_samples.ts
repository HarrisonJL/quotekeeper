import { createClient, createAccount, chains } from "genlayer-js";
import "dotenv/config";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function main() {
  const address = process.argv[2];
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });

  for (let i = 0; i < 2; i++) {
    const s: any = await client.readContract({ address, functionName: "get_sample", args: [i] });
    console.log(`get_sample(${i}):`, safeJson(s));
  }
  const a1: any = await client.readContract({ address, functionName: "get_agreement", args: ["DEMO1"] });
  console.log("DEMO1 agreement:", safeJson(a1));
  const a2: any = await client.readContract({ address, functionName: "get_agreement", args: ["DEMO2"] });
  console.log("DEMO2 agreement:", safeJson(a2));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
