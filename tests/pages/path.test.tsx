import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PathPage from "../../app/path/page";

describe("PathPage", () => {
  it("shows the complete 18-week route in four editorial phases", () => {
    render(<PathPage />);
    const heading = screen.getByRole("heading", { name: "Your precise path." });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("lang", "en");
    expect(screen.getByText("18 weeks · 7 hours / week")).toBeInTheDocument();
    const phaseList = screen.getByRole("list", { name: "Learning phases" });
    const phaseItems = within(phaseList).getAllByRole("listitem");
    expect(phaseItems).toHaveLength(4);
    expect(phaseItems[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Product Foundations")).toBeInTheDocument();
    expect(screen.getByText("Production Proof")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Learning workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Path" })).toHaveAttribute("aria-current", "page");
  });
});
