import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { embed } from "ai";
import { embedModel } from "../src/lib/openai";
import { getKbEntriesForBuild } from "../src/lib/knowledge-base";

const root = join(__dirname, "..");
config({ path: join(root, ".env") });
config({ path: join(root, ".env.local") });

async function build(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required in .env or .env.local");
    process.exit(1);
  }

  const entries = getKbEntriesForBuild();
  console.log(`Embedding ${entries.length} fact entries...`);

  for (const entry of entries) {
    const { embedding } = await embed({
      model: embedModel(),
      value: entry.patternText,
    });
    entry.embedding = [...embedding];
    console.log(`  ✓ ${entry.tag}`);
  }

  const outDir = join(root, "public");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "kb-embeddings.json");
  writeFileSync(outPath, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`Wrote ${outPath}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
