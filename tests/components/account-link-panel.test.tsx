import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountLinkPanel } from "../../app/components/account/account-link-panel";

afterEach(cleanup);

describe("AccountLinkPanel", () => {
  it("requires source-provider verification through a target-bound POST form", () => {
    const { container } = render(
      <AccountLinkPanel
        expiresAt={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        sourceProvider="github"
        stage="pending_reauth"
        targetProvider="google"
      />,
    );

    expect(screen.getByText(
      "You're signed in with GitHub. Verify GitHub before linking Google.",
    )).toBeInTheDocument();
    const verify = screen.getByRole("button", { name: "Verify GitHub" });
    expect(verify.closest("form")).toHaveAttribute("action", "/api/account-link/start");
    expect(verify.closest("form")).toHaveAttribute("method", "post");
    expect(screen.getByDisplayValue("google")).toMatchObject({
      name: "targetProvider",
      type: "hidden",
    });
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
  });

  it("continues a verified grant only through an explicit POST", () => {
    const { container } = render(
      <AccountLinkPanel
        expiresAt="2026-08-02T08:05:00.000Z"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        sourceProvider="github"
        stage="verified"
        targetProvider="google"
      />,
    );

    expect(screen.getByText("Identity verified")).toBeInTheDocument();
    expect(screen.getByText("Continue within five minutes to connect Google.")).toBeInTheDocument();
    const continuation = screen.getByRole("button", { name: "Continue to Google" });
    expect(continuation.closest("form")).toHaveAttribute("action", "/api/account-link/continue");
    expect(continuation.closest("form")).toHaveAttribute("method", "post");
    expect(container.querySelector('input[name="targetProvider"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
  });

  it("disables duplicate actions once its form is submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    render(
      <AccountLinkPanel
        expiresAt={null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        sourceProvider="github"
        stage="pending_reauth"
        targetProvider="google"
      />,
    );

    const verify = screen.getByRole("button", { name: "Verify GitHub" });
    await user.click(verify);
    await user.click(verify);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(verify).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
