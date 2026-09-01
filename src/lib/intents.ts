import intentsData from "@/data/intents.json";
import type { Intent, IntentsFile } from "./types";

const data = intentsData as IntentsFile;

export function getAllIntents(): Intent[] {
  return data.intents;
}

export function getIntentByTag(tag: string): Intent | undefined {
  return data.intents.find((i) => i.tag === tag);
}

export function isFactTag(tag: string): boolean {
  return tag.startsWith("fact-") || tag === "mental-health-fact";
}

export function getAllFactIntents(): Intent[] {
  return data.intents.filter((i) => isFactTag(i.tag));
}

export function getRouteTypeForTag(tag: string): "emotional" | "factual" | "conversational" {
  if (isFactTag(tag)) return "factual";
  const conversational = new Set([
    "greeting",
    "morning",
    "afternoon",
    "evening",
    "night",
    "goodbye",
    "thanks",
    "about",
    "skill",
    "creation",
    "name",
    "help",
    "done",
    "ask",
    "location",
    "jokes",
  ]);
  if (conversational.has(tag)) return "conversational";
  return "emotional";
}
