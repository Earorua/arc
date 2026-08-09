import { roleBlueprintSchema, type LearningResource } from "../contracts/intelligence";
import { flagshipRole } from "./flagship-role";

function resourceId(skillId: string): string {
  return `${skillId}-official`;
}

function masteryCriteria(name: string): [string, string] {
  return [
    `Explain where ${name} belongs in a production full-stack system and justify one trade-off.`,
    `Produce a reviewable artifact that applies ${name} and states how the result was verified.`,
  ];
}

function toResource(skill: (typeof flagshipRole.skills)[number]): LearningResource {
  const source = skill.sources[0];
  if (!source) throw new Error(`Flagship source missing for ${skill.id}`);

  return {
    id: resourceId(skill.id),
    title: source.title,
    url: source.url,
    provider: new URL(source.url).hostname.replace(/^www\./u, ""),
    language: "en",
    cost: "free",
    format: "documentation",
    sourceTier: "primary",
    purpose: "primary",
    estimatedMinutes: null,
    lastVerifiedAt: source.observedAt,
    skillIds: [skill.id],
  };
}

export const flagshipBlueprint = roleBlueprintSchema.parse({
  id: flagshipRole.id,
  name: flagshipRole.name,
  summary: flagshipRole.summary,
  version: "2026.08.1",
  status: "ready",
  updatedAt: "2026-08-10",
  languagePolicy: "english-first",
  skills: flagshipRole.skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    category: skill.category,
    importance: skill.importance,
    why: skill.why,
    confidence: skill.confidence,
    masteryCriteria: masteryCriteria(skill.name),
    prerequisiteIds: skill.prerequisiteIds,
    resourceIds: [resourceId(skill.id)],
  })),
  resources: flagshipRole.skills.map(toResource),
  phases: flagshipRole.phases,
});
