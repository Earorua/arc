import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountLinkPanel } from "../../app/components/account/account-link-panel";

afterEach(cleanup);

describe("AccountLinkPanel", () => {
  it("opens as a named modal dialog and focuses its heading", async () => {
    render(
      <AccountLinkPanel
        expiresAt={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        returnFocusRef={createRef<HTMLButtonElement>()}
        sourceProvider="github"
        stage="pending_reauth"
        targetProvider="google"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Connect Google" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const heading = within(dialog).getByRole("heading", { name: "Connect Google" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it("requires source-provider verification through a target-bound POST form", () => {
    const { container } = render(
      <AccountLinkPanel
        expiresAt={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        returnFocusRef={createRef<HTMLButtonElement>()}
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
        returnFocusRef={createRef<HTMLButtonElement>()}
        sourceProvider="github"
        stage="verified"
        targetProvider="google"
      />,
    );

    expect(screen.getByText("Identity verified")).toBeInTheDocument();
    expect(screen.getByText("Continue within five minutes to connect Google.")).toBeInTheDocument();
    expect(screen.getByText(/verification deadline/i)).toHaveClass("account-link-deadline");
    expect(screen.getByText(/8:05 AM UTC/i).closest("time")).toHaveAttribute(
      "datetime",
      "2026-08-02T08:05:00.000Z",
    );
    const continuation = screen.getByRole("button", { name: "Continue to Google" });
    expect(continuation.closest("form")).toHaveAttribute("action", "/api/account-link/continue");
    expect(continuation.closest("form")).toHaveAttribute("method", "post");
    expect(container.querySelector('input[name="targetProvider"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(2);
  });

  it("revokes a verified grant through a dedicated POST cancel action", () => {
    render(
      <AccountLinkPanel
        expiresAt="2026-08-02T08:05:00.000Z"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        returnFocusRef={createRef<HTMLButtonElement>()}
        sourceProvider="github"
        stage="verified"
        targetProvider="google"
      />,
    );

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveAttribute("type", "submit");
    expect(cancel).toHaveAttribute("formaction", "/api/account-link/cancel");
    expect(cancel).toHaveAttribute("formmethod", "post");
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
        returnFocusRef={createRef<HTMLButtonElement>()}
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

  it.each([
    ["pending_reauth", "Verify GitHub"],
    ["verified", "Continue to Google"],
  ] as const)("uses native keyboard activation for the %s submit action", async (stage, name) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    render(
      <AccountLinkPanel
        expiresAt={stage === "verified" ? "2026-08-02T08:05:00.000Z" : null}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        returnFocusRef={createRef<HTMLButtonElement>()}
        sourceProvider="github"
        stage={stage}
        targetProvider="google"
      />,
    );

    screen.getByRole("button", { name }).focus();
    await user.keyboard("{Enter}");

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("uses a native button for keyboard cancellation", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AccountLinkPanel
        expiresAt={null}
        onCancel={onCancel}
        onSubmit={vi.fn()}
        returnFocusRef={createRef<HTMLButtonElement>()}
        sourceProvider="github"
        stage="pending_reauth"
        targetProvider="google"
      />,
    );

    screen.getByRole("button", { name: "Cancel" }).focus();
    await user.keyboard(" ");

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("contains forward and reverse Tab navigation inside the modal panel", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside before</button>
        <AccountLinkPanel
          expiresAt={null}
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
          returnFocusRef={createRef<HTMLButtonElement>()}
          sourceProvider="github"
          stage="pending_reauth"
          targetProvider="google"
        />
        <button type="button">Outside after</button>
      </>,
    );

    const verify = screen.getByRole("button", { name: "Verify GitHub" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    await user.tab();
    expect(verify).toHaveFocus();

    verify.focus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it("cancels on Escape and restores the provided trigger", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const returnFocusRef = createRef<HTMLButtonElement>();
    render(
      <>
        <button ref={returnFocusRef} type="button">Link Google</button>
        <AccountLinkPanel
          expiresAt={null}
          onCancel={onCancel}
          onSubmit={vi.fn()}
          returnFocusRef={returnFocusRef}
          sourceProvider="github"
          stage="pending_reauth"
          targetProvider="google"
        />
      </>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Connect Google" })).toHaveFocus());
    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Link Google" })).toHaveFocus();
  });
});
