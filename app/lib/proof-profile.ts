import type { SkillEvidenceProjection } from "../contracts/proof-ledger";
import type { SkillImportance, SkillNode } from "../domain/learning";

export interface ReadinessProfile {
  percentage: number;
  demonstratedOrVerifiedSkillIds: string[];
  verifiedSkillIds: string[];
}

const importanceWeight: Record<SkillImportance, number> = {
  core: 3,
  strong: 2,
  advantage: 1,
};

const statusRank: Record<SkillEvidenceProjection["status"], number> = {
  exploring: 0,
  practicing: 1,
  demonstrated: 2,
  verified: 3,
};

export function getLinkedSkillIds(
  skills: ReadonlyArray<SkillNode>,
  skillIds: ReadonlyArray<string>,
): string[] {
  const allowedSkillIds = new Set(skills.map((skill) => skill.id));
  return [...new Set(skillIds.filter((skillId) => allowedSkillIds.has(skillId)))].sort();
}

export function calculateReadiness(
  skills: ReadonlyArray<SkillNode>,
  projections: ReadonlyArray<SkillEvidenceProjection>,
): ReadinessProfile {
  const uniqueSkills = new Map(skills.map((skill) => [skill.id, skill]));
  const denominator = [...uniqueSkills.values()].reduce(
    (total, skill) => total + importanceWeight[skill.importance],
    0,
  );
  if (denominator === 0) {
    return { percentage: 0, demonstratedOrVerifiedSkillIds: [], verifiedSkillIds: [] };
  }

  const strongest = new Map<string, SkillEvidenceProjection["status"]>();
  for (const projection of projections) {
    if (projection.audience !== "internal" || !uniqueSkills.has(projection.skillId)) continue;
    const current = strongest.get(projection.skillId) ?? "exploring";
    if (statusRank[projection.status] > statusRank[current]) strongest.set(projection.skillId, projection.status);
  }
  const demonstratedOrVerifiedSkillIds = [...strongest]
    .filter(([, status]) => status === "demonstrated" || status === "verified")
    .map(([skillId]) => skillId)
    .sort();
  const verifiedSkillIds = [...strongest]
    .filter(([, status]) => status === "verified")
    .map(([skillId]) => skillId)
    .sort();
  const numerator = demonstratedOrVerifiedSkillIds.reduce(
    (total, skillId) => total + importanceWeight[uniqueSkills.get(skillId)!.importance],
    0,
  );
  return {
    percentage: Math.round((numerator / denominator) * 100),
    demonstratedOrVerifiedSkillIds,
    verifiedSkillIds,
  };
}
