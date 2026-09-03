# Phase 3 — Constrained Generation Layer

## Problem

The pipeline classifies a message with an LLM, compresses that understanding into
five fields, then emits a string authored before the user existed.

```
classify()  →  { emotion, userAct, templateId?, topic?, confidence }   (~30 bits)
             ↓
selectResponse()  →  one of ~60 pre-written strings
```

Nothing in the system holds *what the user said*. `"She cheated"` has nowhere to
live, so no reply can reference it. This is an information bottleneck, not a
coverage gap — adding templates yields an infinite tail (breakup, bereavement,
job loss, exam failure, ...) and every one of them is still generic.

Observed failures:

| User turn | Reply | Cause |
|---|---|---|
| "She cheated that's all what should I do?" | "Oh okay we're done for today then." | `"that's all"` lexically matched the `done` template |
| "no, not really" | "I don't have enough information in my knowledge base." | `NO_INFO_RESPONSE` is the terminal fallback in `selectResponse` |
| "wow, i never really thought about it that way" | "Have you taken any approaches to not feel this way?" | No memory that a reframe was just delivered and accepted |

Retrieval failure is asymmetric: a generative miss is bland, a retrieval miss is
actively harmful to the therapeutic alliance.

## Root cause

"Rule-based response mechanism" in the proposal was read as *pre-written response
strings*. It properly describes **content planning** (deciding what the system
should do), not **surface realization** (turning that into English).

`dialogue-policy.ts` is a good content planner. The realization stage is a 1966
ELIZA lookup table. It sounds like a script because it is one.

## Target architecture

```
Safety (deterministic, pre)         unchanged — cannot be bypassed
  ↓
Understanding (LLM)                 extended — now also extracts salient content
  ↓
Policy (rule-based)                 kept, softened — outputs a BotAct, not a string
  ↓
Realization (LLM)                   NEW — writes the sentence under constraints
  ↓
Output guard (deterministic, post)  NEW — clinical/format/length scan
  ↓
Fallback ladder                     template verbatim on any failure
```

Templates are retained as **exemplars and fallbacks**, not verbatim output.

---

## 1. Types

`src/lib/types.ts`:

```typescript
export type BotAct =
  | "greet"
  | "validate"           // acknowledge + normalise the feeling
  | "reflect"            // mirror back the user's specifics
  | "explore"            // one opening question
  | "offer_coping"       // concrete non-clinical step
  | "explain_rationale"  // why the previous suggestion
  | "affirm_progress"    // user reported improvement
  | "refuse_diagnosis"
  | "answer_fact"        // KB path, verbatim, no generation
  | "close";

export type DialogueState = {
  activeFlow: "none" | "stress_support";
  phase: string;
  lastBotAct: BotAct | "none";
  // NEW
  facts: string[];       // salient user-disclosed content, max 8, FIFO
  covered: BotAct[];     // acts already performed, prevents repetition
  turnCount: number;
};
```

`facts` are short third-person fragments produced by the understanding stage,
e.g. `["broke up with partner", "partner was unfaithful"]`. They are the only
mechanism by which turn 5 can reference turn 2.

`Classification` gains `facts: string[]`.

## 2. Understanding stage

`src/lib/classifier.ts` — extend the existing Zod schema. **No extra API call**;
`facts` rides along with the classification already being requested.

```typescript
const classificationSchema = z.object({
  emotion: emotionSchema,
  userAct: userActSchema,
  facts: z.array(z.string()).max(3),   // NEW — new disclosures this turn only
  templateId: z.string().optional(),
  topic: z.string().optional(),
  confidence: z.number().min(0).max(1),
});
```

Prompt addition: *"Extract at most 3 short factual fragments the user disclosed
this turn, in third person, no interpretation. Return `[]` if none."*

Pipeline merges `classification.facts` into `state.facts` (dedupe, cap 8, FIFO).

## 3. Policy stage

`src/lib/dialogue-policy.ts` — returns an act, not a string.

```typescript
type PolicyDecision = {
  act: BotAct;
  exemplarTemplateId?: string;  // tone anchor for realization
  emotion: Emotion;
  nextState: DialogueState;
};
```

Three changes beyond the return type:

**Soften phase ordering.** Replace hard `lastBotAct === X` preconditions with act
selection over `(emotion, userAct, covered)`. The stress flow becomes a preference
ordering, not a graph that must be walked in sequence. Real emotional conversation
loops and backtracks.

**Fix the terminal fallback.** `NO_INFO_RESPONSE` must never be reachable from an
emotional context. Unknown-in-emotional-context resolves to `explore`.

**Guard `close`.** Never select `close` when the preceding user turn contained
emotional disclosure, regardless of lexical cues. This is the `"that's all"` bug.

## 4. Realization stage — NEW

`src/lib/realize.ts`:

```typescript
export async function realize(
  decision: PolicyDecision,
  state: DialogueState,
  userMessage: string,
  history: ChatTurn[],
): Promise<{ text: string; source: "generated" | "template" }>;
```

System prompt assembled from four blocks:

**Act contract** — per-act definition of what the turn must and must not do.
Example for `validate`:
> Acknowledge the specific thing they described and normalise the feeling.
> Do not give advice. Do not ask a question. Do not suggest next steps.

**Facts** — `state.facts` plus this turn's message, with an explicit instruction
to reference at least one specific detail the user gave.

**Coverage** — `state.covered`, with an instruction not to repeat an act already
performed.

**Style contract** (hard):
- 1–3 sentences, no lists, no headings, no markdown
- Second person, plain language, contraction-friendly
- Match the user's register; mirror emoji only if they used them
- Never claim to be human; never say "as an AI"
- Never diagnose, name a disorder in a diagnostic frame, or mention medication
- Never promise outcomes
- Never invent a helpline number — only those in `constants.ts`

**Exemplars** — 2–3 strings from `exemplarTemplateId` as tone anchors, explicitly
marked as tone reference and not text to copy.

Model: same nano-class router model. Temperature ~0.7 for variety.

`answer_fact` bypasses realization entirely — KB text stays verbatim.

## 5. Output guard — NEW

`src/lib/output-guard.ts`. Deterministic, no LLM.

```typescript
export function checkOutput(text: string): { ok: true } | { ok: false; reason: string };
```

Rejection rules:

| Rule | Detection |
|---|---|
| Diagnosis frame | `you (have\|might have\|are suffering from)`, disorder name in diagnostic context |
| Medication | drug names, `medication`, `prescri`, `dosage` |
| Clinical claim | `clinically`, `diagnos`, `disorder` outside KB-fact context |
| Unapproved helpline | any phone-shaped string not in `constants.HELPLINES` |
| Format violation | markdown list/heading, > 3 sentences, > 400 chars |
| Persona break | `as an AI`, `language model` |

## 6. Fallback ladder

Every step degrades to the current, already-shipped behaviour:

1. Generated → guard passes → send
2. Guard fails → regenerate once with a stricter reminder
3. Second guard failure → **template verbatim**
4. No `OPENAI_API_KEY` → **template verbatim** (offline dev preserved)
5. LLM error / timeout → **template verbatim**

Each turn records `source` (`generated` / `regenerated` / `template_fallback` /
`guard_blocked`). These counts are directly reportable in the evaluation chapter.

## 7. Feature flag

`ADURO_REALIZATION=generated | template` (default `generated`, `template`
reproduces current behaviour exactly). Enables side-by-side comparison of the
same test set in both modes — a real evaluation artifact for the write-up.

## 8. Cost and latency

| | Now | After |
|---|---|---|
| LLM calls / turn | 1 | 2 (understanding, realization) |
| Est. cost / turn | ~$0.0005 | ~$0.0015 |
| Added latency | — | ~600–900 ms |

The existing 800 ms artificial typing delay in `Chat.tsx` should be reduced or
removed once real latency exists.

## 9. Testing

Generated text cannot be asserted verbatim. Test the parts that are deterministic.

| Suite | Assertion |
|---|---|
| `output-guard.test.ts` | Known-bad strings rejected, known-good accepted |
| `dialogue-policy.test.ts` | `(classification, state) → expected BotAct` — the bulk of coverage |
| `realize.test.ts` | Mocked LLM; assert the prompt contains the act contract, the facts, and the style rules |
| `pipeline.test.ts` | Golden transcripts for both screenshot conversations; assert the **act sequence**, not the text |
| `scripts/smoke-transcript.ts` | Not in CI. Hits the live API, prints transcripts for manual review |

Explicit regression cases:
- `"She cheated that's all what should I do?"` → act is `validate` or `reflect`, never `close`
- `"no, not really"` mid-flow → never `NO_INFO_RESPONSE`
- `"wow, i never really thought about it that way"` → `affirm_progress`, not `explore`

## 10. Privacy

`facts` round-trip through the client alongside `dialogueState`, consistent with
the existing stateless server design. Implications to document in the README:

- Extracted facts are sent to OpenAI on every turn (they already are, as history)
- Facts are capped at 8 fragments and cleared on refresh
- No server-side persistence or logging of facts

## 11. Thesis framing

The contribution is stronger than the current design, not weaker:

> A curated response corpus is used as generation constraints and safety
> fallbacks rather than verbatim output, bounded by a rule-based dialogue policy
> and deterministic pre- and post-filters.

| Proposal requirement | Where it lives |
|---|---|
| Emotion classification | Understanding stage; measurable with F1 against the survey set |
| Rule-based response mechanism | `dialogue-policy.ts` — act selection, inspectable and unit-tested |
| Non-clinical, no diagnosis | Deterministic pre-safety + post-guard, both testable |
| Safe, controlled responses | Fallback ladder, with measured fallback rates |
| Evaluation metrics | Act-selection accuracy, guard block rate, template fallback rate, emotion F1 |

The differentiator from a wrapper is not "we never generate." It is: deterministic
crisis handling that cannot be prompted away, an enforced clinical boundary
verified on output, an inspectable dialogue policy, grounded facts, and measured
evaluation.

## 12. Implementation order

1. `types.ts` — `BotAct`, extended `DialogueState`, `facts` on `Classification`
2. `output-guard.ts` + tests (pure, no dependencies, lands first)
3. `classifier.ts` — add `facts` extraction to the existing schema
4. `dialogue-policy.ts` — return `PolicyDecision`, soften phases, fix fallback and `close`
5. `realize.ts` + prompt assembly + fallback ladder
6. `pipeline.ts` — wire understanding → policy → realization → guard
7. `route.ts` / `Chat.tsx` — round-trip extended state
8. Tests: policy table, golden transcripts, guard
9. `README.md` — architecture, privacy, `ADURO_REALIZATION` flag

## Out of scope

- Server-side persistence (client round-trip remains sufficient)
- Streaming responses
- Multi-flow support beyond `stress_support`
- `/survey` page and offline sklearn training (unchanged, still Phase 4)
- RAG beyond the existing fact KB
