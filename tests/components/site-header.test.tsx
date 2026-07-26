import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "../../app/components/brand/site-header";

describe("SiteHeader", () => {
  it("keeps the brand, public context, and one primary action visible", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Arc. home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Method" })).toHaveAttribute("href", "/method");
    expect(screen.getByRole("link", { name: "Intelligence" })).toHaveAttribute("href", "/intelligence");
    expect(screen.getByRole("link", { name: "Build my path" })).toHaveAttribute("href", "/setup");
  });
});
