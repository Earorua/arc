import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceHeader } from "../../app/components/workspace/workspace-header";
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <button>账号</button> }));
afterEach(cleanup);
it.each(["Today", "Path", "Stack", "Proof", "History", "Coach"] as const)("keeps the same four primary destinations on %s", current => {
  render(<WorkspaceHeader current={current} context="数据产品经理 · 18 周" />);
  const nav = within(screen.getByRole("navigation", { name: "学习工作区" }));
  expect(nav.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/today", "/path", "/stack", "/proof"]);
  expect(screen.getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page")).toHaveLength(1);
  expect(screen.getByText("数据产品经理 · 18 周")).toBeInTheDocument();
});
