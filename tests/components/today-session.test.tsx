import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodaySession } from "../../app/components/today/today-session";
import { flagshipRole } from "../../app/data/flagship-role";

afterEach(cleanup);

describe("TodaySession", () => {
  it("shows completion only after every actual step is complete", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();

    render(<TodaySession onComplete={onComplete} unit={flagshipRole.today} />);

    expect(screen.queryByRole("button", { name: "Complete & move to Proof" })).not.toBeInTheDocument();

    for (const [index, step] of flagshipRole.today.steps.entries()) {
      await user.click(screen.getByRole("checkbox", { name: step.label }));
      if (index < flagshipRole.today.steps.length - 1) {
        expect(screen.queryByRole("button", { name: "Complete & move to Proof" })).not.toBeInTheDocument();
      }
    }

    const button = screen.getByRole("button", { name: "Complete & move to Proof" });
    expect(button.closest(".deliverable-bar")).toHaveAttribute("lang", "en");

    await user.dblClick(button);

    expect(onComplete).toHaveBeenCalledWith(flagshipRole.today);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("does not treat stale completed ids as completion for a new unit", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TodaySession onComplete={vi.fn()} unit={flagshipRole.today} />);

    for (const step of flagshipRole.today.steps) {
      await user.click(screen.getByRole("checkbox", { name: step.label }));
    }
    expect(screen.getByRole("button", { name: "Complete & move to Proof" })).toBeInTheDocument();

    const nextUnit = {
      ...flagshipRole.today,
      id: "next-unit",
      steps: flagshipRole.today.steps.map((step) => ({
        ...step,
        id: `next-${step.id}`,
        label: `Next ${step.label}`,
      })),
    };

    rerender(<TodaySession onComplete={vi.fn()} unit={nextUnit} />);

    expect(screen.queryByRole("button", { name: "Complete & move to Proof" })).not.toBeInTheDocument();
  });
});
