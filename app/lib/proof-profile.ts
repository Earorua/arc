import type { ProofItem, SkillNode } from "../domain/learning";

export interface ReadinessProfile {
  percentage: number;
  verifiedSkillIds: string[];
}

export interface LocalCoverageProfile {
  percentage: number;
  completedSkillIds: string[];
}

export function getLinkedSkillIds(
  skills: ReadonlyArray<SkillNode>,
  skillIds: ReadonlyArray<string>,
): string[] {
  const allowedSkillIds = new Set(skills.map((skill) => skill.id));

  return [...new Set(skillIds.filter((skillId) => allowedSkillIds.has(skillId)))].sort();
}

export function calculateReadiness(
  skills: ReadonlyArray<SkillNode>,
  proofs: ReadonlyArray<ProofItem>,
): ReadinessProfile {
  const allowedSkillIds = new Set(skills.map((skill) => skill.id));

  if (allowedSkillIds.size === 0) {
    return { percentage: 0, verifiedSkillIds: [] };
  }

  const verifiedSkillIds = getLinkedSkillIds(
    skills,
    proofs.filter((proof) => proof.verified && proof.kind !== "completion").flatMap((proof) => proof.skillIds),
  );

  return {
    percentage: Math.round((verifiedSkillIds.length / allowedSkillIds.size) * 100),
    verifiedSkillIds,
  };
}

export function calculateLocalCoverage(
  skills: ReadonlyArray<SkillNode>,
  proofs: ReadonlyArray<ProofItem>,
): LocalCoverageProfile {
  const allowedSkillIds = new Set(skills.map((skill) => skill.id));

  if (allowedSkillIds.size === 0) {
    return { percentage: 0, completedSkillIds: [] };
  }

  const completedSkillIds = getLinkedSkillIds(
    skills,
    proofs.filter((proof) => proof.verified && proof.kind === "completion").flatMap((proof) => proof.skillIds),
  );

  return {
    percentage: Math.round((completedSkillIds.length / allowedSkillIds.size) * 100),
    completedSkillIds,
  };
}
