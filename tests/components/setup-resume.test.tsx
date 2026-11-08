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
    fireEvent.change(screen.getByLabelText("Custom role"), { target: { value: "数据产品经理" } });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Custom role")).toHaveValue("数据产品经理");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Minutes per week"), { target: { value: "180" } });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Minutes per week")).toHaveValue(180);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores a legacy step after refresh without sharing it with another owner", async () => {
    const user = userEvent.setup();
    const view = render(<SetupFlow draftOwner="user:alice" onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Custom role"), { target: { value: "生态研究员" } });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Minutes per week"), { target: { value: "210" } });
    view.unmount();
    const restored = render(<SetupFlow draftOwner="user:alice" onComplete={vi.fn()} />);
    expect(await screen.findByLabelText("Minutes per week")).toHaveValue(210);
    expect(screen.getByText(/draft.*restored/)).toBeInTheDocument();
    restored.rerender(<SetupFlow draftOwner="user:bob" onComplete={vi.fn()} />);
    expect(await screen.findByLabelText("Custom role")).toHaveValue("");
    expect(screen.queryByLabelText("Minutes per week")).not.toBeInTheDocument();
  });

  it("restores adaptive answers and stage only for the same owner and source", async () => {
    const user = userEvent.setup();
    const source = { source: "research" as const, researchRunId: "research-one" };
    const view = render(<AdaptiveSetupFlow {...adaptive} draftOwner="user:alice" source={source} />);
    await user.click(within(screen.getByRole("group", { name: "Web Platform self-assessment" })).getByRole("radio", { name: "Independent" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Monday minutes"), { target: { value: "90" } });
    view.unmount();
    const restored = render(<AdaptiveSetupFlow {...adaptive} draftOwner="user:alice" source={source} />);
    expect(await screen.findByLabelText("Monday minutes")).toHaveValue(90);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(within(screen.getByRole("group", { name: "Web Platform self-assessment" })).getByRole("radio", { name: "Independent" })).toBeChecked();
    restored.rerender(<AdaptiveSetupFlow {...adaptive} draftOwner="user:alice" source={{ source: "research", researchRunId: "research-two" }} />);
    expect(within(screen.getByRole("group", { name: "Web Platform self-assessment" })).getByRole("radio", { name: "Not started" })).toBeChecked();
    restored.rerender(<AdaptiveSetupFlow {...adaptive} draftOwner="user:bob" source={source} />);
    expect(within(screen.getByRole("group", { name: "Web Platform self-assessment" })).getByRole("radio", { name: "Not started" })).toBeChecked();
  });

  it("requires an explicit one-time guest draft handoff", async () => {
    const user = userEvent.setup();
    const guest = render(<SetupFlow draftOwner="guest" onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Custom role"), { target: { value: "访客目标" } });
    await user.click(screen.getByRole("button", { name: "Continue" }));
    guest.unmount();
    const account = render(<SetupFlow draftOwner="user:alice" onComplete={vi.fn()} />);
    expect(screen.getByLabelText("Custom role")).toHaveValue("");
    await user.click(await screen.findByRole("button", { name: "Continue guest draft" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Custom role")).toHaveValue("访客目标");
    account.rerender(<SetupFlow draftOwner="user:bob" onComplete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Continue guest draft" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Custom role")).toHaveValue("");
  });

  it("opens only a small first group and keeps bulk controls secondary", async () => {
    render(<SkillAuditStep blueprint={flagshipBlueprint} value={createSkillAuditDraft(flagshipBlueprint)} onChange={vi.fn()} />);
    expect(screen.getAllByRole("group", { name: /self-assessment$/ }).length).toBeLessThanOrEqual(5);
    expect(screen.queryByRole("button", { name: /^Set Foundations/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Foundations bulk settings"));
    expect(screen.getByRole("button", { name: "Set Foundations to Need guidance" })).toBeVisible();
  });

  it("limits the initial skill group even when research puts all skills in one category", () => {
    const blueprint = { ...flagshipBlueprint, skills: flagshipBlueprint.skills.map((skill) => ({ ...skill, category: "foundations" as const })) };
    render(<SkillAuditStep blueprint={blueprint} value={createSkillAuditDraft(blueprint)} onChange={vi.fn()} />);
    expect(screen.getAllByRole("group", { name: /self-assessment$/ })).toHaveLength(4);
  });

  it("reuses the same generation mutation after an ambiguous save and refresh", async () => {
    const user = userEvent.setup();
    let mutation = 0;
    const generate = vi.fn().mockResolvedValue(false);
    const properties = { ...adaptive, draftOwner: "user:alice", generate, createMutationId: () => `mutation-resume-${++mutation}` };
    const view = render(<AdaptiveSetupFlow {...properties} />);
    for (let index = 0; index < 2; index++) await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Create path" }));
    const first = generate.mock.calls[0]![0];
    view.unmount();
    render(<AdaptiveSetupFlow {...properties} />);
    await user.click(await screen.findByRole("button", { name: "Create path" }));
    expect(generate.mock.calls[1]![0]).toEqual(first);
  });
});
