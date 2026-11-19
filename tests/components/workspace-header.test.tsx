import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceHeader } from "../../app/components/workspace/workspace-header";
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <button>Account</button> }));
afterEach(cleanup);
it("keeps the vector brand linked home beside the workspace navigation", () => {
  render(<WorkspaceHeader current="Today" />);
  const home = screen.getByRole("link", { name: /Arc\. home/i });
  expect(home).toHaveAttribute("href", "/");
  expect(home.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
});

it.each(["Today", "Path", "Stack", "Proof", "History", "Coach"] as const)("keeps the same four primary destinations on %s", current => {
  render(<WorkspaceHeader current={current} context="数据产品经理 · 18 周" />);
  const nav = within(screen.getByRole("navigation", { name: "Learning workspace" }));
  expect(nav.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/today", "/path", "/stack", "/proof"]);
  expect(screen.getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page")).toHaveLength(current === "History" || current === "Coach" ? 0 : 1);
  expect(screen.getByText("数据产品经理 · 18 周")).toBeInTheDocument();
});

it("keeps route maintenance on the route page", () => {
  render(<WorkspaceHeader current="Path" context="数据产品经理 · 18 周" />);
  const tools = screen.getByText("Manage plan").closest("details")!;
  tools.open = true;
  const menu = within(tools);
  expect(menu.getByRole("link", { name: "Plan history" })).toHaveAttribute("href", "/history");
  expect(menu.getByRole("link", { name: "Edit availability" })).toHaveAttribute("href", "/setup?mode=edit&section=time");
  expect(menu.getByRole("link", { name: "New path" })).toHaveAttribute("href", "/setup?mode=create");
  expect(screen.getByRole("navigation", { name: "Learning workspace" })).toHaveClass("workspace-bottom-nav");
});
