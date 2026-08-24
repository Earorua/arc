import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { completeDemoUnit, createDemoState, mergeSetup } from "../../app/lib/demo-store";
import { calculateReadiness } from "../../app/lib/proof-profile";
import { legacyProofsToPracticingSkills } from "../../app/lib/proof/legacy-adapter";
import { projectSkillEvidence } from "../../app/lib/proof/projection";

describe("Arc flagship demo loop", () => {
  it("moves from setup through completion into attributable readiness", () => {
    const configured = mergeSetup(createDemoState(), {
      roleId: flagshipRole.id,
      level: "beginner",
      weeklyMinutes: 420,
      targetWeeks: 18,
    });

    expect(configured.setup).toEqual({
      roleId: flagshipRole.id,
      level: "beginner",
      weeklyMinutes: 420,
      targetWeeks: 18,
    });

    const completed = completeDemoUnit(configured, flagshipRole.today);
    const practicingSkillIds = legacyProofsToPracticingSkills(completed.proofs);
    const projections = projectSkillEvidence({
      skillIds: flagshipRole.skills.map(({ id }) => id),
      completedSkillIds: practicingSkillIds,
      versions: [],
      reviews: [],
      visibility: "internal",
    });
    const readiness = calculateReadiness(flagshipRole.skills, projections);

    expect(completed.completedUnitIds).toEqual([flagshipRole.today.id]);
    expect(completed.proofs[0].kind).toBe("completion");
    expect(completed.proofs[0].skillIds).toEqual(flagshipRole.today.skillIds);
    expect(readiness.percentage).toBe(0);
    expect(projections.filter(({ status }) => status === "practicing")).toHaveLength(3);
  });
});
