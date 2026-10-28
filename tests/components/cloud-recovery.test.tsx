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
    expect(screen.getByRole("alert")).toHaveTextContent("登录已过期");
    expect(screen.getByRole("link", { name: "重新登录" })).toHaveAttribute("href", "/sign-in?next=%2Fsetup%3Fmode%3Dcreate&reauth=1");
  });

  it("marks a failed import as an alert with one retry action", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<CloudStatus kind="import-failed" onAction={onAction} />);

    await user.click(screen.getByRole("button", { name: "重试导入" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("presents offline cloud state as non-blocking and retryable", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn().mockResolvedValue(undefined);
    render(<CloudStatus kind="offline" onAction={onAction} />);

    expect(screen.getByRole("status")).toHaveTextContent("保留在本设备");
    await user.click(screen.getByRole("button", { name: "重新同步" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["quota" as const, "额度已用完", "查看公开样例"],
    ["ai-disabled" as const, "暂未开放", "查看公开样例"],
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
