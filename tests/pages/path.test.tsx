import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
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
vi.mock("../../app/lib/use-arc-state", async (original) => {
  const actual = await original<typeof import("../../app/lib/use-arc-state")>();
  return { ...actual, useArcState: () => actual.useArcState({ useSession: () => ({ data: null, isPending: false }) }) };
});
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <span>Account</span> }));

vi.mock("../../app/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "local-owner", name: "Learner", email: "learner@example.test" } }, isPending: false }) },
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

function useDecisionController() {
  const [workspace, setWorkspace] = useState(() => pendingWorkspace());
  return {
    ...emptyPlanningController(),
    workspace,
    accept: async (candidatePlanVersionId: string) => {
      const transition = applyPlanningEvent({
        workspace,
        blueprint: flagshipBlueprint,
        registry: flagshipUnitRegistry,
        event: {
          eventId: "event-path-accept",
          mutationId: "mutation-path-accept",
          sequence: workspace.lastSequence + 1,
          targetPlanVersionId: workspace.activePlanVersionId,
          occurredAt: "2026-08-14T11:00:00.000Z",
          kind: "replan_accepted",
          candidatePlanVersionId,
        },
      });
      setWorkspace(transition.workspace);
      return true;
    },
  };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/path");
  window.localStorage.clear();
  usePlanningWorkspace.mockReset();
  usePlanningWorkspace.mockReturnValue(emptyPlanningController());
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("PathPage", () => {
  it.each(["legacy", "adaptive"].flatMap(flow => [
    { flow, destination: "/stack?skill=research-basics#sources", label: "Continue to skills and resources" },
    { flow, destination: "/proof?compose=1&unit=old-unit&returnTo=%2Ftoday#draft", label: "Continue to your proof" },
    { flow, destination: "/coach?returnTo=%2Fpath#question", label: "Continue planning" },
  ]))("keeps the $flow route overview and offers explicit continuation to $destination", async ({ flow, destination, label }) => {
    window.history.replaceState(null, "", `/path?created=1&returnTo=${encodeURIComponent(destination)}`);
    if (flow === "adaptive") usePlanningWorkspace.mockReturnValue({ ...emptyPlanningController(), workspace: pendingWorkspace() });
    const page = render(<PathPage />);
    expect(await screen.findByRole("heading", { name: "Learning path" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Adjust your plan" })).toHaveAttribute("href", "/coach?returnTo=%2Fpath");
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", destination);
    expect(screen.getByRole("link", { name: "Continue today’s task ↗" })).toHaveAttribute("href", "/today");
    expect(window.location.pathname).toBe("/path");
    page.unmount();
    render(<PathPage />);
    expect(await screen.findByRole("link", { name: label })).toHaveAttribute("href", destination);
  });

  it.each(["//outside.example", "/proof?returnTo=%2Fsign-in"])("does not offer unsafe completion destinations %s", async (destination) => {
    window.history.replaceState(null, "", `/path?created=1&returnTo=${encodeURIComponent(destination)}`);
    render(<PathPage />);
    expect(await screen.findByText(/Your path is ready/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Continue to skills and resources|Continue to your proof|Continue planning|Back to previous page/ })).not.toBeInTheDocument();
  });

  it("shows the complete 18-week route in four editorial phases", async () => {
    render(<PathPage />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByText(/18 weeks/)).not.toBeInTheDocument();

    const heading = await screen.findByRole("heading", { name: "Learning path" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("AI-Native Full-Stack Engineer · 18 weeks · 420 min per week")).toBeInTheDocument();
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

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByText(/18 weeks/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("数据产品经理 · 10 weeks · 90 min per week")).toBeInTheDocument();
    });
    expect(screen.getByText(/This path currently uses the AI-native full-stack sample/)).toBeInTheDocument();
    expect(screen.getByText(/Role research will replace it/)).toBeInTheDocument();

    expect(usePlanningWorkspace).toHaveBeenCalled();
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

    expect(await screen.findByRole("heading", { name: "Learning path" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What will change" })).toBeInTheDocument();
    expect(screen.getByText(`${flagshipBlueprint.name} · 12 weeks`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep current schedule" }));
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it("shows a truthful fail-closed boundary when the stored catalogue version cannot load", async () => {
    usePlanningWorkspace.mockReturnValue({
      ...emptyPlanningController(),
      source: "offline-cloud",
      recovery: "version-unavailable",
    });

    render(<PathPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("This plan is temporarily unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("Your plan and learning history are preserved");
    expect(screen.queryByRole("link", { name: /rebuild/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Learning path" })).not.toBeInTheDocument();
  });

  it.each([
    ["restoring", "none"],
    ["offline-cloud", "unavailable"],
  ] as const)("fails closed while adaptive cloud state is %s", async (source, recovery) => {
    const retry = vi.fn();
    usePlanningWorkspace.mockReturnValue({
      ...emptyPlanningController(),
      source,
      recovery,
      retry,
    });

    render(<PathPage />);

    expect(await screen.findByText(source === "restoring" ? "Loading your learning content…" : "Learning plan unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Learning path" })).not.toBeInTheDocument();
    if (source === "offline-cloud") {
      await userEvent.click(screen.getByRole("button", { name: /Reload plan/ }));
      expect(retry).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps the decision announcement mounted after the pending diff is accepted", async () => {
    usePlanningWorkspace.mockImplementation(useDecisionController);
    const user = userEvent.setup();

    render(<PathPage />);
    await user.click(await screen.findByRole("button", { name: "Accept new schedule" }));

    expect(await screen.findByRole("status")).toHaveTextContent("New schedule accepted");
    expect(screen.queryByRole("heading", { name: "What will change" })).not.toBeInTheDocument();
  });
});
