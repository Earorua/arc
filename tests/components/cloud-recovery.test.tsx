import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudStatus } from "../../app/components/sync/cloud-status";

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("CloudStatus", () => {
  it("offers sign-in recovery when the Arc session expires", () => {
    window.history.replaceState(null, "", "/setup?mode=create");
    render(<CloudStatus kind="session-expired" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your session has expired");
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in?next=%2Fsetup%3Fmode%3Dcreate&reauth=1");
  });

  it("marks a failed import as an alert with one retry action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<CloudStatus kind="import-failed" onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "Retry import" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("presents offline cloud state as non-blocking and retryable", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<CloudStatus kind="offline" onAction={onAction} />);

    expect(screen.getByRole("status")).toHaveTextContent("stay on this device");
    await user.click(screen.getByRole("button", { name: "Retry sync" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["quota" as const, "used this period's AI allowance", "Explore the showcase"],
    ["ai-disabled" as const, "not available yet", "Explore the showcase"],
  ])("offers the deterministic sample for %s", (kind, message, action) => {
    render(<CloudStatus kind={kind} />);
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.getByRole("link", { name: action })).toHaveAttribute("href", "/showcase");
  });

  it("keeps visible keyboard focus and reduced-motion safety for recovery controls", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/\.cloud-status/);
  });
});
