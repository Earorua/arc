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
  render(<AccountBoundary destination="/proof" title="Sign in to save your work"><p>private records</p></AccountBoundary>);
  const login = screen.getByRole("link", { name: "Sign in and continue" });
  expect(new URL(login.getAttribute("href")!, "https://arc.example").searchParams.get("next"))
    .toBe("/proof?compose=1&returnTo=%2Ftoday#draft");
  expect(screen.getByRole("link", { name: "Explore the showcase" })).toHaveAttribute("href", "/showcase");
  expect(screen.getByText(/Your learning records stay on this device/)).toBeInTheDocument();
  expect(screen.queryByText("private records")).not.toBeInTheDocument();
  expect(localStorage.getItem("arc-device-history")).toBe("kept");
});

it("does not mount protected content while the session is pending", () => {
  mocks.useSession.mockReturnValue({ data: null, isPending: true });
  render(<AccountBoundary destination="/today"><p>private records</p></AccountBoundary>);
  expect(screen.getByRole("status")).toHaveTextContent("Checking your account");
  expect(screen.queryByText("private records")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Sign in and continue" })).not.toBeInTheDocument();
});

it("mounts the current account content and removes it when that session ends", () => {
  mocks.useSession.mockReturnValue({ data: { user: { id: "owner" } }, isPending: false });
  const { rerender } = render(<AccountBoundary destination="/today"><p>private records</p></AccountBoundary>);
  expect(screen.getByText("private records")).toBeInTheDocument();
  mocks.useSession.mockReturnValue({ data: null, isPending: false });
  rerender(<AccountBoundary destination="/today"><p>private records</p></AccountBoundary>);
  expect(screen.queryByText("private records")).not.toBeInTheDocument();
});
