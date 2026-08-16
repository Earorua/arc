import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../../app/components/setup/setup-flow";
import { AdaptiveSetupFlow } from "../../app/components/setup/adaptive-setup-flow";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";

afterEach(cleanup);

describe("SetupFlow", () => {
  async function reachWeeklyStep(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
  }

  async function reachTargetWeeksStep(user: ReturnType<typeof userEvent.setup>) {
    await reachWeeklyStep(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
  }

  it("moves focus to each new question without suppressing browser scrolling", async () => {
    const user = userEvent.setup();
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    render(<SetupFlow onComplete={vi.fn()} />);

    const firstQuestion = screen.getByRole("heading", { level: 1 });
    expect(firstQuestion.closest("section")).not.toHaveAttribute("aria-live");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const secondQuestion = screen.getByRole("heading", { level: 1 });
    expect(secondQuestion).not.toBe(firstQuestion);
    expect(secondQuestion).toHaveFocus();
    const questionFocusCall = focusSpy.mock.contexts.findIndex((context) => context === secondQuestion);
    expect(questionFocusCall).toBeGreaterThanOrEqual(0);
    expect(focusSpy.mock.calls[questionFocusCall]).toEqual([]);
    focusSpy.mockRestore();
  });

  it("submits the flagship setup answers", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);

    await user.click(screen.getByRole("button", { name: "AI 原生全栈工程师" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Beginner" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Weekly minutes"));
    await user.type(screen.getByLabelText("Weekly minutes"), "420");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.clear(screen.getByLabelText("Target weeks"));
    await user.type(screen.getByLabelText("Target weeks"), "18");
    await user.click(screen.getByRole("button", { name: "Build my path" }));

    expect(onComplete).toHaveBeenCalledWith({
      roleId: "ai-native-full-stack-engineer",
      level: "beginner",
      weeklyMinutes: 420,
      targetWeeks: 18,
    });
  });

  it("submits an arbitrary custom role", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);

    await user.type(screen.getByLabelText("Custom role"), "数据产品经理");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Beginner" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));

    expect(onComplete).toHaveBeenCalledWith({
      roleId: "数据产品经理",
      level: "beginner",
      weeklyMinutes: 420,
      targetWeeks: 18,
    });
  });

  it("discloses the legacy custom-role path and never instantiates adaptive planning", async () => {
    const user = userEvent.setup();
    const renderAdaptive = vi.fn(() => <p>Adaptive workspace</p>);
    render(<SetupFlow onComplete={vi.fn()} renderAdaptive={renderAdaptive} />);
    await user.type(screen.getByLabelText("Custom role"), "数据产品经理");
    expect(screen.getByText("Full skill audit and adaptive scheduling currently require Arc's reviewed AI-Native Full-Stack Engineer blueprint. This custom role will keep the proportional v7 path.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(renderAdaptive).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "你现在处于哪个阶段？" })).toBeInTheDocument();
  });

  it("instantiates adaptive planning only after the reviewed flagship is confirmed", async () => {
    const user = userEvent.setup();
    const renderAdaptive = vi.fn(() => <p>Adaptive workspace</p>);
    render(<SetupFlow onComplete={vi.fn()} renderAdaptive={renderAdaptive} />);
    expect(renderAdaptive).not.toHaveBeenCalled();
    expect(screen.getByText("01 / 05")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(renderAdaptive).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Adaptive workspace")).toBeInTheDocument();
  });

  it("owns the common Role stage and preserves adaptive answers across Role changes", async () => {
    const user = userEvent.setup();
    render(<SetupFlow onComplete={vi.fn()} renderAdaptive={({ active, onBackToRole }) => <AdaptiveSetupFlow active={active} blueprint={flagshipBlueprint} createMutationId={() => "mutation"} generate={vi.fn()} navigate={vi.fn()} now={() => new Date("2026-08-14T02:00:00.000Z")} onBackToRole={onBackToRole} registry={flagshipUnitRegistry} timeZone="Asia/Shanghai" />} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("02 / 05 · Audit")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set Foundations to Guided" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Custom role")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "你想成为怎样的构建者？" })).toHaveFocus();
    await user.type(screen.getByLabelText("Custom role"), "数据产品经理");
    expect(screen.getByText(/This custom role will keep the proportional v7 path/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Custom role"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Audit each skill, honestly." })).toHaveFocus();
    expect(screen.getAllByRole("radio", { name: "Guided", checked: true })).toHaveLength(2);
  });

  it("exposes the selected role and level to assistive technology", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);

    const flagship = screen.getByRole("button", { name: "AI 原生全栈工程师" });
    expect(flagship).toHaveAttribute("aria-pressed", "true");

    await user.type(screen.getByLabelText("Custom role"), "数据产品经理");
    expect(flagship).toHaveAttribute("aria-pressed", "false");

    await user.clear(screen.getByLabelText("Custom role"));
    await user.type(screen.getByLabelText("Custom role"), " ");
    expect(flagship).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Beginner" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByRole("button", { name: "Beginner" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ roleId: "ai-native-full-stack-engineer" }));
  });

  it("blocks invalid weekly minutes and accepts both boundaries", async () => {
    const user = userEvent.setup();
    render(<SetupFlow onComplete={vi.fn()} />);
    await reachWeeklyStep(user);
    const weekly = screen.getByLabelText("Weekly minutes");
    const continueButton = screen.getByRole("button", { name: "Continue" });

    for (const value of ["", "29", "2401"]) {
      await user.clear(weekly);
      if (value) await user.type(weekly, value);
      expect(weekly).toHaveAttribute("aria-invalid", "true");
      expect(weekly).toHaveAttribute("aria-describedby", "weekly-minutes-error");
      expect(screen.getByRole("alert")).toHaveTextContent("30 to 2400");
      expect(continueButton).toBeDisabled();
      await user.click(continueButton);
      expect(screen.queryByLabelText("Target weeks")).not.toBeInTheDocument();
    }

    for (const value of ["30", "2400"]) {
      await user.clear(weekly);
      await user.type(weekly, value);
      expect(weekly).toHaveAttribute("aria-invalid", "false");
      expect(continueButton).toBeEnabled();
    }
  });

  it("blocks invalid target weeks and accepts both boundaries", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);
    await reachTargetWeeksStep(user);
    const targetWeeks = screen.getByLabelText("Target weeks");
    const buildButton = screen.getByRole("button", { name: "Build my path" });

    for (const value of ["", "3", "53"]) {
      await user.clear(targetWeeks);
      if (value) await user.type(targetWeeks, value);
      expect(targetWeeks).toHaveAttribute("aria-invalid", "true");
      expect(targetWeeks).toHaveAttribute("aria-describedby", "target-weeks-error");
      expect(screen.getByRole("alert")).toHaveTextContent("4 to 52");
      expect(buildButton).toBeDisabled();
      await user.click(buildButton);
      expect(onComplete).not.toHaveBeenCalled();
    }

    for (const value of ["4", "52"]) {
      await user.clear(targetWeeks);
      await user.type(targetWeeks, value);
      expect(targetWeeks).toHaveAttribute("aria-invalid", "false");
      expect(buildButton).toBeEnabled();
    }
  });
});
