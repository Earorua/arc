import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { SiteHeader } from "../../app/components/brand/site-header";
import { WorkspaceShell } from "../../app/components/workspace/workspace-shell";
import { createDemoState } from "../../app/lib/demo-store";

afterEach(cleanup);

describe("navigation accessibility contracts", () => {
  it("names public and workspace navigation independently", () => {
    render(
      <>
        <SiteHeader />
        <WorkspaceShell current="Today" state={createDemoState()}><p>content</p></WorkspaceShell>
      </>,
    );

    expect(screen.getByRole("navigation", { name: "Public navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Learning workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps one compact public navigation with every destination available", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const publicNavigation = screen.getByRole("navigation", { name: "Public navigation" });
    expect(screen.getAllByRole("navigation", { name: "Public navigation" })).toHaveLength(1);
    const menuButton = screen.getByRole("button", { name: "Explore" });
    expect(menuButton).toHaveAttribute("aria-controls", "public-navigation");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(publicNavigation).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Method" })).toHaveAttribute("href", "/method");
    expect(screen.getByRole("link", { name: "Intelligence" })).toHaveAttribute("href", "/intelligence");
  });

  it("removes the mobile workspace wordmark from focus and layout", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const mobileRules = css.slice(css.indexOf("@media (max-width: 760px)"), css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(mobileRules).toMatch(/\.workspace-header\s*>\s*\.wordmark\s*\{[^}]*display:\s*none\s*;/);
  });
});
