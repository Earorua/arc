import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

const availableProviders = ["google", "github"];
const noLinkStatus = {
  stage: null,
  targetProvider: null,
  expiresAt: null,
};

function signedInSession() {
  authMocks.useSession.mockReturnValue({
    data: { user: { id: "user-1", name: "Arc Learner", email: "learner@example.com" } },
    isPending: false,
  });
}

function mockAccountFetch(status: unknown = noLinkStatus) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init;
    const url = String(input);
    if (url === "/api/auth/providers") {
      return Response.json({ providers: availableProviders });
    }
    if (url === "/api/account-link/status") {
      return Response.json(status);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    mockAccountFetch();
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
    signedInSession();
    authMocks.signOut.mockResolvedValue(undefined);

    render(<AccountMenu />);
    await user.click(screen.getByText("Arc Learner"));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByText("learner@example.com")).toBeInTheDocument();
    expect(authMocks.signOut).toHaveBeenCalledOnce();
    expect(screen.queryByText(/token|ChatGPT/i)).not.toBeInTheDocument();
  });

  it("opens a source-verification panel instead of linking the target directly", async () => {
    const user = userEvent.setup();
    signedInSession();

    render(<AccountMenu />);
    await user.click(screen.getByText("Arc Learner"));

    expect(await screen.findByText("GitHub connected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link GitHub" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Link Google" }));

    expect(screen.getByText(
      "You're signed in with GitHub. Verify GitHub before linking Google.",
    )).toBeInTheDocument();
    const verify = screen.getByRole("button", { name: "Verify GitHub" });
    const form = verify.closest("form");
    expect(form).toHaveAttribute("action", "/api/account-link/start");
    expect(form).toHaveAttribute("method", "post");
    expect(within(form!).getByDisplayValue("google")).toHaveAttribute("name", "targetProvider");
    expect(authMocks.linkSocial).not.toHaveBeenCalled();
  });

  it("renders a verified continuation from safe status without starting target OAuth", async () => {
    const fetchMock = mockAccountFetch({
      stage: "verified",
      targetProvider: "google",
      expiresAt: "2026-08-02T08:05:00.000Z",
    });
    signedInSession();

    render(<AccountMenu />);

    expect(await screen.findByText("Identity verified")).toBeInTheDocument();
    const continuation = screen.getByRole("button", { name: "Continue to Google" });
    expect(continuation.closest("form")).toHaveAttribute("action", "/api/account-link/continue");
    expect(continuation.closest("form")).toHaveAttribute("method", "post");
    expect(authMocks.linkSocial).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account-link/status",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it.each([
    ["verified", "Identity verified. Continue within five minutes.", "verified"],
    ["expired", "Verification expired. Start again.", "expired"],
    ["cancelled", "Connection cancelled. Nothing changed.", "failed"],
    ["conflict", "This sign-in method can't be connected to this account.", "failed"],
    ["error", "We couldn't connect this sign-in method. Nothing changed.", "failed"],
  ] as const)("uses approved copy for a %s callback", async (result, message, stage) => {
    window.history.replaceState(null, "", `/today?link=${result}`);
    mockAccountFetch({
      stage,
      targetProvider: "google",
      expiresAt: "2026-08-02T08:05:00.000Z",
    });
    signedInSession();

    render(<AccountMenu />);

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("uses the safe target for completion, cleans callback data, and refreshes accounts", async () => {
    window.history.replaceState(
      null,
      "",
      "/today?link=complete&stage=target&error=private&error_description=secret&keep=1#proof",
    );
    const replaceState = vi.spyOn(window.history, "replaceState");
    mockAccountFetch({
      stage: "completed",
      targetProvider: "google",
      expiresAt: "2026-08-02T08:05:00.000Z",
    });
    authMocks.listAccounts
      .mockResolvedValueOnce({ data: [{ providerId: "github" }], error: null })
      .mockResolvedValueOnce({
        data: [{ providerId: "github" }, { providerId: "google" }],
        error: null,
      });
    signedInSession();

    render(<AccountMenu />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Google connected. You can now sign in with either provider.",
    );
    await waitFor(() => expect(authMocks.listAccounts).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByText("Arc Learner"));
    expect(await screen.findByText("Google connected")).toBeInTheDocument();
    expect(replaceState).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/today?stage=target&keep=1#proof",
    );
    expect(window.location.search).toBe("?stage=target&keep=1");
    expect(window.location.search).not.toMatch(/link|error|error_description/u);
  });

  it("settles into a safe unavailable state when linked accounts cannot be read", async () => {
    const user = userEvent.setup();
    signedInSession();
    authMocks.listAccounts.mockResolvedValue({
      data: null,
      error: { message: "private auth failure" },
    });

    render(<AccountMenu />);
    await user.click(screen.getByText("Arc Learner"));

    expect(await screen.findByText("Connections are temporarily unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/private auth failure/i)).not.toBeInTheDocument();
  });
});
