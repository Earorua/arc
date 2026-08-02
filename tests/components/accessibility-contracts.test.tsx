import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  listAccounts: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: authMocks,
}));

import { AccountMenu } from "../../app/components/account/account-menu";
import { SiteHeader } from "../../app/components/brand/site-header";
import { WorkspaceShell } from "../../app/components/workspace/workspace-shell";
import { createDemoState } from "../../app/lib/demo-store";

function mockAccountMenu(status: unknown = {
  stage: null,
  targetProvider: null,
  expiresAt: null,
}) {
  authMocks.useSession.mockReturnValue({
    data: { user: { id: "user-1", name: "Arc Learner", email: "learner@example.com" } },
    isPending: false,
  });
  authMocks.listAccounts.mockResolvedValue({
    data: [{ providerId: "github" }],
    error: null,
  });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/auth/providers") {
      return Response.json({ providers: ["google", "github"] });
    }
    if (String(input) === "/api/account-link/status") {
      return Response.json(status);
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  }));
}

beforeEach(() => {
  authMocks.useSession.mockReset().mockReturnValue({ data: null, isPending: false });
  authMocks.listAccounts.mockReset();
  authMocks.signOut.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

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

  it("moves focus into account linking and restores the exact Link trigger on cancel", async () => {
    const user = userEvent.setup();
    mockAccountMenu();
    render(<AccountMenu />);

    await user.click(screen.getByText("Arc Learner"));
    const linkTrigger = await screen.findByRole("button", { name: "Link Google" });
    linkTrigger.focus();
    await user.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog", { name: "Connect Google" });
    const heading = within(dialog).getByRole("heading", { name: "Connect Google" });
    await waitFor(() => expect(heading).toHaveFocus());

    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    cancel.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(linkTrigger).toHaveFocus();
  });

  it("announces verified results as status, omits callback email, and restores focus on dismiss", async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      "/today?link=verified&provider_email=callback-provider%40example.com",
    );
    mockAccountMenu({
      stage: "verified",
      targetProvider: "google",
      expiresAt: "2026-08-02T08:05:00.000Z",
    });
    render(<AccountMenu />);

    const message = await screen.findByText("Identity verified. Continue within five minutes.");
    expect(message).toHaveAttribute("role", "status");
    expect(screen.queryByText("callback-provider@example.com")).not.toBeInTheDocument();

    const linkTrigger = screen.getByRole("button", { name: "Link Google" });
    const notice = message.closest(".account-link-notice");
    const dismiss = within(notice as HTMLElement).getByRole("button", {
      name: "Dismiss account message",
    });
    dismiss.focus();
    await user.keyboard(" ");

    await waitFor(() => expect(message).not.toBeInTheDocument());
    expect(linkTrigger).toHaveFocus();
  });

  it.each([
    ["error", "failed", "We couldn't connect this sign-in method. Nothing changed."],
    ["expired", "expired", "Verification expired. Start again."],
    ["cancelled", "failed", "Connection cancelled. Nothing changed."],
    ["conflict", "failed", "This sign-in method can't be connected to this account."],
  ] as const)(
    "announces %s as an alert and restores its authoritative Link trigger on dismiss",
    async (result, stage, expectedMessage) => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      "",
      `/today?link=${result}&email=private-provider%40example.com`,
    );
    mockAccountMenu({
      stage,
      targetProvider: "google",
      expiresAt: null,
    });
    render(<AccountMenu />);

    const message = await screen.findByText(expectedMessage);
    expect(message).toHaveAttribute("role", "alert");
    expect(screen.queryByText("private-provider@example.com")).not.toBeInTheDocument();

    const linkTrigger = screen.getByRole("button", { name: "Link Google" });
    const notice = message.closest(".account-link-notice");
    const dismiss = within(notice as HTMLElement).getByRole("button", {
      name: "Dismiss account message",
    });
    dismiss.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(message).not.toBeInTheDocument());
    expect(linkTrigger).toHaveFocus();
    expect(linkTrigger.closest("details")).toHaveAttribute("open");
  });

  it("returns completed-notice focus to the account summary when no Link trigger remains", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/today?link=complete");
    mockAccountMenu({
      stage: "completed",
      targetProvider: "google",
      expiresAt: "2026-08-02T08:05:00.000Z",
    });
    authMocks.listAccounts
      .mockResolvedValueOnce({ data: [{ providerId: "github" }], error: null })
      .mockResolvedValue({
        data: [{ providerId: "github" }, { providerId: "google" }],
        error: null,
      });
    render(<AccountMenu />);

    const message = await screen.findByText(
      "Google connected. You can now sign in with either provider.",
    );
    await waitFor(() => expect(authMocks.listAccounts).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Link Google" })).not.toBeInTheDocument();

    const summary = screen.getByText("Arc Learner");
    const notice = message.closest(".account-link-notice");
    const dismiss = within(notice as HTMLElement).getByRole("button", {
      name: "Dismiss account message",
    });
    dismiss.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(message).not.toBeInTheDocument());
    expect(summary).toHaveFocus();
  });

  it("removes account-link motion when reduced motion is requested", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const reducedMotionRules = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(reducedMotionRules).toMatch(
      /\.account-popover\s*,\s*\.account-link-notice\s*,\s*\.account-link-panel\s*\{[^}]*animation:\s*none\s*!important\s*;[^}]*transition:\s*none\s*!important\s*;/u,
    );
  });

  it("keeps mobile account-link actions tappable and its popover inside the viewport", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const mobileRules = css.slice(
      css.indexOf("@media (max-width: 760px)"),
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
    );

    expect(mobileRules).toMatch(
      /\.account-link-actions\s+button\s*\{[^}]*min-height:\s*44px\s*;/u,
    );
    expect(mobileRules).toMatch(
      /\.account-popover\s*\{[^}]*max-width:\s*calc\(100vw\s*-\s*32px\)\s*;[^}]*box-sizing:\s*border-box\s*;/u,
    );
  });
});
