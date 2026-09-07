/**
 * Offline situation extractors for dialogue-state facts.
 * Situation cues are curated from common EmpatheticDialogues / counseling
 * themes (relationships, family, work, grief, money, school) plus YA phrasing
 * relevant to Aduro's Nigerian young-adult audience. Kept deterministic and
 * small — the LLM classifier can extract freer phrasing when online.
 */

type FactRule = {
  test: RegExp;
  fact: string;
  /** Skip if an earlier fact already covers this theme. */
  skipIfIncludes?: string[];
};

const RULES: FactRule[] = [
  {
    test: /\b(cheat(ed|ing)?|unfaithful|affair|side[- ]?chick|side[- ]?guy)\b/,
    fact: "partner was unfaithful",
  },
  {
    test: /\b(broke\s*up|break\s*up|breakup|dumped|left\s+me|ex\b)/,
    fact: "went through a breakup",
  },
  {
    test: /\b(ghost(ed|ing)?|left\s+on\s+read|blocked\s+me)\b/,
    fact: "feeling ignored or ghosted",
  },
  {
    test: /\b(babe|girlfriend|boyfriend|partner|wife|husband|relationship)\b/,
    fact: "relationship trouble",
    skipIfIncludes: ["breakup", "unfaithful", "ghosted"],
  },
  {
    test: /\b(exam|school|study|assignment|lecturer|campus|hostel|jamb|waec|nysc|cgpa|semester)\b/,
    fact: "academic pressure",
  },
  {
    test: /\b(work|job|overtime|boss|shift|internship|unemployed|laid\s*off)\b/,
    fact: "work stress",
  },
  {
    test: /\b(mum|mom|dad|daddy|mummy|parents?|family|siblings?|uncle|aunt|relatives?)\b/,
    fact: "family pressure",
  },
  {
    test: /\b(broke|money|fees?|allowance|rent|debt|financial|no\s+money)\b/,
    fact: "money worries",
  },
  {
    test: /\b(friend(s)?\s+(betrayed|left|ditched)|lost\s+(my\s+)?friends?|no\s+friends)\b/,
    fact: "friendship strain",
  },
  {
    test: /\b(died|passed\s+away|funeral|lost\s+(my|him|her)|grief|mourning)\b/,
    fact: "dealing with loss",
  },
  {
    test: /\b(can'?t\s+sleep|insomnia|nightmares?|not\s+sleeping)\b/,
    fact: "sleep is disrupted",
  },
  {
    test: /\b(church|pastor|mosque|imam|prayer|fasting|religious)\b/,
    fact: "faith or community pressure",
  },
  {
    test: /\b(jealous|jealousy|envious)\b/,
    fact: "feeling jealous",
  },
  {
    test: /\b(ashamed|shame|embarrassed|humiliated)\b/,
    fact: "feeling ashamed",
  },
  {
    test: /\b(lonely|alone|isolated|no\s+one\s+(to\s+talk|cares)|left\s+out)\b/,
    fact: "feeling lonely",
  },
  {
    test: /\b(overwhelmed|burned?\s*out|exhausted|too\s+much)\b/,
    fact: "feeling overwhelmed",
  },
  {
    test: /\b(hopeless|jaded|numb|empty|nothing\s+matters)\b/,
    fact: "feeling empty or hopeless",
  },
  {
    test: /\b(anxious|anxiety|uneasy|panic|worried|terrified|nervous)\b/,
    fact: "feeling anxious",
  },
  {
    test: /\b(sad|down|heartbroken|devastated|disappointed|hurt)\b/,
    fact: "feeling sad",
  },
  {
    test: /\b(angry|mad|furious|pissed|irritated|betrayed)\b/,
    fact: "feeling angry",
  },
];

/** Max facts kept per turn (classifier schema also caps at 3). */
export const MAX_SITUATION_FACTS = 3;

export function extractSituationFacts(message: string): string[] {
  const msg = message.toLowerCase();
  const facts: string[] = [];

  for (const rule of RULES) {
    if (!rule.test.test(msg)) continue;
    if (
      rule.skipIfIncludes?.some((needle) =>
        facts.some((f) => f.toLowerCase().includes(needle)),
      )
    ) {
      continue;
    }
    if (facts.some((f) => f === rule.fact)) continue;
    facts.push(rule.fact);
    if (facts.length >= MAX_SITUATION_FACTS) break;
  }

  return facts;
}

/** Broad matcher used to prefer emotional routing over small-talk tags. */
export function looksLikeEmotionalSituation(facts: string[]): boolean {
  return facts.some((f) =>
    /unfaithful|breakup|relationship|ghosted|anxious|sad|work|academic|angry|family|money|friend|loss|sleep|faith|jealous|ashamed|lonely|overwhelm|hopeless/i.test(
      f,
    ),
  );
}

export function emotionHintFromFacts(
  facts: string[],
): "anxiety" | "anger" | "stress" | "grief" | "sadness" {
  if (facts.some((f) => /anxious/i.test(f))) return "anxiety";
  if (facts.some((f) => /angry/i.test(f))) return "anger";
  if (facts.some((f) => /loss/i.test(f))) return "grief";
  if (facts.some((f) => /work|academic|overwhelm|money|family/i.test(f))) {
    return "stress";
  }
  return "sadness";
}
