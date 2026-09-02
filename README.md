# Aduro

Emotion-aware mental health support chatbot. Classifies user messages, responds with curated non-clinical templates and factual knowledge base entries.

## Architecture

```
Safety → Classify (emotion + userAct) → Dialogue policy (state machine) → Templates / KB
```

- **Safety** runs on the latest message only (crisis, diagnosis, off-topic)
- **Classifier** detects emotion and user act (disclose, doubt, ask why, etc.) — offline heuristics or OpenAI when configured
- **Dialogue policy** uses `dialogueState` (flow, phase, lastBotAct) to pick the right template
- User-facing text always comes from templates or KB — never generated clinical content

Response selection is rule-based; emotion detection may use ML (survey-trained) or LLM-assisted act classification in production.

## Quick start

```bash
pnpm install
pnpm run clean:intents
pnpm run generate:kb
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Works without an API key using offline classification + lexical KB fallback.

## OpenAI setup

1. Copy `.env.example` → `.env.local` (or `.env`):

```env
OPENAI_API_KEY=sk-...
```

2. Restart the dev server: `pnpm dev`

3. Optional — semantic fact retrieval:

```bash
pnpm run build:kb
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

The client round-trips `dialogueState` with each message so multi-turn flows (stress support, rationale questions) work correctly. Refreshing the page resets the flow.

## Privacy

Conversation history is sent to OpenAI for classification only when the LLM classifier is invoked. Do not log message history server-side. Set OpenAI usage limits in your account before public deploy.

## Helplines

Verify SURPIN and MANI numbers in `src/lib/constants.ts` from official sources before production deploy.

## Thesis / research (Phase 3)

- `/survey` page for Likert + open-text data collection (80–120 responses)
- Offline sklearn training pipeline (TF-IDF + composite scores)
- Evaluation: emotion F1 for pattern-match vs act-classifier vs survey-trained model
- Dialogue manager remains rule-based (`flows.json` + policy)

## Tech stack

- Next.js 15, TypeScript, Tailwind CSS
- Vercel AI SDK + OpenAI (`@ai-sdk/openai`)
- Response templates adapted from mental health intents dataset (rebranded Aduro)
