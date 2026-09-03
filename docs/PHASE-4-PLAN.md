# Phase 4 — Discourse Layer

## Problem

Phase 3 fixed *how* Aduro speaks. It did not fix *what Aduro chooses to do*. With
`realization=generated` on 100% of turns and no guard blocks, the prose is fine
sentence by sentence and the conversation is still incoherent.

Observed run (breakup thread):

| Turn | User | Aduro |
|---|---|---|
| 3 | My babe broke up with me | What's been weighing on your mind the most since the breakup? |
| 4 | She cheated that's most of it, what do you think i should do? | What's been weighing on your mind the most since the breakup? |
| 5 | why exactly she cheated | I hear you. What do you think you need right now to help you through this? |
| 6 | i'm not exactly sure | What do you think you need right now to help you through this? |
| 7 | I really don't know | What do you think it would feel like to have a little clarity about what you need? |
| 8 | ice cream i guess | What do you think it would feel like to have a little clarity about what you need? |

Three verbatim repeats in six turns. Six consecutive questions. `she cheated`
never acknowledged. Two direct questions to Aduro answered with questions. A
deflection (`ice cream i guess`) met with the same sentence a third time.

Second run (jaded thread): first disclosure received coping advice immediately,
with no validation and no exploration; accepting that advice received a probe
rather than an acknowledgement.

## Root cause

The system is a content planner with no discourse model. It reasons about the
current turn from local features and holds no representation of the
conversation as a trajectory.

**1. Acts are atomic; human conversational moves are compound.**
`validate`'s contract forbids questions, so validation and invitation must
occupy separate turns and the user has to volunteer into a void between them.
The `sad` exemplar pool already demonstrates the compound move —
*"I'm sorry to hear that… so, tell me why do you think you're feeling this
way?"* — and the contract strips the invitation out.

**2. Policy is a first-match cascade, not a planner.**
Five paths in `selectDecision` terminate in `explore` with the same
`prompt_elaborate` exemplar (lines 289, 366, 385, 407, 422). Nothing consults
`lastBotAct` before choosing `explore` again. There is no question budget and
no arc. Once the conversation leaves a template hint, `explore` is an attractor.

**3. No turn-taking obligations.**
`UserAct` has no value meaning *the user asked me something*, so
`"what do you think i should do?"` and `"why exactly she cheated"` collapse to
`elaborate`/`unknown` → `explore`. It has no value for not-knowing either, so
`"i'm not exactly sure"` and `"I really don't know"` also become `explore`.

**4. Two competing policies.**
`startStressFlow` opens with `offer_coping` (advice-first). The
`disclose_feeling` path opens with `validate` (validate-first). Stress matches
earlier in the cascade, so advice-first wins. `handleStressFlow` also has no
branch for `accept_offer` after `suggested_break`, so accepting the very first
suggestion falls through to the generic `explore` fallback.

**5. No text-level memory.**
`covered` dedupes *acts*, never *utterances*. The realize prompt never shows the
model its own recent sentences, while the model's previous message sits in
history as the obvious pattern to copy. Verbatim repetition is the predictable
output. `covered` also re-creates the contradiction fixed in Phase 3 whenever an
act legitimately repeats: the prompt says *act: explore* and *already covered,
do not repeat: explore*.

**6. Facts are extracted but unbound.**
The contract says "reference at least one if any exist"; nothing verifies it.
`partner was unfaithful` was in state and never surfaced.

## Target architecture

```
Safety
  → Classify        emotion + userAct + facts
  → Discourse       update obligations, budgets, arc position
  → Policy          act + allowQuestion, under invariants
  → Realize         act contract + facts + recent utterances
  → Output guard    safety + format + repetition
  → Fallback ladder
```

Discourse sits between classification and policy. Policy reads it instead of
inferring conversational position from `lastBotAct` alone.

## Types

Fold discourse fields into `DialogueState` rather than adding a second object,
since state already round-trips through the client as JSON.

```ts
export type DialogueState = {
  arc: "opening" | "surfacing" | "understanding" | "supporting" | "closing";
  lastBotAct: LastBotAct;
  facts: string[];
  covered: BotAct[];
  turnCount: number;

  /** Bot's own recent replies, newest last, cap 3. Drives anti-repetition. */
  recentBotTexts: string[];
  /** A question the bot asked that the user has not answered. */
  openQuestion: string | null;
  /** Consecutive bot turns containing a question. */
  consecutiveQuestions: number;
  /** Consecutive user non-answers (uncertainty or deflection). */
  consecutiveNonAnswers: number;
};
```

`activeFlow` and `phase` are removed with the stress flow (see below).

`normalizeDialogueState` must clamp every new field — state is client-supplied
and therefore untrusted. Cap `recentBotTexts` at 3 entries of 400 chars, clamp
counters to 0–10, and validate `arc` against the union.

### UserAct additions

```ts
| "request_advice"       // "what should I do", "what do you think i should do"
| "ask_about_situation"  // "why exactly she cheated" — voicing an unanswerable
| "express_uncertainty"  // "i don't know", "not sure"
| "deflect"              // humour or topic-shift under pressure
```

`ask_about_situation` matters more than it looks. `"why exactly she cheated"` is
not a request for information Aduro could ever have. The correct move is to
reflect the unanswerability — *"you may never get a straight answer to that,
and sitting with not knowing is its own kind of pain"* — not to ask another
question.

### BotAct additions

```ts
| "answer_directly"      // bounded, non-clinical response to request_advice
| "normalize_uncertainty"// stop asking; make not-knowing acceptable
| "sit_with"             // low-demand presence turn, no question
```

## Composition instead of finer acts

Add `allowQuestion` to `PolicyDecision` and make the act contracts
question-agnostic. Realize appends one of two clauses:

- `allowQuestion: true` → "End with one gentle, open invitation to say more."
- `allowQuestion: false` → "Do not ask a question this turn. Leave space."

This gives validate-plus-invite in a single turn without a secondary act
system, and puts question frequency under policy control rather than contract
control.

Rewrite the `validate` contract to drop "Do not ask a question", keeping the
advice prohibition.

## Policy invariants

Policy becomes a planner constrained by invariants rather than a cascade.

**Question budget.** `allowQuestion = false` when any of:
`consecutiveQuestions >= 2`; `consecutiveNonAnswers >= 1`;
`userAct === "deflect"`.

**Consecutive act rotation.** If the chosen act equals `lastBotAct`, rotate:
`explore` → `reflect` when facts exist → `normalize_uncertainty` → `sit_with`.
Never emit the same act three turns running.

**Earned advice.** `offer_coping` requires at least one prior `validate` and one
user `elaborate`. This is what kills advice-first on the jaded thread.

**Reciprocity.** `request_advice` → `answer_directly`. `ask_about_situation` →
`reflect`. `express_uncertainty` → `normalize_uncertainty`, never `explore`.
`deflect` → `sit_with`.

**Arc monotonicity.** The arc advances `opening → surfacing → understanding →
supporting` and only reaches `closing` on explicit user close with no open
distress. The existing never-close-after-disclosure guard folds into this.

Delete `handleStressFlow`, `startStressFlow`, `activeFlow`, and `phase`. Keep
the rationale map — `explain_rationale` was the one act that behaved correctly
in the observed runs.

## Anti-repetition

Two mechanisms, because the prompt alone is advisory.

**Prompt.** Include `recentBotTexts` under a heading instructing the model not
to reuse those sentences or their structure.

**Guard.** Extend the output guard signature:

```ts
checkOutput(text: string, ctx?: { recentBotTexts?: string[] }): GuardResult
```

Block when normalized token Jaccard similarity against any recent utterance
exceeds 0.8, with reason `repetition`. Deterministic, cheap, and makes verbatim
repeats impossible rather than merely discouraged. The existing regenerate step
already handles the retry.

## Facts binding

Referencing facts is the whole point of `reflect`. For that act only, if
`facts.length > 0` and the draft shares no content token with any fact,
regenerate once. Do not hard-block — brittle grounding checks cause worse
fallbacks than ungrounded prose. For all other acts, record whether a fact was
referenced as a metric instead of enforcing it.

## Anger gap

`emotionToTemplate` maps `anger` to `"default"`, which is not among the 50
templates, so angry users get zero tone exemplars. Add an `angry` template pool
or remap to an existing one.

## Metrics

Extend the API log line so coherence is measurable:

```
[aduro] realization=generated act=explore emotion=sadness turn=4 \
        q=2 facts=2 factref=1 repeat=0
```

Derivable rates: repetition, consecutive-question, unanswered-user-question,
fact-reference, earned-advice compliance. These are stronger evaluation numbers
than guard block rate, because they measure conversational quality rather than
safety-filter activity.

## Testing

The current suite asserts single turns. Every failure above is a *sequence*
failure, invisible to per-turn assertions.

Add a replay harness that feeds a scripted transcript through `runPipeline`
with a stubbed classifier and asserts invariants across the whole conversation:

- no two consecutive bot replies are equal or near-equal
- no more than two consecutive turns contain a question
- `offer_coping` never precedes a `validate`
- every `request_advice` receives a non-question act
- no act repeats three turns running
- `express_uncertainty` never yields `explore`

Seed it with the two observed transcripts as regression fixtures.

## Sequencing

Each step is independently shippable and verifiable.

1. **Replay harness + anti-repetition.** Harness first so every later step has
   a safety net. Highest visible impact, lowest risk.
2. **Question budget + `allowQuestion` composition + `validate` rewrite.**
   Fixes the observed opening turn and the interrogation loop.
3. **UserAct and BotAct additions + reciprocity rules.** Fixes ignored direct
   questions and the "I don't know" loop.
4. **Collapse the stress flow into the arc.** Removes the competing policy and
   the advice-first opening. Largest diff; do it once the invariants are
   enforced and tested.
5. **Metrics, facts binding, anger exemplars.**

## Cost and latency

No additional model calls in the common path — discourse tracking is
deterministic and the classifier already returns facts in one call. The
repetition guard may raise the regeneration rate initially; watch `repeat=` in
the logs and relax the 0.8 threshold if regeneration exceeds roughly 15% of
turns.
