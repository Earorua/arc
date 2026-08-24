import { describe, expect, it } from "vitest";
import type { ProofItem } from "../../../app/domain/learning";
import { legacyProofsToPracticingSkills } from "../../../app/lib/proof/legacy-adapter";

describe("legacy proof adapter", () => {
  it("maps every completion to practicing without trusting verified", () => {
    const proofs: ProofItem[] = [
      proof({ id: "completion-old", kind: "completion", verified: true, skillIds: ["react"] }),
      proof({ id: "completion-new", kind: "completion", verified: false, skillIds: ["typescript"] }),
    ];

    expect(legacyProofsToPracticingSkills(proofs)).toEqual(new Set(["react", "typescript"]));
  });

  it("maps a verified non-completion to at most practicing and ignores drafts", () => {
    const proofs: ProofItem[] = [
      proof({ id: "legacy-verified", kind: "project", verified: true, skillIds: ["react"] }),
      proof({ id: "legacy-draft", kind: "commit", verified: false, skillIds: ["typescript"] }),
    ];

    expect(legacyProofsToPracticingSkills(proofs)).toEqual(new Set(["react"]));
  });
});

function proof(overrides: Partial<ProofItem>): ProofItem {
  return {
    id: "legacy-proof",
    title: "Legacy evidence",
    kind: "completion",
    skillIds: ["react"],
    verified: false,
    ...overrides,
  };
}
