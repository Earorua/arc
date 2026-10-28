import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackBrowser } from "../../app/components/stack/stack-browser";
import { ProofWorkspace } from "../../app/components/proof/proof-workspace";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";
import { proofResultFixture } from "../fixtures/proof-ledger";

beforeEach(() => { window.history.replaceState(null, "", "/stack"); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function planningWorkspace() {
  const audit = { id: "audit-stack", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-stack-fingerprint" };
  const availability = { id: "availability-stack", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC", weekdays: { monday: 180, tuesday: 180, wednesday: 180, thursday: 180, friday: 180, saturday: 180, sunday: 180 }, exceptions: [], weeklyMinutes: 1260, inputFingerprint: "availability-stack-fingerprint" };
  const target = { id: "target-stack", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-stack-fingerprint" };
  const builtPath = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" }).fullScope;
  const path = { ...builtPath, phases: [
    { ...builtPath.phases[0], phaseId: "phase-first", name: "先完成基础", unitIds: [builtPath.units[0].id] },
    { ...builtPath.phases[1], phaseId: "phase-next", name: "继续后续技能", unitIds: builtPath.units.slice(1).map(({ id }) => id) },
  ] };
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-stack", goalId: "goal-stack", revision: 0, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [], activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
}

const ledger = proofResultFixture().workspace;
const stackProps = { blueprint: flagshipBlueprint, projections: ledger.projections, evidence: ledger.versions.map(({ proofId, id, title }) => ({ proofId, versionId: id, title })), ownerKey: "user:one:goal-stack" };
const proofProps = { canUpload: false, dailyUnits: [], projections: [], recovery: "none" as const, source: "local" as const, skills: flagshipBlueprint.skills, workspace: ledger, createProof: async () => true, reviseProof: async () => true, setVisibility: async () => true, withdrawProof: async () => true, retry: async () => undefined };

describe("Stack current-task action", () => {
  it.each(["exploring", "practicing", "demonstrated", "verified"] as const)("continues the actual due task regardless of its %s evidence status", (status) => {
    window.history.replaceState(null, "", "/stack?skill=web-platform");
    const projection = { ...ledger.projections[0], skillId: "web-platform", status };
    render(<StackBrowser {...stackProps} projections={[projection]} planningWorkspace={planningWorkspace()} now={() => new Date("2026-08-14T08:00:00.000Z")} />);
    expect(screen.getByRole("link", { name: "继续今日学习" })).toHaveAttribute("href", "/today");
    expect(screen.queryByRole("link", { name: "查看技能路线" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "补充作品证明" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "维护作品证明" })).not.toBeInTheDocument();
  });

  it("keeps route and proof actions for skills outside the actual current task", () => {
    window.history.replaceState(null, "", "/stack?scope=all&skill=react");
    render(<StackBrowser {...stackProps} planningWorkspace={planningWorkspace()} now={() => new Date("2026-08-14T08:00:00.000Z")} />);
    expect(screen.getByRole("link", { name: "查看技能路线" })).toHaveAttribute("href", "/path?skill=react");
    expect(screen.queryByRole("link", { name: "继续今日学习" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看 Automated Testing" }));
    expect(screen.getByRole("link", { name: "补充作品证明" })).toHaveAttribute("href", "/proof?proof=proof-1&returnTo=%2Fstack%3Fscope%3Dall%26skill%3Dtesting");
    expect(screen.queryByRole("link", { name: "继续今日学习" })).not.toBeInTheDocument();
  });

  it("keeps a future task on its route until the learner's planning date reaches it", () => {
    window.history.replaceState(null, "", "/stack?skill=web-platform");
    const initial = planningWorkspace();
    const availability = { ...initial.availability, timeZone: "Asia/Shanghai" };
    const workspace = planningWorkspaceSchema.parse({ ...initial, availability, availabilityVersions: [availability] });
    const view = render(<StackBrowser {...stackProps} planningWorkspace={workspace} now={() => new Date("2026-08-13T15:59:00.000Z")} />);
    expect(screen.getByRole("link", { name: "查看技能路线" })).toHaveAttribute("href", "/path?skill=web-platform");
    expect(screen.queryByRole("link", { name: "继续今日学习" })).not.toBeInTheDocument();
    view.rerender(<StackBrowser {...stackProps} planningWorkspace={workspace} now={() => new Date("2026-08-13T16:01:00.000Z")} />);
    expect(screen.getByRole("link", { name: "继续今日学习" })).toHaveAttribute("href", "/today");
  });

  it("does not claim a current task without a planning workspace", () => {
    window.history.replaceState(null, "", "/stack?skill=web-platform");
    render(<StackBrowser {...stackProps} now={() => new Date("2026-08-14T08:00:00.000Z")} />);
    expect(screen.getByRole("link", { name: "查看技能路线" })).toHaveAttribute("href", "/path?skill=web-platform");
    expect(screen.queryByRole("link", { name: "继续今日学习" })).not.toBeInTheDocument();
  });
});

describe("Stack stage scope", () => {
  it("derives the current stage from the active route and advances only after a real completion", () => {
    const workspace = planningWorkspace();
    const view = render(<StackBrowser {...stackProps} planningWorkspace={workspace} />);
    expect(within(screen.getByRole("group", { name: "技能范围" })).getByRole("button", { name: "当前阶段" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^查看 / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "查看 Web Platform" })).toBeInTheDocument();
    const event = { kind: "completed" as const, eventId: "event-complete", mutationId: "mutation-complete", sequence: 1, targetPlanVersionId: workspace.activePlanVersionId, unitId: workspace.pathVersions[0].units[0].id, actualMinutes: 30, planningDate: "2026-08-14", occurredAt: "2026-08-14T12:00:00.000Z" };
    view.rerender(<StackBrowser {...stackProps} planningWorkspace={{ ...workspace, events: [event], lastSequence: 1 }} />);
    expect(screen.getByText(/继续后续技能/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看 React 19" })).toBeInTheDocument();
  });

  it("restores stage, category, search and selection from the URL through Back and Forward", async () => {
    window.history.replaceState(null, "", "/stack?scope=all&category=frontend&q=react&skill=react");
    render(<StackBrowser {...stackProps} planningWorkspace={planningWorkspace()} />);
    const scopes = screen.getByRole("group", { name: "技能范围" });
    expect(within(scopes).getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "React 19" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回技能列表" }));
    expect(window.location.search).toBe("?scope=all&category=frontend&q=react");
    fireEvent.click(within(scopes).getByRole("button", { name: "当前阶段" }));
    expect(screen.getByRole("status")).toHaveTextContent("没有匹配的技能");
    act(() => window.history.back());
    await waitFor(() => expect(within(scopes).getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("searchbox")).toHaveValue("react");
    act(() => window.history.forward());
    await waitFor(() => expect(within(scopes).getByRole("button", { name: "当前阶段" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("shows all skills honestly when no route is available", () => {
    window.history.replaceState(null, "", "/stack?scope=current");
    render(<StackBrowser {...stackProps} />);
    const scopes = screen.getByRole("group", { name: "技能范围" });
    expect(within(scopes).getByRole("button", { name: "当前阶段" })).toBeDisabled();
    expect(within(scopes).getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("暂无可用路线，当前显示全部技能。" )).toBeInTheDocument();
  });

  it("does not invent a current stage after the route is complete", () => {
    const workspace = planningWorkspace();
    const path = { ...workspace.pathVersions[0], units: workspace.pathVersions[0].units.slice(0, 1), phases: workspace.pathVersions[0].phases.slice(0, 1) };
    const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability: workspace.availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
    const completed = planningWorkspaceSchema.parse({ ...workspace, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, activePlanVersionId: built.plan.id, lastSequence: 1, events: [{ kind: "completed", eventId: "event-complete", mutationId: "mutation-complete", sequence: 1, targetPlanVersionId: built.plan.id, unitId: path.units[0].id, actualMinutes: 30, planningDate: "2026-08-14", occurredAt: "2026-08-14T12:00:00.000Z" }] });
    render(<StackBrowser {...stackProps} planningWorkspace={completed} />);
    expect(screen.getByRole("button", { name: "当前阶段" })).toBeDisabled();
    expect(screen.getByText("当前路线已全部完成，当前显示全部技能。")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^查看 / })).toHaveLength(flagshipBlueprint.skills.length);
    expect(screen.queryByRole("link", { name: "继续今日学习" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看技能路线" })).toHaveAttribute("href", "/path?skill=web-platform");
  });
});

describe("Stack to Proof return", () => {
  it("preserves the Today origin through skill navigation and the Proof return address", () => {
    window.history.replaceState(null, "", "/stack?scope=all&skill=testing&returnTo=%2Ftoday");
    render(<StackBrowser {...stackProps} planningWorkspace={planningWorkspace()} />);
    expect(screen.getByRole("link", { name: "返回今日学习" })).toHaveAttribute("href", "/today");
    fireEvent.click(screen.getByRole("button", { name: "返回技能列表" }));
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/today");
    fireEvent.click(screen.getByRole("button", { name: "质量" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "testing" } });
    fireEvent.click(screen.getByRole("button", { name: "查看 Automated Testing" }));
    const destination = new URL(screen.getByRole("link", { name: "补充作品证明" }).getAttribute("href")!, "https://arc.invalid");
    const origin = new URL(destination.searchParams.get("returnTo")!, "https://arc.invalid");
    expect(origin.searchParams.get("returnTo")).toBe("/today");
    expect(origin.searchParams.get("skill")).toBe("testing");
  });

  it.each(["补充作品证明", "Architecture map"])("restores the originating skill, filters, list position and focus from %s", (linkName) => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(320);
    window.history.replaceState(null, "", "/stack?scope=all&category=quality&q=testing");
    const first = render(<StackBrowser {...stackProps} planningWorkspace={planningWorkspace()} />);
    const list = screen.getByRole("list", { name: "技能索引" });
    list.scrollTop = 72;
    fireEvent.click(screen.getByRole("button", { name: "查看 Automated Testing" }));
    fireEvent.click(screen.getByText("技能要求与学习记录"));
    const origin = screen.getByRole("link", { name: linkName });
    const href = origin.getAttribute("href")!;
    const proofUrl = new URL(href, "https://arc.invalid");
    const returnTo = proofUrl.searchParams.get("returnTo");
    expect(returnTo).toBe("/stack?scope=all&category=quality&q=testing&skill=testing");
    origin.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(origin);
    first.unmount();
    window.history.replaceState(null, "", href);
    const proof = render(<ProofWorkspace {...proofProps} />);
    expect(screen.getByRole("link", { name: "返回原技能" })).toHaveAttribute("href", returnTo);
    fireEvent.click(screen.getByRole("button", { name: "添加修订" }));
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe(returnTo);
    fireEvent.click(screen.getByRole("button", { name: "取消修订" }));
    proof.unmount();
    window.history.replaceState(null, "", returnTo!);
    render(<StackBrowser {...stackProps} planningWorkspace={planningWorkspace()} />);
    expect(screen.getByRole("searchbox")).toHaveValue("testing");
    expect(screen.getByRole("link", { name: linkName })).toHaveFocus();
    expect(screen.getByRole("list", { name: "技能索引" }).scrollTop).toBe(72);
    expect(scroll).toHaveBeenCalledWith({ top: 320 });
    fireEvent.click(screen.getByRole("button", { name: "返回技能列表" }));
    expect(screen.getByRole("button", { name: "查看 Automated Testing" })).toHaveFocus();
    expect(screen.getByRole("list", { name: "技能索引" }).scrollTop).toBe(72);
  });

  it("keeps a safe origin available for a missing proof", () => {
    const origin = "/stack?scope=current&category=quality&q=testing&skill=testing";
    window.history.replaceState(null, "", `/proof?proof=missing&returnTo=${encodeURIComponent(origin)}`);
    render(<ProofWorkspace {...proofProps} />);
    expect(screen.getByRole("heading", { name: "无法读取这项作品" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回原技能" })).toHaveAttribute("href", origin);
  });

  it("retains the list position when leaving the desktop default detail directly", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    window.history.replaceState(null, "", "/stack?scope=all&category=quality&q=testing");
    const first = render(<StackBrowser {...stackProps} />);
    screen.getByRole("list", { name: "技能索引" }).scrollTop = 84;
    const link = screen.getByRole("link", { name: "补充作品证明" });
    const href = new URL(link.getAttribute("href")!, "https://arc.invalid").searchParams.get("returnTo")!;
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    first.unmount();
    window.history.replaceState(null, "", href);
    render(<StackBrowser {...stackProps} />);
    fireEvent.click(screen.getByRole("button", { name: "返回技能列表" }));
    expect(screen.getByRole("list", { name: "技能索引" }).scrollTop).toBe(84);
  });

  it("focuses the original skill when its previous evidence link is no longer available", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    window.history.replaceState(null, "", "/stack?skill=testing");
    const first = render(<StackBrowser {...stackProps} />);
    fireEvent.click(screen.getByText("技能要求与学习记录"));
    const link = screen.getByRole("link", { name: "Architecture map" });
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    first.unmount();
    render(<StackBrowser {...stackProps} projections={[]} evidence={[]} />);
    expect(screen.getByRole("heading", { name: "Automated Testing" })).toHaveFocus();
  });

  it("does not restore another account's stored position or focus", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    window.history.replaceState(null, "", "/stack?skill=testing");
    const first = render(<StackBrowser {...stackProps} />);
    const link = screen.getByRole("link", { name: "补充作品证明" });
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    first.unmount();
    render(<StackBrowser {...stackProps} ownerKey="user:two:goal-stack" />);
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "补充作品证明" })).not.toHaveFocus();
  });

  it.each(["/today?unit=unit-a", "/path?skill=testing#unit-a", "/history?page=2", "/stack?skill=testing&returnTo=%2Ftoday"])("returns to the safe internal origin %s", (origin) => {
    window.history.replaceState(null, "", `/proof?proof=missing&returnTo=${encodeURIComponent(origin)}`);
    render(<ProofWorkspace {...proofProps} />);
    expect(screen.getByRole("link", { name: /返回/ })).toHaveAttribute("href", origin);
  });

  it.each(["https://outside.example", "//outside.example", "/proof?proof=other", "/stack?returnTo=%2Fproof", "/today?next=%2Fproof"])("rejects unsafe or recursive origins %s", (origin) => {
    window.history.replaceState(null, "", `/proof?proof=missing&returnTo=${encodeURIComponent(origin)}`);
    render(<ProofWorkspace {...proofProps} />);
    expect(screen.queryByRole("link", { name: /返回/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回作品列表" })).toBeInTheDocument();
  });
});

