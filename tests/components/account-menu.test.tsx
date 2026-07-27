import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: authMocks,
}));

import { AccountMenu } from "../../app/components/account/account-menu";

afterEach(cleanup);

describe("AccountMenu", () => {
  beforeEach(() => {
    authMocks.signOut.mockReset();
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
});
