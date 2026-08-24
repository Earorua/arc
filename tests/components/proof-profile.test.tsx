import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProofProfile } from "../../app/components/proof/proof-profile";
import { flagshipRole } from "../../app/data/flagship-role";
import type { SkillEvidenceProjection } from "../../app/contracts/proof-ledger";

afterEach(cleanup);

const projection = (skillId: string, status: SkillEvidenceProjection["status"]): SkillEvidenceProjection => ({
  skillId,
  audience: "internal",
  status,
  completedUnitIds: status === "practicing" ? ["unit-1"] : [],
  strongestProofId: status === "demonstrated" || status === "verified" ? "proof-1" : null,
  strongestVersionId: status === "demonstrated" || status === "verified" ? "version-1" : null,
  latestUsedAt: status === "exploring" ? null : "2026-08-24T10:00:00.000Z",
});

describe("ProofProfile", () => {
  it("shows projection-based readiness without inventing progress", () => {
    render(<ProofProfile projections={[]} skills={flagshipRole.skills} />);

    expect(screen.getByLabelText("0% role readiness")).toBeInTheDocument();
    expect(screen.getByLabelText("0 verified skills")).toBeInTheDocument();
    expect(screen.getByText(/submit inspectable evidence to demonstrate/i)).toBeInTheDocument();
  });

  it("labels local completion as Practicing and never Verified locally", () => {
    render(<ProofProfile projections={[projection("react", "practicing")]} skills={flagshipRole.skills} />);

    expect(screen.getByText("Practicing")).toBeInTheDocument();
    expect(screen.queryByText("Verified locally")).not.toBeInTheDocument();
    expect(screen.getByLabelText("0 verified skills")).toBeInTheDocument();
  });

  it("uses importance-weighted demonstrated-or-verified readiness and counts verified separately", () => {
    render(<ProofProfile projections={[
      projection("react", "demonstrated"),
      projection("design-systems", "verified"),
    ]} skills={flagshipRole.skills} />);

    expect(screen.getByLabelText("13% role readiness")).toBeInTheDocument();
    expect(screen.getByLabelText("1 verified skill")).toBeInTheDocument();
    expect(screen.getByText("Exploring")).toBeInTheDocument();
    expect(screen.getByText("Demonstrated")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });
});
