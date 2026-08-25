import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IntelligencePage, { selectSourceSpecimen } from "../../app/intelligence/page";
import MethodPage from "../../app/method/page";
import { flagshipRole } from "../../app/data/flagship-role";

describe("public trust pages", () => {
  it("explains the deterministic learning loop", () => {
    render(<MethodPage />);
    const heading = screen.getByRole("heading", { name: /A path is a decision system/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("lang", "en");
    expect(screen.getByText(/Understand → Build → Prove/i)).toBeInTheDocument();
  });

  it("explains attributable sources and freshness without unsupported confidence", () => {
    render(<IntelligencePage />);
    const heading = screen.getByRole("heading", { name: /Trust is part of the interface/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("lang", "en");
    expect(screen.getByText("每条技能结论都显示来源和观察时间。可归属的证据与推断保持明确分离。")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Observed at")).toBeInTheDocument();
    expect(screen.queryByText("Confidence")).not.toBeInTheDocument();
    expect(screen.queryByText("96%")).not.toBeInTheDocument();
    expect(screen.getByText("Web Platform")).toBeInTheDocument();
    expect(screen.getByText("Web Platform official documentation")).toBeInTheDocument();
    expect(screen.getByText("2026-07-26")).toBeInTheDocument();
  });

  it("returns no specimen when stable source data is unavailable", () => {
    expect(selectSourceSpecimen({ ...flagshipRole, skills: [] })).toBeNull();
  });
});
