import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { calculateReadiness } from "../../app/lib/proof-profile";
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
});
