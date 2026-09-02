import factsData from "@/data/facts.json";
import type { FactsFile } from "./types";

const data = factsData as FactsFile;

export function getAllFacts() {
  return data.facts;
}

export function isFactId(id: string): boolean {
  return id.startsWith("fact-") || id === "mental-health-fact";
}

export function getFactById(id: string) {
  return data.facts.find((f) => f.id === id);
}
