import { createClient, createAccount, chains } from "genlayer-js";
import "dotenv/config";

async function main() {
  const address = process.argv[2];
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });

  const state: any = await client.readContract({ address, functionName: "get_state", args: [] });
  console.log("get_state():", state);
  const agreements: any = await client.readContract({ address, functionName: "list_agreements", args: [] });
  console.log("list_agreements():", JSON.stringify(agreements));
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
