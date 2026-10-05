// Confirms the code deployed on Studio Next is byte-identical to this repo's
// source (same SHA-256), fetched straight from the chain.
//
//   npx tsx verify_code.ts                      # QuoteKeeper at the reviewed address
//   npx tsx verify_code.ts <address> <file>     # any other deployment / source file
//   CHAIN=bradbury npx tsx verify_code.ts <address> ../contracts/quotekeeper.py   # a Bradbury deployment
//                                               # e.g. a RetainerConsumer + ../contracts/retainer_consumer_studio_next.py
import { createClient, chains } from "genlayer-js";
import * as crypto from "crypto";
import * as fs from "fs";

const REVIEWED = "0x1A0A3594CDB6b650D1e417269BC64152B87B503d";

async function main() {
  const address = process.argv[2] ?? REVIEWED;
  const file = process.argv[3] ?? "../contracts/quotekeeper_studio_next.py";
  const chain = process.env.CHAIN === "bradbury" ? (chains as any).testnetBradbury : (chains as any).studioDevnet;
  const client: any = createClient({ chain });
  let onchain: any = await client.getContractCode(address);
  if (typeof onchain !== "string") onchain = Buffer.from(onchain).toString("utf-8");
  const local = fs.readFileSync(file, "utf-8");
  const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  console.log(`${chain.name}: ${address}`);
  console.log(`  on-chain  sha256 ${sha(onchain)} (${onchain.length} chars)`);
  console.log(`  ${file} sha256 ${sha(local)} (${local.length} chars)`);
  console.log(onchain === local ? "IDENTICAL" : "DIFFERENT");
  process.exit(onchain === local ? 0 : 1);
}

main().catch((e) => {
  console.error(e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
