import type { ProofItem, SkillNode } from "../domain/learning";

export interface ReadinessProfile {
  percentage: number;
  verifiedSkillIds: string[];
}

export function calculateReadiness(
  skills: ReadonlyArray<SkillNode>,
  proofs: ReadonlyArray<ProofItem>,
): ReadinessProfile {
  if (skills.length === 0) {
    return { percentage: 0, verifiedSkillIds: [] };
  }

  const allowedSkillIds = new Set(skills.map((skill) => skill.id));
  const verifiedSkillIds = [
    ...new Set(
      proofs
        .filter((proof) => proof.verified)
        .flatMap((proof) => proof.skillIds)
        .filter((skillId) => allowedSkillIds.has(skillId)),
    ),
  ].sort();

  return {
    percentage: Math.round((verifiedSkillIds.length / skills.length) * 100),
    verifiedSkillIds,
  };
}
