import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodaySession } from "../../app/components/today/today-session";
import { flagshipRole } from "../../app/data/flagship-role";

afterEach(cleanup);

describe("TodaySession", () => {
  it("completes all three steps before emitting the unit completion", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<TodaySession onComplete={onComplete} unit={flagshipRole.today} />);

    expect(screen.queryByRole("button", { name: "Complete & move to Proof" })).not.toBeInTheDocument();

    for (const step of flagshipRole.today.steps) {
      await user.click(screen.getByRole("checkbox", { name: step.label }));
    }

    const button = screen.getByRole("button", { name: "Complete & move to Proof" });
    expect(button.closest(".deliverable-bar")).toHaveAttribute("lang", "en");

    await user.click(button);

    expect(onComplete).toHaveBeenCalledWith(flagshipRole.today);
  });
});
