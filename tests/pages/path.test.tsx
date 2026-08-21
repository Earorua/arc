import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PathPage from "../../app/path/page";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";
import { applyPlanningEvent } from "../../app/lib/planning/event-reducer";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";

const { usePlanningWorkspace } = vi.hoisted(() => ({ usePlanningWorkspace: vi.fn() }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace }));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

function emptyPlanningController() {
  return { workspace: null, source: "local", migration: "none", recovery: "none", generate: vi.fn(), record: vi.fn(), accept: vi.fn(), discard: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), retry: vi.fn() };
}

function pendingWorkspace() {
  const audit = { id: "audit-path-page", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-path-page-fingerprint" };
  const availability = { id: "availability-path-page", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC", weekdays: { monday: 180, tuesday: 180, wednesday: 180, thursday: 180, friday: 180, saturday: 180, sunday: 180 }, exceptions: [], weeklyMinutes: 1260, inputFingerprint: "availability-path-page-fingerprint" };
  const target = { id: "target-path-page", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 12, inputFingerprint: "target-path-page-fingerprint" };
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" }).fullScope;
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  const initial = planningWorkspaceSchema.parse({ id: "workspace-path-page", goalId: "goal-path-page", revision: 0, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [], activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
  const primary = built.dailyUnits.find(({ required }) => required)!;
  const transition = applyPlanningEvent({
    workspace: initial,
    blueprint: flagshipBlueprint,
    registry: flagshipUnitRegistry,
    event: { eventId: "event-path-page", mutationId: "mutation-path-page", sequence: 1, targetPlanVersionId: built.plan.id, occurredAt: "2026-08-14T10:00:00.000Z", kind: "delayed", unitId: primary.id, planningDate: "2026-08-14" },
  });
  return transition.workspace;
}

beforeEach(() => {
  window.localStorage.clear();
  usePlanningWorkspace.mockReset();
  usePlanningWorkspace.mockReturnValue(emptyPlanningController());
});
afterEach(cleanup);

describe("PathPage", () => {
  it("shows the complete 18-week route in four editorial phases", async () => {
    render(<PathPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Restoring your plan");
    expect(screen.queryByText(/18 weeks/)).not.toBeInTheDocument();

    const heading = await screen.findByRole("heading", { name: "Your precise path." });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveAttribute("lang", "en");
    expect(screen.getByText("AI-Native Full-Stack Engineer · 18 weeks · 7 hours / week")).toBeInTheDocument();
    const phaseList = screen.getByRole("list", { name: "Learning phases" });
    const phaseItems = within(phaseList).getAllByRole("listitem");
    expect(phaseItems).toHaveLength(4);
    expect(phaseItems[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Product Foundations")).toBeInTheDocument();
    expect(screen.getByText("Production Proof")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Learning workspace" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Path" })).toHaveAttribute("aria-current", "page");
  });

  it("hydrates a custom role, weekly budget, and proportional target path", async () => {
    usePlanningWorkspace.mockClear();
    saveDemoState(mergeSetup(createDemoState(), {
      roleId: "数据产品经理",
      level: "advanced",
      weeklyMinutes: 90,
      targetWeeks: 10,
    }));

    render(<PathPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Restoring your plan");
    expect(screen.queryByText(/18 weeks/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 weeks · 1 hour 30 minutes / week")).toBeInTheDocument();
    });
    expect(screen.getByText(/当前内容使用 AI 原生全栈旗舰样本/)).toBeInTheDocument();
    expect(screen.getByText(/Product Intelligence 后续研究并替换/)).toBeInTheDocument();

    expect(usePlanningWorkspace).not.toHaveBeenCalled();
    const phaseList = screen.getByRole("list", { name: "Learning phases" });
    const phaseWeeks = within(phaseList).getAllByText(/weeks$/).map((item) => item.textContent);
    expect(phaseWeeks).toEqual(["2 weeks", "3 weeks", "3 weeks", "2 weeks"]);
  });

  it("keeps the adaptive Path visible with its pending diff and planning target metadata", async () => {
    const user = userEvent.setup();
    const discard = vi.fn().mockResolvedValue(true);
    usePlanningWorkspace.mockReturnValue({
      ...emptyPlanningController(),
      workspace: pendingWorkspace(),
      discard,
    });

    render(<PathPage />);

    expect(await screen.findByRole("heading", { name: "Your precise path." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review every change." })).toBeInTheDocument();
    expect(screen.getByText("AI-Native Full-Stack Engineer · 12 weeks")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep current plan" }));
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("shows a truthful fail-closed boundary when the stored catalogue version cannot load", async () => {
    usePlanningWorkspace.mockReturnValue({
      ...emptyPlanningController(),
      source: "offline-cloud",
      recovery: "version-unavailable",
    });

    render(<PathPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Plan version unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("kept this saved plan unchanged");
    expect(screen.queryByRole("link", { name: /rebuild/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your precise path." })).not.toBeInTheDocument();
  });
});
