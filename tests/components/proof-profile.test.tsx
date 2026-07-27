import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProofProfile } from "../../app/components/proof/proof-profile";
import { flagshipRole } from "../../app/data/flagship-role";
import type { ProofItem } from "../../app/domain/learning";

afterEach(cleanup);

describe("ProofProfile", () => {
  it("shows an empty evidence state without inventing progress", () => {
    render(<ProofProfile proofs={[]} skills={flagshipRole.skills} />);

    expect(screen.getByLabelText("0% role readiness")).toBeInTheDocument();
    expect(screen.getByLabelText("0% local learning coverage")).toBeInTheDocument();
    expect(screen.getByText(/first local completion evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/device-local completion events only/i)).toBeInTheDocument();
    expect(screen.getByText(/Git, URL, and file verification/i)).toBeInTheDocument();
  });

  it("labels a Today completion as locally verified evidence, not a Git commit", () => {
    const completion: ProofItem = {
      id: "local-completion",
      title: "Implementation note",
      kind: "completion",
      skillIds: ["react"],
      verified: true,
    };

    render(<ProofProfile proofs={[completion]} skills={flagshipRole.skills} />);

    expect(screen.getByLabelText("0% role readiness")).toBeInTheDocument();
    expect(screen.getByLabelText("6% local learning coverage")).toBeInTheDocument();
    expect(screen.getByText("Completion evidence · 1 linked skill")).toBeInTheDocument();
    expect(screen.getByText("Verified locally")).toBeInTheDocument();
    expect(screen.queryByText(/commit ·/i)).not.toBeInTheDocument();
  });

  it("lists verified and draft evidence with linked skill counts", () => {
    const proofs: ProofItem[] = [
      {
        id: "verified",
        title: "Typed server action",
        kind: "commit",
        skillIds: ["react", "react", "unknown"],
        verified: true,
      },
      {
        id: "draft",
        title: "Architecture note",
        kind: "note",
        skillIds: ["http-apis"],
        verified: false,
      },
    ];

    render(<ProofProfile proofs={proofs} skills={flagshipRole.skills} />);

    expect(screen.getByLabelText("6% role readiness")).toBeInTheDocument();
    expect(screen.getByLabelText("0% local learning coverage")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("commit · 1 linked skill")).toBeInTheDocument();
    expect(within(items[0]).getByText("Verified")).toBeInTheDocument();
    expect(within(items[1]).getByText("note · 1 linked skill")).toBeInTheDocument();
    expect(within(items[1]).getByText("Draft")).toBeInTheDocument();
  });

  it("labels public sharing as unavailable instead of exposing a fake action", () => {
    render(<ProofProfile proofs={[]} skills={flagshipRole.skills} />);

    expect(screen.getByRole("button", { name: /Share public profile.*Coming soon/i })).toBeDisabled();
  });
});
