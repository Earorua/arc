import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudStatus } from "../../app/components/sync/cloud-status";

afterEach(cleanup);

describe("CloudStatus", () => {
  it("offers sign-in recovery when the Arc session expires", () => {
    render(<CloudStatus kind="session-expired" />);
    expect(screen.getByRole("alert")).toHaveTextContent("session expired");
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/sign-in");
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

    expect(screen.getByRole("status")).toHaveTextContent("queued on this device");
    await user.click(screen.getByRole("button", { name: "Retry sync" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["quota" as const, "allowance", "Continue with sample"],
    ["ai-disabled" as const, "not enabled", "Continue with sample"],
  ])("offers the deterministic sample for %s", (kind, message, action) => {
    render(<CloudStatus kind={kind} />);
    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(screen.getByRole("link", { name: action })).toHaveAttribute("href", "/today");
  });

  it("keeps visible keyboard focus and reduced-motion safety for recovery controls", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/\.cloud-status/);
  });
});
