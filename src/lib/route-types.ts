import { isFactId } from "./facts";

export type RouteType = "emotional" | "factual" | "conversational";

export type PatternRouteType = RouteType;

const CONVERSATIONAL_TEMPLATES = new Set([
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

export function getRouteTypeForTemplate(templateId: string): RouteType {
  if (isFactId(templateId)) return "factual";
  if (CONVERSATIONAL_TEMPLATES.has(templateId)) return "conversational";
  return "emotional";
}
