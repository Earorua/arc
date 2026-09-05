import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SetupPage from "../../app/setup/page";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipRole } from "../../app/data/flagship-role";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { completeDemoUnit, createDemoState, DEMO_STORAGE_KEY, saveDemoState } from "../../app/lib/demo-store";
import { createLocalPlanningRepository, PLANNING_STORAGE_KEY } from "../../app/lib/planning/local-repository";
import { CloudService } from "../../app/server/cloud/service";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";
import { PlanningService } from "../../app/server/planning/service";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { D1PlanningReplayPackageReader, D1ResearchRepository } from "../../app/server/research/d1-repository";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { createMigrationHandler, createWorkspaceHandlers } from "../../app/server/http/cloud-route-factories";
import { createPlanningGenerateHandler, createPlanningWorkspaceHandler } from "../../app/server/http/planning-route-factories";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchD1, seedUser, type SqliteD1 } from "../helpers/sqlite-d1";

const session = vi.hoisted(() => ({ owner: "owner-a", navigate: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: session.owner, name: "Learner", email: "learner@example.test" } }, isPending: false }) } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: session.navigate }) }));

const validation = validateResearchCandidate(validResearchCandidate, validAnnotations, {
  packageId: "research-package-activation", blueprintVersion: "2026.08.1", registryVersion: "2026.08.2", templateVersion: "2026.08.3",
  promptVersion: "research-prompt-v1", inputSchemaVersion: "research-input-v1", outputSchemaVersion: "research-output-v1", qualityVersion: "research-quality-v1", modelConfigVersion: "research-model-v1", observedAt: "2026-09-01", expiresAt: "2026-09-30",
});
if (!validation.ready) throw new Error("Expected validated research fixture");
const data = validation.package;
const researchRunId = "research-run-activation";
const now = () => new Date("2026-09-05T00:00:00Z");
function guestRequest() {
  return {
    mutationId: "mutation-guest-history", roleId: "ai-native-full-stack-engineer" as const, planningDate: "2026-09-05",
    audit: { id: "audit-history", schemaVersion: "2026.08.1" as const, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner" as const, inputFingerprint: "audit-history" },
    availability: { id: "availability-history", schemaVersion: "2026.08.1" as const, timeZone: "UTC", weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-history" },
    target: { id: "target-history", schemaVersion: "2026.08.1" as const, targetWeeks: 18, inputFingerprint: "target-history" }, selectedScope: "full-scope" as const,
  };
}
type Call = { path: string; method: string; owner: string; signal: AbortSignal | null; body: unknown };
let db: SqliteD1;
let cloud: CloudService;
let planning: PlanningService;
let calls: Call[];
let intercept: ((request: Request) => Promise<Response | null>) | null;
const locksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
function count(table: string) { return (db.database.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count; }

beforeEach(async () => {
  let lockTail: Promise<unknown> = Promise.resolve();
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, _options: unknown, action: () => unknown) => { const result = lockTail.then(action); lockTail = result.catch(() => {}); return result; } } });
  localStorage.clear(); session.owner = "owner-a"; session.navigate.mockReset(); calls = []; intercept = null;
  db = createResearchD1(); seedUser(db, "owner-a"); seedUser(db, "owner-b");
  const d1 = db as unknown as D1Database;
  let id = 0;
  const research = new D1ResearchRepository(d1, { now: () => now().getTime(), createId: () => researchRunId });
  await research.createOrReplay({ ownerId: "owner-a", requestId: "request-activation", mutationId: "mutation-research-activation", rawRole: data.blueprint.name, normalizedRoleKey: "data-product-manager", locale: "en-US", inputFingerprint: "input-activation", configFingerprint: "config-activation", activeExpiresAt: now().getTime() + 60_000 });
  await research.transition({ id: researchRunId, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "researching" });
  await research.transition({ id: researchRunId, ownerId: "owner-a", expectedVersion: 1, from: "researching", to: "validating" });
  await research.saveValidation({ id: researchRunId, ownerId: "owner-a", expectedVersion: 2, result: validation, normalizedRoleKey: "data-product-manager", locale: "en-US", configFingerprint: "config-activation" });
  const sourceResolver = new PlanningSourceResolver({ intelligence: { getPublished: async () => flagshipBlueprint }, flagshipRegistry: flagshipUnitRegistry, researchRepository: research, replayPackageReader: new D1PlanningReplayPackageReader(d1) });
  cloud = new CloudService(new D1CloudRepository(d1, { createId: () => `cloud-activation-${++id}`, now }));
  planning = new PlanningService({ repository: new D1PlanningRepository(d1, { sourceResolver, createId: () => `record-activation-${++id}`, now }), sourceResolver, createId: () => `planning-activation-${++id}`, now });
  const shared = { requireUser: async (headers: Headers) => ({ id: headers.get("x-test-owner")!, name: "Learner", email: "learner@example.test" }), rateLimiter: { reserve: async () => ({ allowed: true, retryAfterSeconds: 0 }) }, recordEvent: async () => {}, createRequestId: () => "request-setup-activation" };
  const workspace = createWorkspaceHandlers({ ...shared, createService: () => cloud });
  const migrate = createMigrationHandler({ ...shared, createService: () => cloud });
  const readPlanning = createPlanningWorkspaceHandler({ ...shared, createService: () => planning });
  const generate = createPlanningGenerateHandler({ ...shared, createService: () => planning });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers); headers.set("x-test-owner", session.owner);
    const request = new Request(new URL(String(input), "http://arc.test"), { ...init, headers });
    const path = new URL(request.url).pathname;
    calls.push({ path, method: request.method, owner: session.owner, signal: init?.signal ?? null, body: init?.body ? JSON.parse(String(init.body)) : null });
    const override = await intercept?.(request); if (override) return override;
    request.signal.throwIfAborted();
    if (path === "/api/workspace") return request.method === "PUT" ? workspace.PUT(request) : workspace.GET(request);
    if (path === "/api/migrations/local-state") return migrate(request);
    if (path === "/api/planning/workspace") return readPlanning(request);
    if (path === "/api/planning/generate") return generate(request);
    if (path.endsWith("/eligibility")) return Response.json({ eligible: true, requestId: "request-eligible" });
    if (path.endsWith(`/${researchRunId}`) && headers.get("x-test-owner") === "owner-a") return Response.json({ requestId: "request-ready", run: { id: researchRunId, role: data.blueprint.name, locale: "en-US", state: "ready", retryable: false, packageId: data.id, summary: data.blueprint.summary, skillCount: data.blueprint.skills.length, sourceCount: data.sourceEvidence.length, observedAt: data.observedAt, quality: { passed: true, issueCodes: [] }, planningData: { id: data.id, blueprint: data.blueprint, registry: data.registry } } });
    throw new Error(`Unexpected local test request ${request.method} ${path}`);
  }));
  localStorage.setItem("arc:role-research:v1", JSON.stringify({ runId: researchRunId, role: data.blueprint.name, locale: "en-US" }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); db.close(); if (locksDescriptor) Object.defineProperty(navigator, "locks", locksDescriptor); else Reflect.deleteProperty(navigator, "locks"); });

async function reachBuild() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Use this research" }));
  for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "Continue" }));
  return user;
}
describe("new Research setup through real clients, routes, services and SQLite", () => {
  it.each(["save", "activation"])("returns a stable 409 for the real atomic %s guard through its authenticated route", async (operation) => {
    const state = createDemoState();
    await cloud.importLocalState("owner-a", { migrationId: "route-guard-original", consent: true, conflictResolution: "reject", state });
    await planning.generate("owner-a", guestRequest());
    const original = await cloud.getWorkspace("owner-a");
    const migrations = count("migration_runs"); const receipts = count("idempotency_records");
    const setup = { ...state.setup, weeklyMinutes: 300 };
    const response = await fetch(operation === "save" ? "/api/workspace" : "/api/migrations/local-state", {
      method: operation === "save" ? "PUT" : "POST",
      body: JSON.stringify(operation === "save"
        ? { mutationId: "route-guard-save", setup, intent: "research-setup" }
        : { migrationId: "route-guard-activation", consent: true, conflictResolution: "reject", state: { ...state, setup }, intent: "research-setup" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "CONFLICT", message: "An active cloud goal already exists.", requestId: "request-setup-activation" } });
    expect(await cloud.getWorkspace("owner-a")).toEqual(original);
    expect(count("migration_runs")).toBe(migrations); expect(count("idempotency_records")).toBe(receipts);
  });
  it.each(["save", "activation"])("replays an accepted guarded %s without writing after an immutable plan is created", async (operation) => {
    const state = createDemoState();
    const activation = { migrationId: "activation-replay-guarded", state, consent: true, conflictResolution: "reject", intent: "research-setup" };
    await cloud.importLocalState("owner-a", activation);
    const save = { mutationId: "save-replay-guarded", setup: state.setup, intent: "research-setup" };
    if (operation === "save") await cloud.saveSetup("owner-a", save);
    await planning.generate("owner-a", guestRequest());
    const original = await cloud.getWorkspace("owner-a");
    const batches = db.batches.length;
    if (operation === "save") await expect(cloud.saveSetup("owner-a", save)).resolves.toMatchObject({ state });
    else await expect(cloud.importLocalState("owner-a", activation)).resolves.toMatchObject({ status: "already-imported" });
    expect(db.batches).toHaveLength(batches);
    expect(await cloud.getWorkspace("owner-a")).toEqual(original);
    expect(count("planning_workspaces")).toBe(1);
  });
  it("keeps legacy saves and imports unchanged while separating Research save receipts", async () => {
    const state = createDemoState();
    await cloud.importLocalState("owner-a", { migrationId: "legacy-original-goal", consent: true, conflictResolution: "reject", state });
    await planning.generate("owner-a", guestRequest());
    const setup = { ...state.setup, weeklyMinutes: 300 };
    await expect(cloud.saveSetup("owner-a", { mutationId: "shared-save-receipt", setup })).resolves.toMatchObject({ state: { setup } });
    const imported = { ...state, setup: { ...setup, weeklyMinutes: 360 } };
    await expect(cloud.importLocalState("owner-a", { migrationId: "legacy-planned-update", consent: true, conflictResolution: "reject", state: imported })).resolves.toMatchObject({ status: "imported" });
    await expect(cloud.saveSetup("owner-a", { mutationId: "shared-save-receipt", setup, intent: "research-setup" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await cloud.getWorkspace("owner-a"))!.state.setup).toEqual(imported.setup);
    expect(db.database.prepare("SELECT scope FROM idempotency_records WHERE mutation_id='shared-save-receipt'").all()).toEqual([{ scope: "setup" }]);
    expect(count("planning_workspaces")).toBe(1);
  });
  it.each(["save", "activation"])("rolls back %s on an ordinary storage fault and returns INTERNAL rather than CONFLICT", async (operation) => {
    const state = createDemoState();
    if (operation === "save") await cloud.importLocalState("owner-a", { migrationId: "storage-fault-goal", consent: true, conflictResolution: "reject", state });
    const original = await cloud.getWorkspace("owner-a");
    const goalCount = count("career_goals"); const profileCount = count("learner_profiles"); const migrationCount = count("migration_runs"); const receiptCount = count("idempotency_records");
    // Fail only after the update/insert has run, exercising real SQLite rollback.
    db.failAtBatchStatement = operation === "save" ? 1 : 2;
    const setup = { ...state.setup, roleId: data.blueprint.name };
    const response = await fetch(operation === "save" ? "/api/workspace" : "/api/migrations/local-state", {
      method: operation === "save" ? "PUT" : "POST",
      body: JSON.stringify(operation === "save"
        ? { mutationId: "storage-fault-save", setup, intent: "research-setup" }
        : { migrationId: "storage-fault-activation", consent: true, conflictResolution: "reject", state: { ...state, setup }, intent: "research-setup" }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "INTERNAL", requestId: "request-setup-activation" } });
    expect(await cloud.getWorkspace("owner-a")).toEqual(original);
    expect(count("career_goals")).toBe(goalCount); expect(count("learner_profiles")).toBe(profileCount);
    expect(count("migration_runs")).toBe(migrationCount); expect(count("idempotency_records")).toBe(receiptCount);
  });
  it.each(["save", "activation"].flatMap((operation) => ["plan", "replacement"].map((race) => ({ operation, race }))))("atomically rejects $operation after a concurrent $race at the batch boundary", async ({ operation, race }) => {
    const state = { ...createDemoState(), setup: { ...createDemoState().setup, roleId: data.blueprint.name } };
    await cloud.importLocalState("owner-a", { migrationId: "migration-before-batch", consent: true, conflictResolution: "reject", state });
    const original = await cloud.getWorkspace("owner-a");
    const batch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (statements) => {
      if (race === "replacement") {
        db.database.prepare("UPDATE career_goals SET active_slot=NULL,status='archived' WHERE user_id=?1 AND active_slot=1").run("owner-a");
        await cloud.importLocalState("owner-a", { migrationId: "migration-racing-goal", consent: true, conflictResolution: "reject", state: createDemoState() });
      }
      await planning.generate("owner-a", guestRequest());
      return batch(statements);
    });
    const setup = { ...state.setup, weeklyMinutes: 300 };
    const command = operation === "save"
      ? cloud.saveSetup("owner-a", { mutationId: "guarded-save-race", setup, intent: "research-setup" })
      : cloud.importLocalState("owner-a", { migrationId: "guarded-activation-race", state: { ...state, setup }, consent: true, conflictResolution: "reject", intent: "research-setup" });
    await expect(command).rejects.toMatchObject({ code: "CONFLICT" });
    expect(count("planning_workspaces")).toBe(1);
    expect(db.database.prepare("SELECT role_id,weekly_minutes FROM career_goals WHERE id=?1").get(original!.activeGoalId)).toMatchObject({ role_id: data.blueprint.name, weekly_minutes: 420 });
    expect(db.database.prepare("SELECT count(*) count FROM idempotency_records WHERE mutation_id='guarded-save-race'").get()).toMatchObject({ count: 0 });
    expect(db.database.prepare("SELECT count(*) count FROM migration_runs WHERE migration_id='guarded-activation-race'").get()).toMatchObject({ count: 0 });
  });
  it("rejects activation atomically when its previously absent goal is created and planned by another tab", async () => {
    const batch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (statements) => {
      await cloud.importLocalState("owner-a", { migrationId: "migration-racing-new-goal", consent: true, conflictResolution: "reject", state: createDemoState() });
      await planning.generate("owner-a", guestRequest());
      return batch(statements);
    });
    await expect(cloud.importLocalState("owner-a", { migrationId: "guarded-new-activation", intent: "research-setup", consent: true, conflictResolution: "reject", state: { ...createDemoState(), setup: { ...createDemoState().setup, roleId: data.blueprint.name } } })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(count("career_goals")).toBe(1); expect(count("learner_profiles")).toBe(1);
    expect(count("planning_workspaces")).toBe(1); expect(count("migration_runs")).toBe(1);
    expect((await cloud.getWorkspace("owner-a"))!.state.setup).toEqual(createDemoState().setup);
  });
  it("preserves an immutable plan when another tab builds after preflight reads empty", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing-empty", consent: true, conflictResolution: "reject", state: createDemoState() });
    const original = await cloud.getWorkspace("owner-a");
    render(<SetupPage />); const user = await reachBuild();
    let raced = false;
    intercept = async (request) => {
      if (!raced && request.url.endsWith("/api/planning/workspace")) {
        raced = true;
        const response = await planning.getWorkspaceResponse("owner-a");
        expect(response.workspace).toBeNull();
        await planning.generate("owner-a", guestRequest());
        return Response.json(response);
      }
      return null;
    };
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await screen.findByText("Arc could not save this plan. Your answers are still editable.");
    expect(raced).toBe(true); expect(count("planning_workspaces")).toBe(1);
    expect(session.navigate).not.toHaveBeenCalled();
    expect((await cloud.getWorkspace("owner-a"))!.state.setup).toEqual(original!.state.setup);
  });
  it("does not enqueue a failed current Research save when the account already has an empty goal", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-empty-goal", consent: true, conflictResolution: "reject", state: createDemoState() });
    render(<SetupPage />); const user = await reachBuild();
    intercept = async (request) => { if (request.method === "PUT") throw new TypeError("synthetic offline"); return null; };
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await screen.findByText("Arc could not save this plan. Your answers are still editable.");
    expect(calls.filter(({ method }) => method === "PUT")).toHaveLength(1);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull();
    expect(count("planning_workspaces")).toBe(0); expect(session.navigate).not.toHaveBeenCalled();
  });
  it.each(["invalid", "wrong-id", "imported-history", "wrong-goal", "failed"])("rejects %s activation without queuing or generating", async (failure) => {
    render(<SetupPage />); const user = await reachBuild();
    intercept = async (request) => {
      if (!request.url.endsWith("/api/migrations/local-state")) return null;
      const input = await request.json() as { migrationId: string };
      if (failure === "failed") throw new TypeError("synthetic offline");
      if (failure === "invalid") return Response.json({ result: { status: "imported" } });
      return Response.json({ result: { migrationId: failure === "wrong-id" ? "activation-other" : input.migrationId, status: "imported", activeGoalId: "goal-absent", importedCompletionCount: failure === "imported-history" ? 1 : 0, importedProofCount: 0, availableResolutions: [] } });
    };
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await screen.findByText("Arc could not save this plan. Your answers are still editable.");
    expect(calls.filter(({ path }) => path === "/api/migrations/local-state")).toHaveLength(1);
    expect(count("career_goals")).toBe(0); expect(count("planning_workspaces")).toBe(0);
    expect(calls.some(({ path }) => path === "/api/planning/generate")).toBe(false);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull(); expect(session.navigate).not.toHaveBeenCalled();
  });
  it.each(["activation", "verification"].flatMap((stage) => ["roundtrip", "unmount"].map((transition) => ({ stage, transition }))))("cancels $stage after $transition without generating or navigating", async ({ stage, transition }) => {
    const page = render(<SetupPage />); const user = await reachBuild();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let paused: Request | null = null;
    intercept = async (request) => {
      if (!paused && (stage === "activation" && request.url.endsWith("/api/migrations/local-state")
        || stage === "verification" && request.url.endsWith("/api/workspace") && count("migration_runs") > 0)) {
        paused = request;
        await gate;
      }
      return null;
    };
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await waitFor(() => expect(paused).not.toBeNull());
    if (transition === "unmount") page.unmount();
    else { session.owner = "owner-b"; page.rerender(<SetupPage />); session.owner = "owner-a"; page.rerender(<SetupPage />); }
    await act(async () => { release(); });
    expect(paused!.signal.aborted).toBe(true);
    expect(count("planning_workspaces")).toBe(0); expect(await cloud.getWorkspace("owner-b")).toBeNull();
    expect(calls.some(({ path }) => path === "/api/planning/generate")).toBe(false);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull(); expect(session.navigate).not.toHaveBeenCalled();
  });
  it("recovers an accepted activation after its response is lost without duplicating the goal or importing device history", async () => {
    render(<SetupPage />); const user = await reachBuild();
    let loseResponse = true;
    intercept = async (request) => {
      if (loseResponse && request.url.endsWith("/api/migrations/local-state")) {
        loseResponse = false;
        await cloud.importLocalState(request.headers.get("x-test-owner")!, await request.json());
        throw new TypeError("synthetic lost response after commit");
      }
      return null;
    };
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await screen.findByText("Arc could not save this plan. Your answers are still editable.");
    expect(count("career_goals")).toBe(1); expect(count("planning_workspaces")).toBe(0);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path"));
    expect(count("career_goals")).toBe(1); expect(count("migration_runs")).toBe(1);
    const activation = calls.find(({ path }) => path === "/api/migrations/local-state")!.body as { migrationId: string };
    expect(calls.find(({ method }) => method === "PUT")?.body).toMatchObject({ mutationId: activation.migrationId });
  });
  it("activates only current research setup for a new account and preserves unrelated device history", async () => {
    saveDemoState(completeDemoUnit(createDemoState(), flagshipRole.today));
    const local = createLocalPlanningRepository({ storage: localStorage });
    await local.generate(guestRequest());
    const history = localStorage.getItem(DEMO_STORAGE_KEY); const localPlan = localStorage.getItem(PLANNING_STORAGE_KEY);
    expect(await local.readImportSource()).not.toBeNull();
    expect(count("career_goals")).toBe(0); expect(count("planning_workspaces")).toBe(0);
    render(<SetupPage />); const user = await reachBuild();
    expect(count("career_goals")).toBe(0);
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path"));
    const snapshot = await cloud.getWorkspace("owner-a");
    expect(snapshot?.state).toEqual({ setup: { roleId: data.blueprint.name, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 }, completedUnitIds: [], proofs: [] });
    expect(await cloud.getWorkspace("owner-b")).toBeNull(); expect(count("career_goals")).toBe(1);
    const response = await planning.getWorkspaceResponse("owner-a");
    expect(response.sourceContext?.reference).toMatchObject({ source: "research", researchRunId });
    expect(response.workspace?.goalId).toBe(snapshot?.activeGoalId); expect(count("planning_workspaces")).toBe(1);
    expect(count("learning_events")).toBe(0); expect(count("proof_items")).toBe(0);
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toBe(history); expect(localStorage.getItem(PLANNING_STORAGE_KEY)).toBe(localPlan);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull();
    expect(calls.find(({ path }) => path === "/api/migrations/local-state")?.body).toMatchObject({ consent: true, conflictResolution: "reject", intent: "research-setup", state: snapshot?.state });
  });
  it("rejects an existing immutable workspace before changing its common role", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const original = await cloud.getWorkspace("owner-a"); const workspace = await planning.getWorkspaceResponse("owner-a");
    render(<SetupPage />); const user = await reachBuild(); calls.length = 0;
    await user.click(screen.getByRole("button", { name: "Build my path" }));
    await screen.findByText("Arc could not save this plan. Your answers are still editable.");
    expect(await cloud.getWorkspace("owner-a")).toEqual(original);
    expect(await planning.getWorkspaceResponse("owner-a")).toEqual(workspace);
    expect(calls.every(({ method }) => method === "GET")).toBe(true); expect(session.navigate).not.toHaveBeenCalled();
  });
});
