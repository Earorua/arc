import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

const authMocks = vi.hoisted(() => ({ useSession: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: authMocks }));

vi.mock("../../app/components/account/account-menu", () => ({
  AccountMenu: () => <a href="/sign-in">Sign in</a>,
}));

import { SiteHeader } from "../../app/components/brand/site-header";

beforeEach(() => { navigation.pathname = "/"; authMocks.useSession.mockReturnValue({ data: null, isPending: false }); });
afterEach(cleanup);

describe("SiteHeader", () => {
  it("keeps public navigation visible and hides the workspace navigation when signed out", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("banner")).not.toHaveAttribute("lang", "en");
    expect(screen.getByRole("link", { name: "Arc. home" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "网站导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "学习方法" })).toHaveAttribute("href", "/method");
    expect(screen.queryByRole("link", { name: "Intelligence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "学习规划师" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "产品样例" })).toHaveAttribute("href", "/showcase");
    expect(screen.queryByRole("link", { name: "学习工作区" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("marks the current public page and exposes the mobile menu state", async () => {
    navigation.pathname = "/method";
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "学习方法" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "产品样例" })).not.toHaveAttribute("aria-current");
    await userEvent.click(screen.getByRole("button", { name: "浏览" }));
    expect(screen.getByRole("button", { name: "浏览" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "网站导航" })).toHaveAttribute("data-open", "true");
  });

  it("hides the workspace navigation while the session is still being confirmed", () => {
    authMocks.useSession.mockReturnValue({ data: { user: { id: "learner" } }, isPending: true });
    render(<SiteHeader />);
    expect(screen.queryByRole("link", { name: "学习工作区" })).not.toBeInTheDocument();
  });

  it.each(["/method", "/showcase"])("keeps workspace navigation on %s after sign-in and removes it when the session ends", (pathname) => {
    navigation.pathname = pathname;
    const { rerender } = render(<SiteHeader />);
    authMocks.useSession.mockReturnValue({ data: { user: { id: "learner" } }, isPending: false });
    rerender(<SiteHeader />);
    expect(screen.getByRole("link", { name: "学习工作区" })).toHaveAttribute("href", "/today");
    authMocks.useSession.mockReturnValue({ data: null, isPending: false });
    rerender(<SiteHeader />);
    expect(screen.queryByRole("link", { name: "学习工作区" })).not.toBeInTheDocument();
  });

  it("keeps hydration stable when the session resolves before the header mounts", async () => {
    navigation.pathname = "/method";
    const container = document.createElement("div");
    container.innerHTML = renderToString(<SiteHeader />);
    expect(container.querySelector('a[href="/today"]')).toBeNull();
    document.body.appendChild(container);
    authMocks.useSession.mockReturnValue({ data: { user: { id: "learner" } }, isPending: false });
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, <SiteHeader />, { onRecoverableError }); });
    expect(screen.getByRole("link", { name: "学习工作区" })).toHaveAttribute("href", "/today");
    expect(onRecoverableError).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
});
