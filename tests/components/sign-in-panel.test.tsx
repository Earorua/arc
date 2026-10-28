import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInPanel } from "../../app/components/account/sign-in-panel";

afterEach(cleanup);

describe("SignInPanel", () => {
  it("shows an error when the auth client resolves a failed request", async () => {
    const user = userEvent.setup();
    render(<SignInPanel providers={["google"]} pending={false} signIn={vi.fn().mockResolvedValue({ error: { code: "INVALID_ORIGIN" } })} />);
    await user.click(screen.getByRole("button", { name: "使用 Google 继续" }));
    expect(screen.getByRole("alert")).toHaveTextContent("暂时无法开始登录");
    expect(screen.getByRole("button", { name: "使用 Google 继续" })).toBeEnabled();
  });
  it("starts a configured provider flow with same-origin return paths", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue(undefined);
    render(<SignInPanel providers={["google", "github"]} pending={false} signIn={signIn} destination="/setup?mode=edit&section=time" />);

    await user.click(screen.getByRole("button", { name: "使用 Google 继续" }));

    expect(signIn).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/setup?mode=edit&section=time",
      errorCallbackURL: "/sign-in?next=%2Fsetup%3Fmode%3Dedit%26section%3Dtime&error=oauth",
    });
    expect(screen.getByRole("button", { name: "使用 GitHub 继续" })).toBeEnabled();
    expect(screen.queryByText(/ChatGPT/i)).not.toBeInTheDocument();
  });

  it("shows an honest preparation state when no provider is configured", () => {
    render(<SignInPanel providers={[]} pending={false} signIn={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("账号登录暂未开放");
    expect(screen.getByRole("link", { name: "先看公开样例" })).toHaveAttribute("href", "/showcase");
  });

  it("keeps provider actions unavailable while configuration is loading", () => {
    render(<SignInPanel providers={[]} pending signIn={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("正在确认登录方式");
  });

  it("returns a source-free login to the account-aware destination resolver", async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    render(<SignInPanel providers={["github"]} pending={false} signIn={signIn} />);
    await userEvent.click(screen.getByRole("button", { name: "使用 GitHub 继续" }));
    expect(signIn).toHaveBeenCalledWith({ provider: "github", callbackURL: "/sign-in?complete=1", errorCallbackURL: "/sign-in?error=oauth" });
  });
});
