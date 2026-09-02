import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getKbEntriesForBuild } from "../src/lib/knowledge-base";
import { NO_INFO_RESPONSE } from "../src/lib/constants";

const outDir = join(__dirname, "..", "public");
mkdirSync(outDir, { recursive: true });

const entries = getKbEntriesForBuild().map((entry) => ({
  ...entry,
  response: entry.response || NO_INFO_RESPONSE,
}));

writeFileSync(
  join(outDir, "kb-embeddings.json"),
  JSON.stringify(entries, null, 2),
  "utf-8",
);

console.log(`Wrote lexical-only kb-embeddings.json (${entries.length} entries)`);
