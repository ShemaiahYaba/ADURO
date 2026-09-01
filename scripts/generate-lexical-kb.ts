import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getAllFactIntents } from "../src/lib/intents";
import { NO_INFO_RESPONSE } from "../src/lib/constants";

const outDir = join(__dirname, "..", "public");
mkdirSync(outDir, { recursive: true });

const entries = getAllFactIntents().map((intent) => ({
  tag: intent.tag,
  response: intent.responses[0] ?? NO_INFO_RESPONSE,
  patternText: intent.patterns.join(" | "),
  embedding: null,
}));

writeFileSync(
  join(outDir, "kb-embeddings.json"),
  JSON.stringify(entries, null, 2),
  "utf-8",
);

console.log(`Wrote lexical-only kb-embeddings.json (${entries.length} entries)`);
