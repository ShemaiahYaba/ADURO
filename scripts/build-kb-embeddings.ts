import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { embed } from "ai";
import { EMBED_MODEL } from "../src/lib/constants";
import { getKbEntriesForBuild } from "../src/lib/knowledge-base";

config({ path: join(__dirname, "..", ".env.local") });

async function build(): Promise<void> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    console.error(
      "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN required. Run: vercel env pull .env.local",
    );
    process.exit(1);
  }

  const entries = getKbEntriesForBuild();
  console.log(`Embedding ${entries.length} fact entries...`);

  for (const entry of entries) {
    const { embedding } = await embed({
      model: EMBED_MODEL,
      value: entry.patternText,
    });
    entry.embedding = [...embedding];
    console.log(`  ✓ ${entry.tag}`);
  }

  const outDir = join(__dirname, "..", "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "kb-embeddings.json");
  writeFileSync(outPath, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`Wrote ${outPath}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
