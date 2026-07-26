import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TodaySession } from "../../app/components/today/today-session";
import { flagshipRole } from "../../app/data/flagship-role";

afterEach(cleanup);

describe("TodaySession", () => {
  it("shows completion only after every actual step is complete", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn(() => true);

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

  it("starts a new unit with fresh completion state even when step ids are reused", async () => {
    const user = userEvent.setup();
    const firstComplete = vi.fn(() => true);
    const nextComplete = vi.fn(() => true);
    const { rerender } = render(<TodaySession onComplete={firstComplete} unit={flagshipRole.today} />);

    for (const step of flagshipRole.today.steps) {
      await user.click(screen.getByRole("checkbox", { name: step.label }));
    }
    await user.click(screen.getByRole("button", { name: "Complete & move to Proof" }));
    expect(firstComplete).toHaveBeenCalledTimes(1);

    const nextUnit = {
      ...flagshipRole.today,
      id: "next-unit",
      title: "Next unit",
    };

    rerender(<TodaySession onComplete={nextComplete} unit={nextUnit} />);

    for (const step of nextUnit.steps) {
      expect(screen.getByRole("checkbox", { name: step.label })).not.toBeChecked();
    }
    expect(screen.queryByRole("button", { name: "Complete & move to Proof" })).not.toBeInTheDocument();

    for (const step of nextUnit.steps) {
      await user.click(screen.getByRole("checkbox", { name: step.label }));
    }
    await user.dblClick(screen.getByRole("button", { name: "Complete & move to Proof" }));

    expect(nextComplete).toHaveBeenCalledWith(nextUnit);
    expect(nextComplete).toHaveBeenCalledTimes(1);
    expect(firstComplete).toHaveBeenCalledTimes(1);
  });

  it("releases the completion lock after a failed save so the learner can retry", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(<TodaySession onComplete={onComplete} unit={flagshipRole.today} />);

    for (const step of flagshipRole.today.steps) {
      await user.click(screen.getByRole("checkbox", { name: step.label }));
    }

    const button = screen.getByRole("button", { name: "Complete & move to Proof" });
    await user.click(button);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();

    await user.click(button);

    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(button).toBeDisabled();
  });
});
