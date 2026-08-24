import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { calculateReadiness, getLinkedSkillIds } from "../../app/lib/proof-profile";
import type { SkillEvidenceProjection } from "../../app/contracts/proof-ledger";

function projection(skillId: string, status: SkillEvidenceProjection["status"]): SkillEvidenceProjection {
  const hasProof = status === "demonstrated" || status === "verified";
  return {
    skillId, audience: "internal", status, completedUnitIds: [], latestUsedAt: null,
    strongestProofId: hasProof ? "proof-1" : null,
    strongestVersionId: hasProof ? "version-1" : null,
  };
}

describe("calculateReadiness", () => {
  it("uses importance weights and requires demonstrated or verified projections", () => {
    const result = calculateReadiness(flagshipRole.skills, [
      projection("react", "practicing"),
      projection("design-systems", "demonstrated"),
      projection("typescript", "verified"),
      projection("unknown", "verified"),
    ]);

    expect(result).toEqual({
      percentage: 13,
      demonstratedOrVerifiedSkillIds: ["design-systems", "typescript"],
      verifiedSkillIds: ["typescript"],
    });
  });

  it("returns zero for an empty role and deduplicates projections", () => {
    expect(calculateReadiness([], [projection("react", "verified")])).toEqual({
      percentage: 0,
      demonstratedOrVerifiedSkillIds: [],
      verifiedSkillIds: [],
    });
    expect(calculateReadiness([flagshipRole.skills[2]], [
      projection("react", "demonstrated"), projection("react", "verified"),
    ])).toEqual({
      percentage: 100,
      demonstratedOrVerifiedSkillIds: ["react"],
      verifiedSkillIds: ["react"],
    });
  });

  it("filters and deduplicates linked skills against the current role", () => {
    expect(getLinkedSkillIds(flagshipRole.skills, ["react", "unknown", "react"])).toEqual(["react"]);
  });
});
