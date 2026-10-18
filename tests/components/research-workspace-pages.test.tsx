import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLayoutEffect } from "react";
import PathPage from "../../app/path/page";
import TodayPage from "../../app/today/page";
import StackPage from "../../app/stack/page";
import ProofPage from "../../app/proof/page";
import SetupPage from "../../app/setup/page";
import type { PlanningClient } from "../../app/lib/planning-client";
import type { ArcCloudClient } from "../../app/lib/cloud-client";
import type { PlanningRepository, PlanningRepositoryPayload } from "../../app/server/planning/repository";
import type { PlanningWorkspace } from "../../app/contracts/planning";
import { PlanningService } from "../../app/server/planning/service";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createDemoState, mergeSetup } from "../../app/lib/demo-store";
import { proofSelectableDailyUnits } from "../../app/lib/workspace-presentation";

const injected = vi.hoisted(() => ({
  owner: "owner-a" as string | null, pending: false, planningClient: {} as PlanningClient,
  loadProof: vi.fn(async () => null),
  arcClient: {} as ArcCloudClient,
  navigate: vi.fn(),
}));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: injected.owner ? { user: { id: injected.owner, name: "Learner", email: "learner@example.test" } } : null, isPending: injected.pending }) } }));
vi.mock("../../app/lib/use-arc-state", async (original) => {
  const actual = await original<typeof import("../../app/lib/use-arc-state")>();
  return { ...actual, useArcState: () => actual.useArcState({ client: injected.arcClient }) };
});
vi.mock("../../app/lib/use-planning-workspace", async (original) => {
  const actual = await original<typeof import("../../app/lib/use-planning-workspace")>();
  return { ...actual, usePlanningWorkspace: (options: Parameters<typeof actual.usePlanningWorkspace>[0]) => actual.usePlanningWorkspace({ ...options, client: injected.planningClient }) };
});
vi.mock("../../app/lib/use-proof-ledger", async (original) => {
  const actual = await original<typeof import("../../app/lib/use-proof-ledger")>();
  return { ...actual, useProofLedger: (options: Parameters<typeof actual.useProofLedger>[0]) => actual.useProofLedger({ ...options, client: { loadWorkspace: injected.loadProof, createProof: vi.fn(), reviseProof: vi.fn(), withdrawProof: vi.fn(), setVisibility: vi.fn() } }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: injected.navigate }) }));
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <span>Account</span> }));

const validation = validateResearchCandidate(validResearchCandidate, validAnnotations, {
  packageId: "research-package-pages", blueprintVersion: "2026.08.1", registryVersion: "2026.08.2", templateVersion: "2026.08.3",
  promptVersion: "research-prompt-v1", inputSchemaVersion: "research-input-v1", outputSchemaVersion: "research-output-v1", qualityVersion: "research-quality-v1", modelConfigVersion: "research-model-v1", observedAt: "2026-09-01", expiresAt: "2026-09-30",
});
if (!validation.ready) throw new Error("Research fixture must pass domain validation");
const data = validation.package;
const today = () => new Date().toISOString().slice(0, 10);
let service: PlanningService;
let initial: PlanningWorkspace;
let clearPlanningForSetup: () => void;

beforeEach(async () => {
  localStorage.clear(); injected.owner = "owner-a"; injected.pending = false; injected.loadProof.mockReset().mockResolvedValue(null); injected.navigate.mockReset();
  const snapshot = { state: mergeSetup(createDemoState(), { roleId: data.blueprint.name, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 }), activeGoalId: "goal-pages", revision: "revision-pages" };
  injected.arcClient = { loadWorkspace: vi.fn(async () => snapshot), importLocal: vi.fn(), saveSetup: vi.fn(async (setup) => ({ ...snapshot, state: mergeSetup(snapshot.state, setup) })), completeUnit: vi.fn(), replay: vi.fn() };
  let stored: PlanningRepositoryPayload | null = null;
  const mutations = new Map<string, PlanningRepositoryPayload>();
  clearPlanningForSetup = () => { stored = null; mutations.clear(); };
  const save: PlanningRepository["saveEvent"] = async (command) => {
    stored = { ownerId: command.ownerId, goalId: command.goalId, payload: command.result.workspace, sourceReference: command.sourceReference };
    const result = { ...stored, payload: command.result }; mutations.set(command.mutationId, result); return structuredClone(result);
  };
  const repository: PlanningRepository = {
    findActiveGoal: async (ownerId) => ({ ownerId, goalId: "goal-pages" }),
    load: async () => structuredClone(stored), findMutation: async ({ mutationId }) => structuredClone(mutations.get(mutationId) ?? null), saveGeneration: save, saveEvent: save,
  };
  const sourceResolver = new PlanningSourceResolver({ intelligence: { getPublished: vi.fn() }, flagshipRegistry: {}, researchRepository: {
    getRun: async () => ({ id: "research-run-pages", ownerId: "owner-a", state: "ready", packageId: data.id, configFingerprint: "config-pages" }),
    resolveReadyPackage: async () => data,
  }, replayPackageReader: { resolveLockedPackage: async () => data } });
  let nextId = 0;
  service = new PlanningService({ repository, sourceResolver, createId: () => `workspace-pages-${++nextId}` });
  initial = (await service.generate("owner-a", {
    mutationId: "mutation-page-generation", source: { source: "research", researchRunId: "research-run-pages" }, planningDate: today(),
    audit: { id: "audit-pages", schemaVersion: "2026.08.1", blueprintId: data.blueprint.id, blueprintVersion: data.blueprint.version, answers: data.blueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen", evidenceRefs: [] })), evidence: [], createdBy: "learner", inputFingerprint: "audit-page-fingerprint" },
    availability: { id: "availability-pages", schemaVersion: "2026.08.1", timeZone: "UTC", weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-page-fingerprint" },
    target: { id: "target-pages", schemaVersion: "2026.08.1", targetWeeks: 18, inputFingerprint: "target-page-fingerprint" }, selectedScope: "full-scope",
  })).workspace;
  injected.planningClient = {
    loadWorkspace: vi.fn(() => service.getWorkspaceResponse("owner-a")), generate: vi.fn((input) => service.generateResponse("owner-a", input)),
    appendEvent: vi.fn((input) => service.appendEventResponse("owner-a", input)), acceptReplan: vi.fn((input) => service.acceptReplanResponse("owner-a", input)), discardReplan: vi.fn((input) => service.discardReplanResponse("owner-a", input)),
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function noFlagship() { expect(screen.queryByText(/AI-Native Full-Stack Engineer|AI 原生全栈旗舰样本|Web platform|Typed service boundary/i)).not.toBeInTheDocument(); }
async function headingReady() { await screen.findByTitle(`${data.blueprint.name} · 18 weeks`); noFlagship(); }

describe("research workspace page adapters with real controllers and deterministic service", () => {
  function researchReply() { return Response.json({ requestId: "request-research-pages", run: { id: "research-run-pages", role: data.blueprint.name, locale: "en-US", state: "ready", retryable: false, packageId: data.id, summary: data.blueprint.summary, skillCount: data.blueprint.skills.length, sourceCount: data.sourceEvidence.length, observedAt: data.observedAt, quality: { passed: true, issueCodes: [] }, planningData: { id: data.id, blueprint: data.blueprint, registry: data.registry } } }); }
  function storedResearch() { localStorage.setItem("arc:role-research:v1", JSON.stringify({ runId: "research-run-pages", role: data.blueprint.name, locale: "en-US" })); }
  it.each(["account", "roundtrip", "unmount"].flatMap((transition) => ["resolve", "reject"].map((settlement) => ({ transition, settlement }))))("drops common-role save $settlement after $transition invalidates the connector", async ({ transition, settlement }) => {
    clearPlanningForSetup();
    storedResearch(); const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (input) => String(input).endsWith("/eligibility") ? Response.json({ eligible: false, requestId: "request-eligibility" }) : researchReply()));
    let rejectSave!: (error: unknown) => void;
    let resolveSave!: (snapshot: Awaited<ReturnType<ArcCloudClient["saveSetup"]>>) => void;
    injected.arcClient.saveSetup = vi.fn(() => new Promise<Awaited<ReturnType<ArcCloudClient["saveSetup"]>>>((resolve, reject) => { resolveSave = resolve; rejectSave = reject; }));
    const page = render(<SetupPage />);
    await user.click(await screen.findByRole("button", { name: "Use this research" }));
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await waitFor(() => expect(injected.arcClient.saveSetup).toHaveBeenCalledOnce());
    if (transition === "unmount") page.unmount();
    else {
      injected.owner = "owner-b"; page.rerender(<SetupPage />);
      if (transition === "roundtrip") { injected.owner = "owner-a"; page.rerender(<SetupPage />); }
    }
    await act(async () => {
      if (settlement === "resolve") resolveSave({ state: mergeSetup(createDemoState(), { roleId: data.blueprint.name, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 }), activeGoalId: "goal-pages", revision: "revision-pages" });
      else rejectSave(new Error("synthetic-offline"));
    });
    expect(injected.planningClient.generate).not.toHaveBeenCalled();
    expect(injected.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull();
    expect(vi.mocked(injected.arcClient.saveSetup).mock.calls[0]![2]?.aborted).toBe(true);
  });
  it("restores an owner Ready run while ineligible and saves its actual role before submitting only source plus answers", async () => {
    clearPlanningForSetup();
    storedResearch(); const user = userEvent.setup();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/eligibility") ? Response.json({ eligible: false, requestId: "request-eligibility" }) : researchReply());
    vi.stubGlobal("fetch", fetcher);
    render(<SetupPage />);
    await user.click(await screen.findByRole("button", { name: "Use this research" }));
    expect(screen.getByRole("group", { name: `${data.blueprint.skills[0]!.name} self-assessment` })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Web Platform self-assessment" })).not.toBeInTheDocument();
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await waitFor(() => expect(injected.planningClient.generate).toHaveBeenCalledOnce());
    expect(injected.arcClient.saveSetup).toHaveBeenCalledWith(expect.objectContaining({ roleId: data.blueprint.name }), expect.any(String), expect.any(AbortSignal), "research-setup");
    expect(vi.mocked(injected.arcClient.saveSetup).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(injected.planningClient.generate).mock.invocationCallOrder[0]!);
    await waitFor(() => expect(injected.navigate).toHaveBeenCalledWith("/path"));
    const request = vi.mocked(injected.planningClient.generate).mock.calls[0]![0];
    expect(request).toMatchObject({ source: { source: "research", researchRunId: "research-run-pages" }, audit: { blueprintId: data.blueprint.id } });
    expect(Object.keys(request).sort()).toEqual(["audit", "availability", "mutationId", "planningDate", "selectedScope", "source", "target"]);
    expect(fetcher.mock.calls.every(([url]) => String(url).endsWith("/eligibility") || String(url).endsWith("/research-run-pages"))).toBe(true);
  });
  it("clears prior owner recovery on a live Setup account transition without requesting that run as the next owner", async () => {
    storedResearch(); const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/eligibility") ? Response.json({ eligible: false, requestId: "request-eligibility" }) : researchReply());
    vi.stubGlobal("fetch", fetcher); const page = render(<SetupPage />); await screen.findByRole("button", { name: "Use this research" });
    fetcher.mockClear(); injected.owner = "owner-b"; page.rerender(<SetupPage />);
    expect(screen.queryByRole("button", { name: "Use this research" })).not.toBeInTheDocument();
    await act(async () => {});
    expect(localStorage.getItem("arc:role-research:v1")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/research-run-pages"))).toBe(false);
  });
  it("starts Research explicitly and suspends its polling when the learner continues with legacy setup", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/eligibility")
      ? Response.json({ eligible: true, requestId: "request-eligibility" })
      : Response.json({ requestId: "request-active", run: { id: "research-run-pages", role: data.blueprint.name, locale: "en-US", state: "researching", retryable: false } }));
    vi.stubGlobal("fetch", fetcher); render(<SetupPage />);
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("Custom role"), { target: { value: data.blueprint.name } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Research this role" }));
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent("Researching role skills and sources");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const count = fetcher.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(fetcher).toHaveBeenCalledTimes(count);
    expect(screen.getByRole("heading", { name: "你现在处于哪个阶段？" })).toBeInTheDocument();
  });
  it("restores researched phase and unit content on Path in a fresh controller with empty research storage", async () => {
    const first = render(<PathPage />); await headingReady();
    expect(screen.getByRole("heading", { name: data.blueprint.phases[0]!.name })).toBeInTheDocument();
    expect(screen.getAllByText(data.registry.tracks[0]!.templates[0]!.title).length).toBeGreaterThan(0);
    first.unmount(); localStorage.clear(); render(<PathPage />); await headingReady();
    expect(injected.planningClient.loadWorkspace).toHaveBeenCalledTimes(2); expect(localStorage.getItem("arc:role-research:v1")).toBeNull();
  });
  it("uses research steps, minutes and resources in Today, then completes a unit usable in Proof and Stack", async () => {
    const user = userEvent.setup(); const page = render(<TodayPage />); await headingReady();
    const unit = initial.dailyUnits.find((unit) => unit.scheduledDate === today())!;
    expect(screen.getByRole("heading", { level: 1, name: unit.objective })).toBeInTheDocument();
    for (const step of unit.steps) { expect(screen.getByText(step.label)).toBeInTheDocument(); expect(screen.getAllByText(`${step.minutes} min`).length).toBeGreaterThan(0); }
    expect(screen.getByText(String(unit.estimatedMinutes), { selector: ".today-duration strong" })).toBeInTheDocument();
    const resource = data.blueprint.resources.find(({ id }) => id === unit.primaryResourceId)!;
    expect(screen.getByRole("link", { name: resource.title })).toHaveAttribute("href", resource.url);
    for (const checkbox of screen.getAllByRole("checkbox")) await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(injected.planningClient.appendEvent).toHaveBeenCalledOnce());
    await waitFor(async () => expect((await service.getWorkspace("owner-a"))!.events.some((event) => event.kind === "completed")).toBe(true));
    page.unmount(); const proof = render(<ProofPage />); await headingReady();
    expect(screen.getByRole("option", { name: data.blueprint.skills[0]!.name })).toHaveValue(unit.skillId);
    expect(within(screen.getByRole("combobox", { name: "Linked Daily Unit" })).getAllByRole("option").find((option) => option.getAttribute("value") === unit.id)).toHaveTextContent(unit.objective);
    proof.unmount(); render(<StackPage />); await headingReady();
    expect(screen.getByRole("heading", { name: data.blueprint.skills[0]!.name })).toBeInTheDocument();
    expect(screen.getAllByText("Practicing").length).toBeGreaterThan(0);
  });
  it("keeps and accepts researched replan candidates through Today and a fresh Path controller", async () => {
    const user = userEvent.setup(); const page = render(<TodayPage />); await headingReady();
    await user.click(screen.getByRole("button", { name: "Delay" }));
    await user.click(await screen.findByRole("button", { name: "Keep current plan" }));
    await waitFor(() => expect(injected.planningClient.discardReplan).toHaveBeenCalledOnce());
    await expect(vi.mocked(injected.planningClient.discardReplan).mock.results[0]!.value).resolves.toHaveProperty("result");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Keep current plan" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Delay" }));
    await screen.findByRole("button", { name: "Accept new plan" });
    page.unmount(); render(<PathPage />); await headingReady();
    await user.click(await screen.findByRole("button", { name: "Accept new plan" }));
    await screen.findByText("Candidate plan accepted.");
    expect(injected.planningClient.acceptReplan).toHaveBeenCalledOnce();
    const updated = (await service.getWorkspace("owner-a"))!; expect(updated.activePlanVersionId).not.toBe(initial.activePlanVersionId); noFlagship();
  });
  it("selects completed historical units only through matching workspace plan and completion event", async () => {
    const unit = initial.dailyUnits[0]!;
    const completed = (await service.appendEvent("owner-a", { mutationId: "mutation-historical", baseVersionId: initial.activePlanVersionId, event: { kind: "completed", unitId: unit.id, planningDate: today(), actualMinutes: null } })).workspace;
    expect(unit.planVersionId).not.toBe(completed.activePlanVersionId);
    expect(proofSelectableDailyUnits(completed).some(({ id }) => id === unit.id)).toBe(true);
    const noCompletion = { ...completed, events: [] };
    expect(proofSelectableDailyUnits(noCompletion).some(({ id }) => id === unit.id)).toBe(false);
    const wrongPlan = { ...completed, events: completed.events.map((event) => ({ ...event, targetPlanVersionId: "foreign-plan" })) };
    expect(proofSelectableDailyUnits(wrongPlan).some(({ id }) => id === unit.id)).toBe(false);
    expect(new Set(proofSelectableDailyUnits(completed).map(({ id }) => id)).size).toBe(proofSelectableDailyUnits(completed).length);
  });
  it.each([PathPage, TodayPage, StackPage, ProofPage])("fails closed on missing research source context", async (Page) => {
    injected.planningClient.loadWorkspace = vi.fn(async () => ({ workspace: initial, sourceContext: null }));
    render(<Page />); await waitFor(() => expect(screen.getByText(/version|unavailable|could not/i)).toBeInTheDocument());
    expect(screen.queryByText(data.blueprint.name)).not.toBeInTheDocument(); noFlagship();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
  it.each([PathPage, TodayPage, StackPage, ProofPage])("fails closed on mismatched research registry context", async (Page) => {
    const response = await service.getWorkspaceResponse("owner-a");
    injected.planningClient.loadWorkspace = vi.fn(async () => ({ workspace: initial, sourceContext: { ...response.sourceContext!, registry: { ...data.registry, version: "2026.08.999" } } }));
    render(<Page />); await waitFor(() => expect(screen.getByText(/version|unavailable|could not/i)).toBeInTheDocument());
    expect(screen.queryByText(data.blueprint.name)).not.toBeInTheDocument(); noFlagship();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
  it.each([PathPage, TodayPage, StackPage, ProofPage].flatMap((Page) => ["owner-b", null].map((owner) => ({ Page, owner }))))("masks old account source content on the first committed transition to $owner", async ({ Page, owner }) => {
    const seen: string[] = [];
    function Observe({ identity }: { identity: string | null }) { useLayoutEffect(() => { seen.push(document.body.textContent ?? ""); }, [identity]); return <Page />; }
    const page = render(<Observe identity="owner-a" />); await headingReady();
    injected.planningClient.loadWorkspace = vi.fn(() => new Promise<never>(() => {})); injected.loadProof.mockImplementation(() => new Promise<never>(() => {}));
    injected.arcClient.loadWorkspace = vi.fn(() => new Promise<never>(() => {}));
    injected.owner = owner; page.rerender(<Observe identity={owner} />);
    expect(seen.at(-1)).not.toContain(data.blueprint.name);
    expect(seen.at(-1)).not.toContain(data.blueprint.skills[0]!.name);
    expect(screen.queryByTitle(`${data.blueprint.name} · 18 weeks`)).not.toBeInTheDocument();
    expect(screen.queryByText(data.blueprint.summary)).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: data.blueprint.skills[0]!.name })).not.toBeInTheDocument(); noFlagship();
  });
});
