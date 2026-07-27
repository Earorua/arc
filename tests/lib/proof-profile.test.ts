import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { calculateLocalCoverage, calculateReadiness, getLinkedSkillIds } from "../../app/lib/proof-profile";
import type { ProofItem } from "../../app/domain/learning";

describe("calculateReadiness", () => {
  it("never increases readiness without verified evidence", () => {
    expect(calculateReadiness(flagshipRole.skills, [])).toEqual({
      percentage: 0,
      verifiedSkillIds: [],
    });
  });

  it("counts unique, valid skills from verified proofs only", () => {
    const proofs: ProofItem[] = [
      {
        id: "p1",
        title: "Verified commit",
        kind: "commit",
        skillIds: ["typescript", "react", "react", "not-in-this-role"],
        verified: true,
      },
      {
        id: "p2",
        title: "Draft note",
        kind: "note",
        skillIds: ["cloud-delivery"],
        verified: false,
      },
      {
        id: "p3",
        title: "Local completion",
        kind: "completion",
        skillIds: ["cloud-delivery"],
        verified: true,
      },
    ];

    expect(calculateReadiness(flagshipRole.skills, proofs)).toEqual({
      percentage: 13,
      verifiedSkillIds: ["react", "typescript"],
    });
  });

  it("returns zero readiness for an empty role catalog", () => {
    const proof: ProofItem = {
      id: "p1",
      title: "Verified commit",
      kind: "commit",
      skillIds: ["react"],
      verified: true,
    };

    expect(calculateReadiness([], [proof])).toEqual({
      percentage: 0,
      verifiedSkillIds: [],
    });
  });

  it("uses unique role skills as the readiness denominator", () => {
    const repeatedSkillCatalog = [flagshipRole.skills[0], flagshipRole.skills[0]];
    const proof: ProofItem = {
      id: "p1",
      title: "Verified foundation",
      kind: "commit",
      skillIds: [flagshipRole.skills[0].id],
      verified: true,
    };

    expect(calculateReadiness(repeatedSkillCatalog, [proof])).toEqual({
      percentage: 100,
      verifiedSkillIds: [flagshipRole.skills[0].id],
    });
  });

  it("filters and deduplicates linked skills against the current role", () => {
    expect(getLinkedSkillIds(flagshipRole.skills, ["react", "unknown", "react"])).toEqual(["react"]);
  });

  it("tracks verified local completion coverage separately from role readiness", () => {
    const proofs: ProofItem[] = [
      {
        id: "local",
        title: "Local completion",
        kind: "completion",
        skillIds: ["react", "typescript", "react", "unknown"],
        verified: true,
      },
      {
        id: "local-draft",
        title: "Unverified local completion",
        kind: "completion",
        skillIds: ["cloud-delivery"],
        verified: false,
      },
      {
        id: "external",
        title: "External project",
        kind: "project",
        skillIds: ["cloud-delivery"],
        verified: true,
      },
    ];

    expect(calculateLocalCoverage(flagshipRole.skills, proofs)).toEqual({
      completedSkillIds: ["react", "typescript"],
      percentage: 13,
    });
  });
});
