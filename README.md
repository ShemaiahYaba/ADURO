# Aduro

Emotion-aware mental health support chatbot. Classifies user messages with emotion + user act + salient facts, plans a dialogue act with a rule-based policy, then realizes a reply via constrained generation (with template fallbacks).

## Architecture

```
Safety (deterministic)
  → Understanding (emotion + userAct + facts)
  → Discourse (arc, question budget, non-answers)
  → Dialogue policy (BotAct + allowQuestion — rule-based invariants)
  → Realization (constrained LLM write, or template fallback)
  → Output guard (clinical/format/repetition scan)
```

- **Safety** runs on the latest message only (crisis, diagnosis, off-topic)
- **Classifier** detects emotion, user act (including advice requests, uncertainty, deflection), and salient facts
- **Discourse** tracks conversation arc, consecutive questions, and non-answers
- **Dialogue policy** chooses a `BotAct` under invariants: question budget, earned advice, reciprocity, no close-after-disclosure
- **Realization** writes 1–3 sentences under an act contract + facts + anti-repetition; `allowQuestion` composes validate+invite in one turn
- **Output guard** blocks diagnosis frames, medication, unapproved helplines, format violations, and near-duplicate replies

Response *selection* (what to do) is rule-based. Surface *realization* (how to say it) may use LLM-assisted generation bounded by that policy.


## Quick start

```bash
pnpm install
pnpm run clean:intents
pnpm run generate:kb
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Works without an API key using offline classification + template realization.

## OpenAI setup

1. Copy `.env.example` → `.env.local` (or `.env`):

```env
OPENAI_API_KEY=sk-...
ADURO_REALIZATION=generated
```

2. Restart the dev server: `pnpm dev`

3. Optional — semantic fact retrieval:

```bash
pnpm run build:kb
```

4. Optional — force template-only replies (A/B / thesis comparison):

```env
ADURO_REALIZATION=template
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm test` | Run Vitest smoke tests |
| `pnpm run clean:intents` | Regenerate `response-templates.json`, `facts.json`, `flows.json` from source |
| `pnpm run generate:kb` | Write lexical-only `public/kb-embeddings.json` (no API key) |
| `pnpm run build:kb` | Embed fact entries via OpenAI (requires `OPENAI_API_KEY`) |

## Dialogue state

The client round-trips `dialogueState` with each message:

- `arc` — opening → surfacing → understanding → supporting → closing
- `lastBotAct` / `covered` — policy memory
- `facts` — salient user disclosures (max 8, FIFO); cleared on refresh
- `recentBotTexts` — last 3 bot replies for anti-repetition
- `consecutiveQuestions` / `consecutiveNonAnswers` / `openQuestion` — discourse budgets

Refreshing the page resets the flow and facts.

See [docs/PHASE-4-PLAN.md](docs/PHASE-4-PLAN.md) for the discourse-layer design and [docs/PHASE-3-PLAN.md](docs/PHASE-3-PLAN.md) for constrained generation.

## Privacy

- Conversation history and extracted facts are sent to OpenAI when the classifier and/or realization layer run
- Facts are capped at 8 fragments and cleared on refresh
- No server-side persistence or logging of message content
- Set OpenAI usage limits before public deploy

## Helplines

Verify SURPIN and MANI numbers in `src/lib/constants.ts` from official sources before production deploy.

## Thesis / research (Phase 4)

- `/survey` page for Likert + open-text data collection (80–120 responses)
- Offline sklearn training pipeline (TF-IDF + composite scores)
- Evaluation: emotion F1, act-selection accuracy, guard block rate, template fallback rate
- Dialogue manager remains rule-based (`flows.json` + policy); realization is constrained generation

See [docs/PHASE-3-PLAN.md](docs/PHASE-3-PLAN.md) for the constrained-generation design.

## Tech stack

- Next.js 15, TypeScript, Tailwind CSS
- Vercel AI SDK + OpenAI (`@ai-sdk/openai`)
- Response templates adapted from mental health intents dataset (rebranded Aduro)
