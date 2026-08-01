import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  listAccounts: vi.fn(),
  linkSocial: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: authMocks,
}));

import { AccountMenu } from "../../app/components/account/account-menu";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("AccountMenu", () => {
  beforeEach(() => {
    authMocks.listAccounts.mockReset();
    authMocks.linkSocial.mockReset();
    authMocks.signOut.mockReset();
    authMocks.listAccounts.mockResolvedValue({
      data: [{ providerId: "github" }],
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      providers: ["google", "github"],
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    })));
  });

  it("keeps sign-in secondary for an anonymous visitor", () => {
    authMocks.useSession.mockReturnValue({ data: null, isPending: false });

    render(<AccountMenu />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("does not compete with the workspace live status while the session loads", () => {
    authMocks.useSession.mockReturnValue({ data: null, isPending: true });

    render(<AccountMenu />);

    expect(screen.getByLabelText("Checking account")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the Arc user and signs out without exposing session internals", async () => {
    const user = userEvent.setup();
    authMocks.useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Arc Learner", email: "learner@example.com" } },
      isPending: false,
    });
    authMocks.signOut.mockResolvedValue(undefined);

    render(<AccountMenu />);
    await user.click(screen.getByText("Arc Learner"));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByText("learner@example.com")).toBeInTheDocument();
    expect(authMocks.signOut).toHaveBeenCalledOnce();
    expect(screen.queryByText(/token|ChatGPT/i)).not.toBeInTheDocument();
  });

  it("offers only an unconnected provider through the authenticated linking flow", async () => {
    const user = userEvent.setup();
    authMocks.useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Arc Learner", email: "learner@example.com" } },
      isPending: false,
    });
    authMocks.linkSocial.mockResolvedValue({ data: { redirect: true }, error: null });

    render(<AccountMenu />);
    await user.click(screen.getByText("Arc Learner"));

    expect(await screen.findByText("GitHub connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link GitHub" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Link Google" }));

    expect(authMocks.linkSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/today?link=complete",
      errorCallbackURL: "/today?link=error",
    });
  });

  it("keeps both accounts unchanged and presents a safe link-conflict recovery state", async () => {
    window.history.replaceState(
      null,
      "",
      "/today?link=error&error=account_already_linked_to_different_user",
    );
    authMocks.useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Arc Learner", email: "learner@example.com" } },
      isPending: false,
    });

    render(<AccountMenu />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That sign-in is already connected to another Arc. account. Nothing was changed.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("learner@example.com");
  });

  it("confirms a completed connection without exposing callback details", async () => {
    window.history.replaceState(null, "", "/today?link=complete");
    authMocks.useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Arc Learner", email: "learner@example.com" } },
      isPending: false,
    });

    render(<AccountMenu />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Sign-in connection updated.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(/callback|state|token/i);
  });

  it("settles into a safe unavailable state when linked accounts cannot be read", async () => {
    const user = userEvent.setup();
    authMocks.useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Arc Learner", email: "learner@example.com" } },
      isPending: false,
    });
    authMocks.listAccounts.mockResolvedValue({
      data: null,
      error: { message: "private auth failure" },
    });

    render(<AccountMenu />);
    await user.click(screen.getByText("Arc Learner"));

    expect(await screen.findByText("Connections are temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/private auth failure/i)).not.toBeInTheDocument();
  });

  it("shows a retryable failure without exposing authentication internals", async () => {
    const user = userEvent.setup();
    authMocks.useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Arc Learner", email: "learner@example.com" } },
      isPending: false,
    });
    authMocks.linkSocial.mockRejectedValue(new Error("secret provider failure"));

    render(<AccountMenu />);
    await user.click(screen.getByText("Arc Learner"));
    await user.click(await screen.findByRole("button", { name: "Link Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection could not start. Try again.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/secret|provider failure/i);
    expect(screen.getByRole("button", { name: "Link Google" })).toBeEnabled();
  });
});
