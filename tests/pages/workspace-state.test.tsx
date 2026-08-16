import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProofPage from "../../app/proof/page";
import StackPage from "../../app/stack/page";
import { createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";
import PathPage from "../../app/path/page";
import TodayPage from "../../app/today/page";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";

const { usePlanningWorkspace } = vi.hoisted(() => ({ usePlanningWorkspace: vi.fn(() => ({ workspace: null, source: "local", migration: "none", recovery: "none", generate: vi.fn(), record: vi.fn(), accept: vi.fn(), discard: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), retry: vi.fn() })) }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));

beforeEach(() => {
  window.localStorage.clear();
  usePlanningWorkspace.mockReset();
  usePlanningWorkspace.mockReturnValue({ workspace: null, source: "local", migration: "none", recovery: "none", generate: vi.fn(), record: vi.fn(), accept: vi.fn(), discard: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), retry: vi.fn() });
});
afterEach(cleanup);

const customSetup = {
  roleId: "数据产品经理",
  level: "advanced" as const,
  weeklyMinutes: 90,
  targetWeeks: 10,
};

function adaptiveWorkspace() {
  const audit = { id: "audit-page", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-page-fingerprint" };
  const availability = { id: "availability-page", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC", weekdays: { monday: 180, tuesday: 180, wednesday: 180, thursday: 180, friday: 180, saturday: 180, sunday: 180 }, exceptions: [], weeklyMinutes: 1260, inputFingerprint: "availability-page-fingerprint" };
  const target = { id: "target-page", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-page-fingerprint" };
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" }).fullScope;
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-page", goalId: "goal-page", revision: 0, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [], activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
}

describe("personalized workspace state", () => {
  it.each([["Today", TodayPage], ["Path", PathPage]])("renders the strict adaptive Flagship surface on %s", async (page, Page) => {
    const workspace = adaptiveWorkspace();
    saveDemoState(createDemoState());
    usePlanningWorkspace.mockReturnValue({ workspace, source: "local", migration: "none", recovery: "none", generate: vi.fn(), record: vi.fn(), accept: vi.fn(), discard: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), retry: vi.fn() } as never);

    render(<Page />);

    if (page === "Today") {
      expect(await screen.findByText(/Today · 2026-08-14 · Primary outcome/)).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "Seven consecutive learning days" })).toBeInTheDocument();
    } else {
      expect(await screen.findByRole("list", { name: "Ordered learning path" })).toBeInTheDocument();
    }
    expect(usePlanningWorkspace).toHaveBeenCalled();
  });

  it.each([["Today", TodayPage], ["Path", PathPage]])("does not instantiate adaptive planning for a custom role on %s", async (_, Page) => {
    usePlanningWorkspace.mockClear();
    saveDemoState(mergeSetup(createDemoState(), customSetup));
    render(<Page />);
    await waitFor(() => expect(screen.getByTitle("数据产品经理 · 10 weeks")).toBeInTheDocument());
    expect(usePlanningWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    ["Stack", StackPage],
    ["Proof", ProofPage],
  ])("restores the custom role consistently on %s", async (_, Page) => {
    saveDemoState(mergeSetup(createDemoState(), customSetup));
    render(<Page />);

    expect(screen.getByRole("status")).toHaveTextContent("Restoring your plan");
    expect(screen.queryByText(/18 weeks/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 weeks")).toBeInTheDocument();
      expect(screen.getByText(/当前内容使用 AI 原生全栈旗舰样本/)).toBeInTheDocument();
      expect(screen.getByText(/Product Intelligence 后续研究并替换/)).toBeInTheDocument();
    });
  });
});
