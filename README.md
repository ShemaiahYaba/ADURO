# Aduro

Emotion-aware mental health support chatbot. Classifies user messages, responds with curated non-clinical templates and factual knowledge base entries.

## Architecture

```
Safety (deterministic) → Pattern-match fast path → LLM router (ambiguous only) → KB / templates
```

- **Safety** and **pattern-match** use the latest message only
- **LLM router** receives the last 4 conversation turns (when Gateway is configured)
- User-facing text always comes from templates or KB — never generated clinical content

## Quick start

```bash
pnpm install
pnpm run clean:intents
pnpm run generate:kb
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Works without AI Gateway credentials using pattern-match + lexical KB fallback.

## AI Gateway setup (optional, for LLM router + embeddings)

1. Enable AI Gateway in your [Vercel project settings](https://vercel.com/docs/ai-gateway)
2. Link and pull env:

```bash
vercel link
vercel env pull .env.local
```

Or set `AI_GATEWAY_API_KEY` in `.env.local` (see `.env.example`).

3. Regenerate KB embeddings (optional):

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
| `pnpm run build:kb` | Embed fact entries via Gateway (requires `.env.local`) |

## Privacy

Conversation history is sent to the API route for routing only when the LLM router is invoked. Do not log message history server-side. When deployed, enable Gateway per-user rate limits before public use.

## Helplines

Verify SURPIN and MANI numbers in `src/lib/constants.ts` from official sources before production deploy.

## Phase 2 (thesis / research)

- `/survey` page for Likert + open-text data collection (80–120 responses)
- Offline sklearn training pipeline (TF-IDF + composite scores)
- Evaluation metrics: accuracy, precision, recall, F1
- Comparison: pattern-match vs router vs survey-trained classifier

## Tech stack

- Next.js 15, TypeScript, Tailwind CSS
- Vercel AI SDK + AI Gateway
- Intent dataset adapted from mental health intents (rebranded Aduro)
