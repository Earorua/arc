import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IntelligencePage from "../../app/intelligence/page";
import MethodPage from "../../app/method/page";

describe("public trust pages", () => {
  it("explains the deterministic learning loop", () => {
    render(<MethodPage />);
    const heading = screen.getByRole("heading", { name: /A path is a decision system/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("lang", "en");
    expect(screen.getByText(/Understand → Build → Prove/i)).toBeInTheDocument();
  });

  it("explains sources, freshness, and confidence", () => {
    render(<IntelligencePage />);
    const heading = screen.getByRole("heading", { name: /Trust is part of the interface/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("lang", "en");
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Observed at")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
  });
});
