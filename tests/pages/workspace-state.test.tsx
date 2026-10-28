import { fireEvent, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("../../app/lib/use-arc-state", async (original) => {
  const actual = await original<typeof import("../../app/lib/use-arc-state")>();
  return { ...actual, useArcState: () => actual.useArcState({ useSession: () => ({ data: null, isPending: false }) }) };
});
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <span>账号</span> }));
vi.mock("../../app/lib/use-proof-ledger", async (original) => {
  const actual = await original<typeof import("../../app/lib/use-proof-ledger")>();
  return { ...actual, useProofLedger: (options: Parameters<typeof actual.useProofLedger>[0]) => actual.useProofLedger({ ...options, useSession: () => ({ data: null, isPending: false }) }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => window.location.pathname }));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "local-owner", name: "Learner", email: "learner@example.test" } }, isPending: false }) },
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
    const currentUtcDate = new Date().toISOString().slice(0, 10);
    saveDemoState(createDemoState());
    usePlanningWorkspace.mockReturnValue({ workspace, source: "local", migration: "none", recovery: "none", generate: vi.fn(), record: vi.fn(), accept: vi.fn(), discard: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), retry: vi.fn() } as never);

    render(<Page />);

    if (page === "Today") {
      expect(await screen.findByText(`今日 · ${currentUtcDate} · 主要任务`)).toBeInTheDocument();
      fireEvent.click(screen.getByText("查看本周安排"));
      expect(screen.getByRole("list", { name: "连续七日学习安排" })).toBeInTheDocument();
    } else {
      expect(await screen.findByRole("list", { name: "学习阶段" })).toBeInTheDocument();
    }
    expect(usePlanningWorkspace).toHaveBeenCalled();
  });

  it.each([["Today", TodayPage], ["Path", PathPage]])("retains the local legacy presentation after planning resolution for a custom role on %s", async (_, Page) => {
    usePlanningWorkspace.mockClear();
    saveDemoState(mergeSetup(createDemoState(), customSetup));
    render(<Page />);
    await waitFor(() => expect(screen.getByTitle("数据产品经理 · 10 周")).toBeInTheDocument());
    expect(usePlanningWorkspace).toHaveBeenCalled();
  });

  it("keeps device-only role details out of a Stack account with no saved plan", async () => {
    saveDemoState(mergeSetup(createDemoState(), customSetup));
    render(<StackPage />);
    expect(await screen.findByText("创建学习路线后，即可查看保存到当前账户的技能和来源。")).toBeInTheDocument();
    expect(screen.queryByText("数据产品经理 · 10 周")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Web Platform" })).not.toBeInTheDocument();
    expect(usePlanningWorkspace).toHaveBeenCalled();
  });

  it("restores the custom role consistently on Proof", async () => {
    saveDemoState(mergeSetup(createDemoState(), customSetup));
    render(<ProofPage />);

    expect(screen.getByRole("status")).toHaveTextContent("正在恢复你的学习计划");
    expect(screen.queryByText(/18 weeks/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 周")).toBeInTheDocument();
      expect(screen.getByText(/当前内容使用 AI 原生全栈旗舰样本/)).toBeInTheDocument();
      expect(screen.getByText(/Product Intelligence 后续研究并替换/)).toBeInTheDocument();
    });

  });

  it("offers only Daily Units from the active plan when linking proof", async () => {
    const initial = adaptiveWorkspace();
    const replanned = {
      plan: {
        ...initial.planVersions[0]!, id: "plan-active-two", generation: "automatic" as const,
        baseVersionId: initial.activePlanVersionId, replanReason: "delayed" as const,
        inputFingerprint: "active-plan-two-fingerprint",
      },
      dailyUnits: initial.dailyUnits.map((unit) => ({ ...unit, planVersionId: "plan-active-two" })),
    };
    const workspace = planningWorkspaceSchema.parse({
      ...initial,
      planVersions: [...initial.planVersions, replanned.plan],
      dailyUnits: [...initial.dailyUnits, ...replanned.dailyUnits],
      activePlanVersionId: replanned.plan.id,
    });
    saveDemoState(createDemoState());
    usePlanningWorkspace.mockReturnValue({ workspace, source: "local", migration: "none", recovery: "none", generate: vi.fn(), record: vi.fn(), accept: vi.fn(), discard: vi.fn(), importLocal: vi.fn(), dismissMigration: vi.fn(), retry: vi.fn() } as never);

    render(<ProofPage />);

    const addProof = await screen.findByRole("button", { name: /添加作品/ });
    await waitFor(() => expect(addProof).toBeEnabled());
    fireEvent.click(addProof);
    const select = await screen.findByLabelText("关联学习单元");
    expect(within(select).getAllByRole("option")).toHaveLength(replanned.dailyUnits.length + 1);
    const firstUnit = replanned.dailyUnits[0]!;
    expect(within(select).getAllByRole("option", {
      name: `${firstUnit.scheduledDate} · ${firstUnit.slot === "primary" ? "主要任务" : "拓展任务"} · ${firstUnit.objective}`,
    })).toHaveLength(1);
  });
});
