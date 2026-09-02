# Aduro

Emotion-aware mental health support chatbot. Classifies user messages, responds with curated non-clinical templates and factual knowledge base entries.

## Architecture

```
Safety (deterministic) → Pattern-match fast path → Context follow-up → LLM router (ambiguous) → KB / templates
```

- **Safety** and **pattern-match** use the latest message only
- **Context follow-up** handles short replies using the last assistant turn (no API call)
- **LLM router** uses OpenAI with the last 4 conversation turns when `OPENAI_API_KEY` is set
- User-facing text always comes from templates or KB — never generated clinical content

## Quick start

```bash
pnpm install
pnpm run clean:intents
pnpm run generate:kb
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Works without an API key using pattern-match + context follow-up + lexical KB fallback.

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
| `pnpm run clean:intents` | Regenerate `src/data/intents.json` from source |
| `pnpm run generate:kb` | Write lexical-only `public/kb-embeddings.json` (no API key) |
| `pnpm run build:kb` | Embed fact entries via OpenAI (requires `OPENAI_API_KEY`) |

## Privacy

Conversation history is sent to OpenAI for routing only when the LLM router is invoked. Do not log message history server-side. Set OpenAI usage limits in your account before public deploy.

## Helplines

Verify SURPIN and MANI numbers in `src/lib/constants.ts` from official sources before production deploy.

## Phase 2 (thesis / research)

- `/survey` page for Likert + open-text data collection (80–120 responses)
- Offline sklearn training pipeline (TF-IDF + composite scores)
- Evaluation metrics: accuracy, precision, recall, F1
- Comparison: pattern-match vs router vs survey-trained classifier

## Tech stack

- Next.js 15, TypeScript, Tailwind CSS
- Vercel AI SDK + OpenAI (`@ai-sdk/openai`)
- Intent dataset adapted from mental health intents (rebranded Aduro)
