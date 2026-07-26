import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PathPage from "../../app/path/page";

describe("PathPage", () => {
  it("shows the complete 18-week route in four editorial phases", () => {
    render(<PathPage />);
    const heading = screen.getByRole("heading", { name: "Your precise path." });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("lang", "en");
    expect(screen.getByText("18 weeks · 7 hours / week")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("navigation", { name: "Learning workspace" })).toBeInTheDocument();
  });
});
