import templatesData from "@/data/response-templates.json";
import type { Emotion, ResponseTemplate, TemplatesFile } from "./types";

const data = templatesData as TemplatesFile;

export function getAllTemplates(): Array<ResponseTemplate & { id: string }> {
  return Object.entries(data.templates).map(([id, t]) => ({
    id,
    emotion: t.emotion as Emotion,
    responses: t.responses,
    patterns: t.patterns,
  }));
}

export function getTemplateById(id: string): (ResponseTemplate & { id: string }) | undefined {
  const t = data.templates[id];
  if (!t) return undefined;
  return {
    id,
    emotion: t.emotion as Emotion,
    responses: t.responses,
    patterns: t.patterns,
  };
}

export function getTemplateIdsWithPatterns(): string[] {
  return getAllTemplates()
    .filter((t) => t.patterns.length > 0)
    .map((t) => t.id);
}
