import { openai } from "@ai-sdk/openai";

export function isOpenAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export function routerModel() {
  return openai(process.env.ADURO_ROUTER_MODEL ?? "gpt-4o-mini");
}

export function embedModel() {
  return openai.embedding(process.env.ADURO_EMBED_MODEL ?? "text-embedding-3-small");
}
