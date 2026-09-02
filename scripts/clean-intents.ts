import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const SOURCE = join(ROOT, "docs", "AI-THREADS", "intent.json");
const DEST_DIR = join(ROOT, "src", "data");
const DEST = join(DEST_DIR, "intents.json");

const HELPLINES_TEXT = `Please seek help immediately by contacting SURPIN at 0800 078 7746 or MANI at 0800 000 2000.`;

/** Must stay in sync with src/lib/flow-tags.ts FLOW_TRANSITION_TAGS + "default". */
const FLOW_AND_CONTEXT_TAGS = new Set([
  "problem",
  "no-approach",
  "learn-more",
  "user-agree",
  "meditation",
  "user-meditation",
  "pandora-useful",
  "aduro-useful",
  "default",
]);

type Intent = {
  tag: string;
  patterns: string[];
  responses: string[];
};

type IntentsFile = { intents: Intent[] };

function clean(): void {
  const raw = readFileSync(SOURCE, "utf-8");
  const data = JSON.parse(raw) as IntentsFile;

  for (const intent of data.intents) {
    if (intent.tag === "pandora-useful") {
      intent.tag = "aduro-useful";
    }

    intent.responses = intent.responses.map((r) =>
      r
        .replace(/Pandora/g, "Aduro")
        .replace(/pandora/g, "Aduro")
        .replace(/That's geat/g, "That's great")
        .replace(/Therapeutic AI Assitant/g, "Therapeutic AI Assistant"),
    );

    if (intent.tag === "suicide") {
      intent.responses = [
        `I'm very sorry you're feeling this way. You deserve support right now. ${HELPLINES_TEXT}`,
      ];
    }

    if (intent.tag === "stressed") {
      intent.patterns.push(
        "I'm feeling stressed",
        "I feel stressed",
        "feeling a bit stressed",
        "I'm really stressed",
      );
    }

    if (intent.tag === "greeting") {
      intent.patterns.push("Hey Aduro", "Hello Aduro", "Hi Aduro");
    }

    if (intent.tag === "scared") {
      intent.patterns = intent.patterns.filter(
        (p) => !p.toLowerCase().includes("what do i do"),
      );
    }

    if (intent.tag === "fact-13") {
      intent.responses = intent.responses.map((r) =>
        r.replace(/Although Pandora cannot/g, "Although Aduro cannot"),
      );
    }

    if (intent.tag === "casual") {
      intent.patterns = intent.patterns.filter(
        (p) => p.trim().toLowerCase() !== "not really",
      );
    }

    if (FLOW_AND_CONTEXT_TAGS.has(intent.tag)) {
      intent.patterns = [];
    }
  }

  mkdirSync(DEST_DIR, { recursive: true });
  writeFileSync(DEST, JSON.stringify(data, null, 2), "utf-8");
  console.log(`Wrote ${data.intents.length} intents to ${DEST}`);
}

clean();
