import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../../app/components/setup/setup-flow";
import { AdaptiveSetupFlow } from "../../app/components/setup/adaptive-setup-flow";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";

afterEach(cleanup);

describe("SetupFlow", () => {
  it.each([
    "ai-native-full-stack-engineer", "  AI-NATIVE-FULL-STACK-ENGINEER  ",
    "AI-Native Full-Stack Engineer", "  ai-native   full-stack\tengineer ",
    "ＡＩ-Native Full-Stack Engineer", flagshipBlueprint.name, "  ai　原生全栈工程师  ",
  ])("does not offer new research for the known Flagship alias %s", async (role) => {
    const renderResearch = vi.fn(() => <p>Research controls</p>);
    const renderAdaptive = vi.fn(() => <p>Flagship audit</p>);
    const page = render(<SetupFlow onComplete={vi.fn()} signedIn researchEligible renderResearch={renderResearch} renderAdaptive={renderAdaptive} />);
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: role } });
    expect(renderResearch).not.toHaveBeenCalled();
    expect(screen.queryByText(/先研究岗位，可使用/)).not.toBeInTheDocument();
    // Excluding new Research must not hide an existing owner run.
    page.rerender(<SetupFlow onComplete={vi.fn()} signedIn researchRecoveryAvailable renderResearch={renderResearch} renderAdaptive={renderAdaptive} />);
    expect(screen.getByText("Research controls")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByRole("heading", { name: "你现在处于哪个阶段？" })).toBeInTheDocument();
    expect(renderAdaptive).not.toHaveBeenCalled();
  });
  it("preserves Back edits for the same research source and remounts the audit for another run", async () => {
    const user = userEvent.setup();
    const data = { id: "research-package-one", blueprint: flagshipBlueprint, registry: flagshipUnitRegistry };
    render(<SetupFlow onComplete={vi.fn()} signedIn researchEligible researchRecoveryAvailable
      renderResearch={({ onUseResearch }) => <><button onClick={() => onUseResearch("research-one", data)}>Use first research</button><button onClick={() => onUseResearch("research-two", data)}>Use second research</button></>}
      renderAdaptive={({ active, onBackToRole, source }) => <AdaptiveSetupFlow source={source} active={active} blueprint={flagshipBlueprint} registry={flagshipUnitRegistry} generate={vi.fn()} navigate={vi.fn()} createMutationId={() => "mutation-setup"} now={() => new Date("2026-09-05T00:00:00Z")} timeZone="UTC" onBackToRole={onBackToRole} />} />);
    await user.click(screen.getByRole("button", { name: "Use first research" }));
    await user.click(screen.getByRole("button", { name: "将基础设为需指导完成" }));
    await user.click(screen.getByRole("button", { name: "返回" }));
    await user.click(screen.getByRole("button", { name: "Use first research" }));
    expect(screen.getAllByRole("radio", { name: "需指导完成", checked: true })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "返回" }));
    await user.click(screen.getByRole("button", { name: "Use second research" }));
    expect(screen.queryAllByRole("radio", { name: "需指导完成", checked: true })).toHaveLength(0);
  });
  it("offers the research slot only to eligible signed-in custom roles", async () => {
    const user = userEvent.setup();
    const renderResearch = vi.fn(({ role }) => <button>Research {role}</button>);
    render(<SetupFlow onComplete={vi.fn()} signedIn researchEligible renderResearch={renderResearch} />);
    expect(renderResearch).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("自定义岗位"), "Data Product Manager");
    expect(screen.getByRole("button", { name: "Research Data Product Manager" })).toBeInTheDocument();
    expect(screen.queryByText(/完整技能评估与自适应安排目前需要/)).not.toBeInTheDocument();
    expect(screen.getByText(/直接继续将使用按时间比例分配的基础路径/)).toBeInTheDocument();
  });
  it("keeps the research slot visible during recovery without inviting new research", async () => {
    const user = userEvent.setup();
    const renderResearch = vi.fn(() => <button>Research controls</button>);
    render(<SetupFlow onComplete={vi.fn()} signedIn researchRecoveryAvailable renderResearch={renderResearch} />);

    await user.type(screen.getByLabelText("自定义岗位"), "Data Product Manager");

    expect(screen.getByRole("button", { name: "Research controls" })).toBeInTheDocument();
    expect(screen.queryByText(/先研究岗位，可使用/)).not.toBeInTheDocument();
    expect(screen.getByText("暂时无法发起新研究。直接继续将使用按时间比例分配的基础路径。")).toBeInTheDocument();
  });
  async function reachWeeklyStep(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
  }

  async function reachTargetWeeksStep(user: ReturnType<typeof userEvent.setup>) {
    await reachWeeklyStep(user);
    await user.click(screen.getByRole("button", { name: "继续" }));
  }

  it("moves focus to each new question without suppressing browser scrolling", async () => {
    const user = userEvent.setup();
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    render(<SetupFlow onComplete={vi.fn()} />);

    const firstQuestion = screen.getByRole("heading", { level: 1 });
    expect(firstQuestion.closest("section")).not.toHaveAttribute("aria-live");
    await user.click(screen.getByRole("button", { name: "继续" }));

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
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "初学" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.clear(screen.getByLabelText("每周分钟数"));
    await user.type(screen.getByLabelText("每周分钟数"), "420");
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.clear(screen.getByLabelText("目标周数"));
    await user.type(screen.getByLabelText("目标周数"), "18");
    await user.click(screen.getByRole("button", { name: "生成学习路径" }));

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

    await user.type(screen.getByLabelText("自定义岗位"), "数据产品经理");
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "初学" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "生成学习路径" }));

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
    await user.type(screen.getByLabelText("自定义岗位"), "数据产品经理");
    expect(screen.getByText("完整技能评估与自适应安排目前需要精选岗位蓝图或可用的研究结果。此岗位将使用按时间比例分配的基础路径。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(renderAdaptive).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "你现在处于哪个阶段？" })).toBeInTheDocument();
  });

  it("instantiates adaptive planning only after the reviewed flagship is confirmed", async () => {
    const user = userEvent.setup();
    const renderAdaptive = vi.fn(() => <p>Adaptive workspace</p>);
    render(<SetupFlow onComplete={vi.fn()} renderAdaptive={renderAdaptive} />);
    expect(renderAdaptive).not.toHaveBeenCalled();
    expect(screen.getByText("01 / 05")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(renderAdaptive).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Adaptive workspace")).toBeInTheDocument();
  });

  it("owns the common Role stage and preserves adaptive answers across Role changes", async () => {
    const user = userEvent.setup();
    render(<SetupFlow onComplete={vi.fn()} renderAdaptive={({ active, onBackToRole }) => <AdaptiveSetupFlow active={active} blueprint={flagshipBlueprint} createMutationId={() => "mutation"} generate={vi.fn()} navigate={vi.fn()} now={() => new Date("2026-08-14T02:00:00.000Z")} onBackToRole={onBackToRole} registry={flagshipUnitRegistry} timeZone="Asia/Shanghai" />} />);
    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByText("02 / 05 · 技能评估")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "将基础设为需指导完成" }));
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByLabelText("自定义岗位")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "你想成为怎样的构建者？" })).toHaveFocus();
    await user.type(screen.getByLabelText("自定义岗位"), "数据产品经理");
    expect(screen.getByText(/此岗位将使用按时间比例分配的基础路径/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("自定义岗位"));
    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByRole("heading", { name: "评估你目前的技能。" })).toHaveFocus();
    expect(screen.getAllByRole("radio", { name: "需指导完成", checked: true })).toHaveLength(2);
  });

  it("exposes the selected role and level to assistive technology", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<SetupFlow onComplete={onComplete} />);

    const flagship = screen.getByRole("button", { name: "AI 原生全栈工程师" });
    expect(flagship).toHaveAttribute("aria-pressed", "true");

    await user.type(screen.getByLabelText("自定义岗位"), "数据产品经理");
    expect(flagship).toHaveAttribute("aria-pressed", "false");

    await user.clear(screen.getByLabelText("自定义岗位"));
    await user.type(screen.getByLabelText("自定义岗位"), " ");
    expect(flagship).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByRole("button", { name: "初学" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "熟练" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "熟练" }));
    expect(screen.getByRole("button", { name: "初学" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "熟练" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "生成学习路径" }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ roleId: "ai-native-full-stack-engineer" }));
  });

  it("blocks invalid weekly minutes and accepts both boundaries", async () => {
    const user = userEvent.setup();
    render(<SetupFlow onComplete={vi.fn()} />);
    await reachWeeklyStep(user);
    const weekly = screen.getByLabelText("每周分钟数");
    const continueButton = screen.getByRole("button", { name: "继续" });

    for (const value of ["", "29", "2401"]) {
      await user.clear(weekly);
      if (value) await user.type(weekly, value);
      expect(weekly).toHaveAttribute("aria-invalid", "true");
      expect(weekly).toHaveAttribute("aria-describedby", "weekly-minutes-error");
      expect(screen.getByRole("alert")).toHaveTextContent("30 至 2400");
      expect(continueButton).toBeDisabled();
      await user.click(continueButton);
      expect(screen.queryByLabelText("目标周数")).not.toBeInTheDocument();
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
    const targetWeeks = screen.getByLabelText("目标周数");
    const buildButton = screen.getByRole("button", { name: "生成学习路径" });

    for (const value of ["", "3", "53"]) {
      await user.clear(targetWeeks);
      if (value) await user.type(targetWeeks, value);
      expect(targetWeeks).toHaveAttribute("aria-invalid", "true");
      expect(targetWeeks).toHaveAttribute("aria-describedby", "target-weeks-error");
      expect(screen.getByRole("alert")).toHaveTextContent("4 至 52");
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
