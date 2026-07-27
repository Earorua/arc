import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInPanel } from "../../app/components/account/sign-in-panel";

afterEach(cleanup);

describe("SignInPanel", () => {
  it("starts a configured provider flow with same-origin return paths", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue(undefined);
    render(<SignInPanel providers={["google", "github"]} pending={false} signIn={signIn} />);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(signIn).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/today",
      errorCallbackURL: "/sign-in?error=oauth",
    });
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeEnabled();
    expect(screen.queryByText(/ChatGPT/i)).not.toBeInTheDocument();
  });

  it("shows an honest preparation state when no provider is configured", () => {
    render(<SignInPanel providers={[]} pending={false} signIn={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Account access is being prepared");
    expect(screen.getByRole("link", { name: "Explore the complete sample" })).toHaveAttribute("href", "/today");
  });

  it("keeps provider actions unavailable while configuration is loading", () => {
    render(<SignInPanel providers={[]} pending signIn={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Checking account availability");
  });
});
