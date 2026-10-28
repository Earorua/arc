import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountBoundary } from "../../app/components/account/account-boundary";

const mocks = vi.hoisted(() => ({ useSession: vi.fn(), pathname: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: mocks.useSession } }));
vi.mock("next/navigation", () => ({ usePathname: mocks.pathname }));

beforeEach(() => {
  mocks.useSession.mockReturnValue({ data: null, isPending: false });
  mocks.pathname.mockReturnValue("/proof");
  window.history.replaceState(null, "", "/proof?compose=1&returnTo=%2Ftoday#draft");
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); localStorage.clear(); });

it("explains account access while preserving the source and device history", () => {
  localStorage.setItem("arc-device-history", "kept");
  render(<AccountBoundary destination="/proof" title="登录后保存作品证据"><p>private records</p></AccountBoundary>);
  const login = screen.getByRole("link", { name: "登录并继续" });
  expect(new URL(login.getAttribute("href")!, "https://arc.example").searchParams.get("next"))
    .toBe("/proof?compose=1&returnTo=%2Ftoday#draft");
  expect(screen.getByRole("link", { name: "先看公开样例" })).toHaveAttribute("href", "/showcase");
  expect(screen.getByText(/本设备已有的学习记录会保留/)).toBeInTheDocument();
  expect(screen.queryByText("private records")).not.toBeInTheDocument();
  expect(localStorage.getItem("arc-device-history")).toBe("kept");
});

it("does not mount protected content while the session is pending", () => {
  mocks.useSession.mockReturnValue({ data: null, isPending: true });
  render(<AccountBoundary destination="/today"><p>private records</p></AccountBoundary>);
  expect(screen.getByRole("status")).toHaveTextContent("正在确认账号");
  expect(screen.queryByText("private records")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "登录并继续" })).not.toBeInTheDocument();
});

it("mounts the current account content and removes it when that session ends", () => {
  mocks.useSession.mockReturnValue({ data: { user: { id: "owner" } }, isPending: false });
  const { rerender } = render(<AccountBoundary destination="/today"><p>private records</p></AccountBoundary>);
  expect(screen.getByText("private records")).toBeInTheDocument();
  mocks.useSession.mockReturnValue({ data: null, isPending: false });
  rerender(<AccountBoundary destination="/today"><p>private records</p></AccountBoundary>);
  expect(screen.queryByText("private records")).not.toBeInTheDocument();
});
