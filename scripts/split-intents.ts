import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const SOURCE = join(ROOT, "docs", "AI-THREADS", "intent.json");
const DATA_DIR = join(ROOT, "src", "data");

const FLOW_TAGS = new Set([
  "problem",
  "no-approach",
  "learn-more",
  "user-agree",
  "meditation",
  "user-meditation",
  "aduro-useful",
  "default",
]);

/** Pandora tag → stable templateId for flow responses */
const FLOW_TAG_TO_TEMPLATE_ID: Record<string, string> = {
  problem: "stress_probe",
  "no-approach": "tips_declined",
  "learn-more": "learn_more_offer",
  "user-agree": "meditation_offer",
  meditation: "meditation_guide",
  "user-meditation": "meditation_closure",
  "aduro-useful": "session_useful",
  default: "prompt_elaborate",
};

const TAG_EMOTION: Record<string, string> = {
  sad: "sadness",
  depressed: "sadness",
  worthless: "sadness",
  anxious: "anxiety",
  stressed: "stress",
  problem: "stress",
  "no-approach": "stress",
  suicide: "crisis",
  scared: "anxiety",
  death: "grief",
  happy: "happy",
  greeting: "neutral",
  morning: "neutral",
  afternoon: "neutral",
  evening: "neutral",
  night: "neutral",
  goodbye: "neutral",
  thanks: "happy",
  help: "support",
  casual: "neutral",
};

type Intent = {
  tag: string;
  patterns: string[];
  responses: string[];
};

type IntentsFile = { intents: Intent[] };

type ResponseTemplate = {
  emotion: string;
  responses: string[];
  patterns: string[];
};

type FactEntry = {
  id: string;
  patterns: string[];
  response: string;
};

function isFactTag(tag: string): boolean {
  return tag.startsWith("fact-") || tag === "mental-health-fact";
}

const HELPLINES_TEXT = `Please seek help immediately by contacting SURPIN at 0800 078 7746 or MANI at 0800 000 2000.`;

function cleanSourceIntents(data: IntentsFile): void {
  for (const intent of data.intents) {
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
  }
}

function split(): void {
  const data = JSON.parse(readFileSync(SOURCE, "utf-8")) as IntentsFile;
  cleanSourceIntents(data);
  const templates: Record<string, ResponseTemplate> = {};
  const facts: FactEntry[] = [];

  for (const intent of data.intents) {
    if (intent.tag === "pandora-useful") {
      intent.tag = "aduro-useful";
    }

    if (isFactTag(intent.tag)) {
      facts.push({
        id: intent.tag,
        patterns: intent.patterns,
        response: intent.responses[0] ?? "",
      });
      continue;
    }

    const templateId = FLOW_TAG_TO_TEMPLATE_ID[intent.tag] ?? intent.tag;
    const patterns = FLOW_TAGS.has(intent.tag) ? [] : intent.patterns;

    templates[templateId] = {
      emotion: TAG_EMOTION[intent.tag] ?? "neutral",
      responses: intent.responses,
      patterns,
    };
  }

  templates.break_rationale = {
    emotion: "stress",
    patterns: [],
    responses: [
      "That's a fair question. When I suggested a break, I meant that mental tiredness is a real signal to rest — not that you're avoiding responsibilities. Even short pauses can help your mind recover.",
      "I hear you questioning that. Rest when you're mentally drained isn't lazy — it's how your brain recovers. You deserve space to recharge.",
    ],
  };

  templates.meditation_rationale = {
    emotion: "stress",
    patterns: [],
    responses: [
      "Meditation can help calm racing thoughts and ease tension in your body. It won't fix everything, but many people find even a few minutes of focused breathing makes stress feel more manageable.",
      "It's a simple practice: slowing down, noticing your breath, and giving your mind a pause from worry. That can make stressful feelings a bit easier to handle.",
    ],
  };

  const flows = {
    stress_support: {
      description: "Stress disclosure → tips → optional meditation",
      phases: ["idle", "stressed_disclosed", "offered_tips", "offered_meditation"],
    },
    rationaleMap: [
      {
        lastBotAct: "suggested_break",
        userAct: "express_doubt",
        templateId: "break_rationale",
      },
      {
        lastBotAct: "suggested_break",
        userAct: "ask_rationale",
        templateId: "break_rationale",
      },
      {
        lastBotAct: "offered_meditation",
        userAct: "ask_rationale",
        templateId: "meditation_rationale",
      },
      {
        lastBotAct: "offered_meditation",
        userAct: "express_doubt",
        templateId: "meditation_rationale",
      },
    ],
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(
    join(DATA_DIR, "response-templates.json"),
    JSON.stringify({ templates }, null, 2),
    "utf-8",
  );
  writeFileSync(join(DATA_DIR, "facts.json"), JSON.stringify({ facts }, null, 2), "utf-8");
  writeFileSync(join(DATA_DIR, "flows.json"), JSON.stringify(flows, null, 2), "utf-8");

  console.log(
    `Split ${data.intents.length} intents → ${Object.keys(templates).length} templates, ${facts.length} facts`,
  );
}

split();
