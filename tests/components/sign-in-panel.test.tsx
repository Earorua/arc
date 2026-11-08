import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInPanel } from "../../app/components/account/sign-in-panel";

afterEach(cleanup);

describe("SignInPanel", () => {
  it("shows an error when the auth client resolves a failed request", async () => {
    const user = userEvent.setup();
    render(<SignInPanel providers={["google"]} pending={false} signIn={vi.fn().mockResolvedValue({ error: { code: "INVALID_ORIGIN" } })} />);
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't start sign-in");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });
  it("starts a configured provider flow with same-origin return paths", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue(undefined);
    render(<SignInPanel providers={["google", "github"]} pending={false} signIn={signIn} destination="/setup?mode=edit&section=time" />);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(signIn).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/setup?mode=edit&section=time",
      errorCallbackURL: "/sign-in?next=%2Fsetup%3Fmode%3Dedit%26section%3Dtime&error=oauth",
    });
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeEnabled();
    expect(screen.queryByText(/ChatGPT/i)).not.toBeInTheDocument();
  });

  it("shows an honest preparation state when no provider is configured", () => {
    render(<SignInPanel providers={[]} pending={false} signIn={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Account sign-in is not available yet");
    expect(screen.getByRole("link", { name: "Explore the showcase" })).toHaveAttribute("href", "/showcase");
  });

  it("keeps provider actions unavailable while configuration is loading", () => {
    render(<SignInPanel providers={[]} pending signIn={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Checking sign-in methods");
  });

  it("returns a source-free login to the account-aware destination resolver", async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    render(<SignInPanel providers={["github"]} pending={false} signIn={signIn} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(signIn).toHaveBeenCalledWith({ provider: "github", callbackURL: "/sign-in?complete=1", errorCallbackURL: "/sign-in?error=oauth" });
  });
});
