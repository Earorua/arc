import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceHeader } from "../../app/components/workspace/workspace-header";
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <button>账号</button> }));
afterEach(cleanup);
it.each(["Today", "Path", "Stack", "Proof", "History", "Coach"] as const)("keeps the same four primary destinations on %s", current => {
  render(<WorkspaceHeader current={current} context="数据产品经理 · 18 周" />);
  const nav = within(screen.getByRole("navigation", { name: "学习工作区" }));
  expect(nav.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/today", "/path", "/stack", "/proof"]);
  expect(screen.getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page")).toHaveLength(current === "History" || current === "Coach" ? 0 : 1);
  expect(screen.getByText("数据产品经理 · 18 周")).toBeInTheDocument();
});

it("keeps route maintenance on the route page", () => {
  render(<WorkspaceHeader current="Path" context="数据产品经理 · 18 周" />);
  const tools = screen.getByText("计划管理").closest("details")!;
  tools.open = true;
  const menu = within(tools);
  expect(menu.getByRole("link", { name: "历史计划" })).toHaveAttribute("href", "/history");
  expect(menu.getByRole("link", { name: "编辑时间" })).toHaveAttribute("href", "/setup?mode=edit&section=time");
  expect(menu.getByRole("link", { name: "新建路线" })).toHaveAttribute("href", "/setup?mode=create");
  expect(screen.getByRole("navigation", { name: "学习工作区" })).toHaveClass("workspace-bottom-nav");
});
