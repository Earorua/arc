import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StackPage from "../../app/stack/page";
import { createDemoState } from "../../app/lib/demo-store";
import { PLANNING_SCHEMA_VERSION, planningWorkspaceSchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { buildPlanVersion } from "../../app/lib/planning/scheduler";
import { proofResultFixture } from "../fixtures/proof-ledger";
import type { ProofLedgerWorkspace } from "../../app/contracts/proof-ledger";

const injected = vi.hoisted(() => ({ planning: vi.fn(), loadProofs: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: "owner", name: "Learner", email: "learner@example.test" } }, isPending: false }) } }));
vi.mock("../../app/lib/use-arc-state", () => ({ useArcState: () => ({ state: createDemoState(), source: "cloud", recovery: "none" }) }));
vi.mock("../../app/lib/use-planning-workspace", () => ({ usePlanningWorkspace: injected.planning }));
vi.mock("../../app/lib/proof-client", () => ({ proofClient: { loadWorkspace: injected.loadProofs } }));
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <span>账号</span> }));

function planningWorkspace() {
  const audit = { id: "audit-stack", schemaVersion: PLANNING_SCHEMA_VERSION, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-stack-fingerprint" };
  const availability = { id: "availability-stack", schemaVersion: PLANNING_SCHEMA_VERSION, timeZone: "UTC", weekdays: { monday: 180, tuesday: 180, wednesday: 180, thursday: 180, friday: 180, saturday: 180, sunday: 180 }, exceptions: [], weeklyMinutes: 1260, inputFingerprint: "availability-stack-fingerprint" };
  const target = { id: "target-stack", schemaVersion: PLANNING_SCHEMA_VERSION, targetWeeks: 18, inputFingerprint: "target-stack-fingerprint" };
  const path = buildLearningPaths({ blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit, availability, target, planningDate: "2026-08-14" }).fullScope;
  const built = buildPlanVersion({ path, registry: flagshipUnitRegistry, availability, planningDate: "2026-08-14", generation: "initial", baseVersionId: null, replanReason: null, completedUnitIds: new Set() });
  return planningWorkspaceSchema.parse({ id: "workspace-stack", goalId: "goal-stack", revision: 0, lastSequence: 0, audit, availability, availabilityVersions: [availability], target, pathVersions: [path], planVersions: [built.plan], dailyUnits: built.dailyUnits, events: [], activePathVersionId: path.id, activePlanVersionId: built.plan.id, pendingPlanVersionId: null });
}

const storageKey = "arc:stack-return:v1:user:owner:goal-stack";
beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/stack?scope=all&category=quality&q=testing&skill=testing");
  injected.loadProofs.mockReset().mockResolvedValue(proofResultFixture().workspace);
  injected.planning.mockReturnValue({ workspace: planningWorkspace(), source: "cloud", recovery: "none" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function leaveViaEvidence() {
  const first = render(<StackPage />);
  await screen.findByRole("link", { name: "补充作品证明" });
  screen.getByRole("list", { name: "技能索引" }).scrollTop = 72;
  fireEvent.click(screen.getByText("技能要求与学习记录"));
  const evidence = screen.getByRole("link", { name: "Architecture map" });
  evidence.addEventListener("click", (event) => event.preventDefault(), { once: true });
  fireEvent.click(evidence);
  expect(sessionStorage.getItem(storageKey)).not.toBeNull();
  first.unmount();
}

describe("Stack restoration while the proof ledger loads", () => {
  it("waits for delayed evidence before restoring its disclosure, focus and position", async () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(320);
    await leaveViaEvidence();
    let finish!: (workspace: ProofLedgerWorkspace) => void;
    injected.loadProofs.mockReturnValueOnce(new Promise<ProofLedgerWorkspace>((resolve) => { finish = resolve; }));
    render(<StackPage />);
    await waitFor(() => expect(injected.loadProofs).toHaveBeenCalledTimes(2));
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Automated Testing" })).not.toHaveFocus();
    expect(sessionStorage.getItem(storageKey)).not.toBeNull();

    await act(async () => finish(proofResultFixture().workspace));
    expect(screen.getByRole("link", { name: "Architecture map" })).toHaveFocus();
    expect(screen.getByRole("list", { name: "技能索引" }).scrollTop).toBe(72);
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 320 });
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("uses the original skill fallback once a delayed evidence load fails", async () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(240);
    await leaveViaEvidence();
    let fail!: (error: Error) => void;
    injected.loadProofs.mockReturnValueOnce(new Promise<ProofLedgerWorkspace>((_, reject) => { fail = reject; }));
    render(<StackPage />);
    await waitFor(() => expect(injected.loadProofs).toHaveBeenCalledTimes(2));
    expect(scroll).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(storageKey)).not.toBeNull();

    await act(async () => fail(new Error("Proof service unavailable")));
    expect(screen.getByRole("heading", { name: "Automated Testing" })).toHaveFocus();
    expect(screen.getByText("云端作品状态暂不可用；这里只展示能够安全读取的技能证据。")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "技能索引" }).scrollTop).toBe(72);
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 240 });
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
});
