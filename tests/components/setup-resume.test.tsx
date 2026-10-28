import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupFlow } from "../../app/components/setup/setup-flow";
import { AdaptiveSetupFlow } from "../../app/components/setup/adaptive-setup-flow";
import { SkillAuditStep, createSkillAuditDraft } from "../../app/components/setup/skill-audit-step";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const adaptive = { blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, generate: vi.fn(), navigate: vi.fn(), createMutationId: () => "mutation-resume", now: () => new Date("2026-10-28T00:00:00Z"), timeZone: "UTC" };

describe("setup continuity", () => {
  it("provides Back on every legacy step and retains all four answers", async () => {
    const user = userEvent.setup();
    render(<SetupFlow onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: "数据产品经理" } });
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "熟练" }));
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByLabelText("自定义岗位")).toHaveValue("数据产品经理");
    await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByRole("button", { name: "熟练" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "继续" }));
    fireEvent.change(screen.getByLabelText("每周分钟数"), { target: { value: "180" } });
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByLabelText("每周分钟数")).toHaveValue(180);
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByRole("button", { name: "熟练" })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores a legacy step after refresh without sharing it with another owner", async () => {
    const user = userEvent.setup();
    const view = render(<SetupFlow draftOwner="user:alice" onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: "生态研究员" } });
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "熟练" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    fireEvent.change(screen.getByLabelText("每周分钟数"), { target: { value: "210" } });
    view.unmount();
    const restored = render(<SetupFlow draftOwner="user:alice" onComplete={vi.fn()} />);
    expect(await screen.findByLabelText("每周分钟数")).toHaveValue(210);
    expect(screen.getByText(/已恢复.*草稿/)).toBeInTheDocument();
    restored.rerender(<SetupFlow draftOwner="user:bob" onComplete={vi.fn()} />);
    expect(await screen.findByLabelText("自定义岗位")).toHaveValue("");
    expect(screen.queryByLabelText("每周分钟数")).not.toBeInTheDocument();
  });

  it("restores adaptive answers and stage only for the same owner and source", async () => {
    const user = userEvent.setup();
    const source = { source: "research" as const, researchRunId: "research-one" };
    const view = render(<AdaptiveSetupFlow {...adaptive} draftOwner="user:alice" source={source} />);
    await user.click(within(screen.getByRole("group", { name: "Web Platform 自我评估" })).getByRole("radio", { name: "可独立完成" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    fireEvent.change(screen.getByLabelText("周一分钟数"), { target: { value: "90" } });
    view.unmount();
    const restored = render(<AdaptiveSetupFlow {...adaptive} draftOwner="user:alice" source={source} />);
    expect(await screen.findByLabelText("周一分钟数")).toHaveValue(90);
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(within(screen.getByRole("group", { name: "Web Platform 自我评估" })).getByRole("radio", { name: "可独立完成" })).toBeChecked();
    restored.rerender(<AdaptiveSetupFlow {...adaptive} draftOwner="user:alice" source={{ source: "research", researchRunId: "research-two" }} />);
    expect(within(screen.getByRole("group", { name: "Web Platform 自我评估" })).getByRole("radio", { name: "尚未接触" })).toBeChecked();
    restored.rerender(<AdaptiveSetupFlow {...adaptive} draftOwner="user:bob" source={source} />);
    expect(within(screen.getByRole("group", { name: "Web Platform 自我评估" })).getByRole("radio", { name: "尚未接触" })).toBeChecked();
  });

  it("requires an explicit one-time guest draft handoff", async () => {
    const user = userEvent.setup();
    const guest = render(<SetupFlow draftOwner="guest" onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("自定义岗位"), { target: { value: "访客目标" } });
    await user.click(screen.getByRole("button", { name: "继续" }));
    guest.unmount();
    const account = render(<SetupFlow draftOwner="user:alice" onComplete={vi.fn()} />);
    expect(screen.getByLabelText("自定义岗位")).toHaveValue("");
    await user.click(await screen.findByRole("button", { name: "继续访客草稿" }));
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.getByLabelText("自定义岗位")).toHaveValue("访客目标");
    account.rerender(<SetupFlow draftOwner="user:bob" onComplete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "继续访客草稿" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("自定义岗位")).toHaveValue("");
  });

  it("opens only a small first group and keeps bulk controls secondary", async () => {
    render(<SkillAuditStep blueprint={flagshipBlueprint} value={createSkillAuditDraft(flagshipBlueprint)} onChange={vi.fn()} />);
    expect(screen.getAllByRole("group", { name: /自我评估$/ }).length).toBeLessThanOrEqual(5);
    expect(screen.queryByRole("button", { name: /^将基础/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("基础批量设置"));
    expect(screen.getByRole("button", { name: "将基础设为需指导完成" })).toBeVisible();
  });

  it("limits the initial skill group even when research puts all skills in one category", () => {
    const blueprint = { ...flagshipBlueprint, skills: flagshipBlueprint.skills.map((skill) => ({ ...skill, category: "foundations" as const })) };
    render(<SkillAuditStep blueprint={blueprint} value={createSkillAuditDraft(blueprint)} onChange={vi.fn()} />);
    expect(screen.getAllByRole("group", { name: /自我评估$/ })).toHaveLength(4);
  });

  it("reuses the same generation mutation after an ambiguous save and refresh", async () => {
    const user = userEvent.setup();
    let mutation = 0;
    const generate = vi.fn().mockResolvedValue(false);
    const properties = { ...adaptive, draftOwner: "user:alice", generate, createMutationId: () => `mutation-resume-${++mutation}` };
    const view = render(<AdaptiveSetupFlow {...properties} />);
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "生成学习路径" }));
    const first = generate.mock.calls[0]![0];
    view.unmount();
    render(<AdaptiveSetupFlow {...properties} />);
    await user.click(await screen.findByRole("button", { name: "生成学习路径" }));
    expect(generate.mock.calls[1]![0]).toEqual(first);
  });
});
