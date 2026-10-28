import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SetupPage from "../../app/setup/page";
import PathPage from "../../app/path/page";
import TodayPage from "../../app/today/page";
import StackPage from "../../app/stack/page";
import ProofPage from "../../app/proof/page";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipRole } from "../../app/data/flagship-role";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { completeDemoUnit, createDemoState, DEMO_STORAGE_KEY, saveDemoState } from "../../app/lib/demo-store";
import { createLocalPlanningRepository, PLANNING_STORAGE_KEY } from "../../app/lib/planning/local-repository";
import { CloudService } from "../../app/server/cloud/service";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";
import { ProofService } from "../../app/server/proof/service";
import { D1ProofRepository } from "../../app/server/proof/d1-proof-repository";
import { createProofWorkspaceHandler } from "../../app/server/http/proof-route-factories";
import { PlanningService } from "../../app/server/planning/service";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { D1PlanningReplayPackageReader, D1ResearchRepository } from "../../app/server/research/d1-repository";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { createMigrationHandler, createWorkspaceHandlers } from "../../app/server/http/cloud-route-factories";
import { createPlanningGenerateHandler, createPlanningWorkspaceHandler } from "../../app/server/http/planning-route-factories";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchD1, seedUser, type SqliteD1 } from "../helpers/sqlite-d1";

const session = vi.hoisted(() => ({ owner: "owner-a" as string | null, navigate: vi.fn() }));
vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: session.owner ? { user: { id: session.owner, name: "Learner", email: "learner@example.test" } } : null, isPending: false }) } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: session.navigate, replace: session.navigate }), usePathname: () => "/" }));
vi.mock("../../app/components/account/account-menu", () => ({ AccountMenu: () => <span>Account</span> }));

const validation = validateResearchCandidate(validResearchCandidate, validAnnotations, {
  packageId: "research-package-activation", blueprintVersion: "2026.08.1", registryVersion: "2026.08.2", templateVersion: "2026.08.3",
  promptVersion: "research-prompt-v1", inputSchemaVersion: "research-input-v1", outputSchemaVersion: "research-output-v1", qualityVersion: "research-quality-v1", modelConfigVersion: "research-model-v1", observedAt: "2026-09-01", expiresAt: "2026-09-30",
});
if (!validation.ready) throw new Error("Expected validated research fixture");
const data = validation.package;
const researchRunId = "research-run-activation";
const now = () => new Date("2026-09-05T00:00:00Z");
const workspacePages = [
  { pageName: "Path", Page: PathPage, title: "学习路线" },
  { pageName: "Today", Page: TodayPage, title: flagshipRole.today.title },
  { pageName: "Stack", Page: StackPage, title: "The complete stack." },
  { pageName: "Proof", Page: ProofPage, title: "作品证据" },
];
function guestRequest() {
  return {
    mutationId: "mutation-guest-history", roleId: "ai-native-full-stack-engineer" as const, planningDate: "2026-09-05",
    audit: { id: "audit-history", schemaVersion: "2026.08.1" as const, blueprintId: flagshipBlueprint.id, blueprintVersion: flagshipBlueprint.version, answers: flagshipBlueprint.skills.map(({ id }) => ({ skillId: id, level: "unseen" as const, evidenceRefs: [] })), evidence: [], createdBy: "learner" as const, inputFingerprint: "audit-history" },
    availability: { id: "availability-history", schemaVersion: "2026.08.1" as const, timeZone: "UTC", weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-history" },
    target: { id: "target-history", schemaVersion: "2026.08.1" as const, targetWeeks: 18, inputFingerprint: "target-history" }, selectedScope: "full-scope" as const,
  };
}
type Call = { path: string; method: string; owner: string | null; signal: AbortSignal | null; body: unknown };
let db: SqliteD1;
let cloud: CloudService;
let planning: PlanningService;
let calls: Call[];
let intercept: ((request: Request) => Promise<Response | null>) | null;
const locksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
function count(table: string) { return (db.database.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: number }).count; }

beforeEach(async () => {
  window.history.replaceState(null, "", "/setup");
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
  const readProof = createProofWorkspaceHandler({ ...shared, createService: () => new ProofService({ repository: new D1ProofRepository(d1), blueprint: flagshipBlueprint, registry: flagshipUnitRegistry }) });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers); headers.set("x-test-owner", session.owner ?? "");
    const request = new Request(new URL(String(input), "http://arc.test"), { ...init, headers });
    const path = new URL(request.url).pathname;
    calls.push({ path, method: request.method, owner: session.owner, signal: init?.signal ?? null, body: init?.body ? JSON.parse(String(init.body)) : null });
    const override = await intercept?.(request); if (override) return override;
    request.signal.throwIfAborted();
    if (path === "/api/workspace") return request.method === "PUT" ? workspace.PUT(request) : workspace.GET(request);
    if (path === "/api/migrations/local-state") return migrate(request);
    if (path === "/api/planning/workspace") return readPlanning(request);
    if (path === "/api/planning/generate") return generate(request);
    if (path === "/api/proofs/workspace") return readProof(request);
    if (path.endsWith("/eligibility")) return Response.json({ eligible: true, requestId: "request-eligible" });
    if (path.endsWith(`/${researchRunId}`) && headers.get("x-test-owner") === "owner-a") return Response.json({ requestId: "request-ready", run: { id: researchRunId, role: data.blueprint.name, locale: "en-US", state: "ready", retryable: false, packageId: data.id, summary: data.blueprint.summary, skillCount: data.blueprint.skills.length, sourceCount: data.sourceEvidence.length, observedAt: data.observedAt, quality: { passed: true, issueCodes: [] }, planningData: { id: data.id, blueprint: data.blueprint, registry: data.registry } } });
    throw new Error(`Unexpected local test request ${request.method} ${path}`);
  }));
  localStorage.setItem("arc:role-research:v1", JSON.stringify({ runId: researchRunId, role: data.blueprint.name, locale: "en-US" }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); db.close(); if (locksDescriptor) Object.defineProperty(navigator, "locks", locksDescriptor); else Reflect.deleteProperty(navigator, "locks"); });

async function reachBuild(source: "research" | "flagship" = "research") {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: source === "research" ? "使用研究结果" : "使用精选路径" }));
  for (let index = 0; index < (source === "research" ? 2 : 3); index++) await user.click(screen.getByRole("button", { name: "继续" }));
  return user;
}

function newResearchRequest(previousGoalId: string, mutationId = "mutation-new-research") {
  const { roleId: _role, ...base } = guestRequest();
  void _role;
  return { ...base, mutationId, source: { source: "research", researchRunId }, newGoal: { previousGoalId },
    audit: { ...base.audit, blueprintId: data.blueprint.id, blueprintVersion: data.blueprint.version,
      answers: data.blueprint.skills.map(({ id: skillId }) => ({ skillId, level: "unseen", evidenceRefs: [] })) } };
}
describe("new Research setup through real clients, routes, services and SQLite", () => {
  it("creates a first Flagship plan from explicit create mode after authoritative missing-goal recovery", async () => {
    window.history.replaceState(null, "", "/setup?mode=create");
    try {
      render(<SetupPage />);
      const user = await reachBuild("flagship");
      await user.click(screen.getByRole("button", { name: "创建路线" }));
      await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path?created=1"));
      expect(count("career_goals")).toBe(1);
      expect(count("planning_workspaces")).toBe(1);
    } finally { window.history.replaceState(null, "", "/"); }
  });
  it.each(["before", "after"])("recovers explicit first creation across refresh when generation fails %s commit", async (failure) => {
    window.history.replaceState(null, "", "/setup?mode=create");
    try {
      const view = render(<SetupPage />); const user = await reachBuild("flagship");
      let failed = false;
      intercept = async (request) => {
        if (!request.url.endsWith("/api/planning/generate") || failed) return null;
        failed = true;
        if (failure === "after") await planning.generate("owner-a", await request.json());
        throw new TypeError("synthetic first generation failure");
      };
      await user.click(screen.getByRole("button", { name: "创建路线" }));
      await screen.findByText("保存结果尚未确认，请按原设置重试。");
      expect(screen.getByRole("button", { name: "返回" })).toBeDisabled();
      view.unmount(); render(<SetupPage />);
      await user.click(await screen.findByRole("button", { name: "重试保存原计划" }));
      await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path?created=1"));
      expect(count("career_goals")).toBe(1); expect(count("planning_workspaces")).toBe(1);
      const writes = calls.filter(({ path }) => path === "/api/planning/generate");
      expect(writes).toHaveLength(2); expect(writes[1]?.body).toEqual(writes[0]?.body);
      expect(calls.some(({ method }) => method === "PUT")).toBe(false);
    } finally { window.history.replaceState(null, "", "/"); }
  });
  it("does not replay an unfinished first creation into another active goal", async () => {
    window.history.replaceState(null, "", "/setup?mode=create");
    try {
      const view = render(<SetupPage />); const user = await reachBuild("flagship");
      intercept = async (request) => request.url.endsWith("/api/planning/generate") ? Promise.reject(new TypeError("before commit")) : null;
      await user.click(screen.getByRole("button", { name: "创建路线" }));
      await screen.findByText("保存结果尚未确认，请按原设置重试。");
      view.unmount(); intercept = null;
      const state = createDemoState(); state.setup.roleId = "Ecologist";
      await cloud.importLocalState("owner-a", { migrationId: "migration-another-active-goal", consent: true, conflictResolution: "activate-import", state });
      const replacement = await cloud.getWorkspace("owner-a"); calls.length = 0;
      render(<SetupPage />);
      await user.click(await screen.findByRole("button", { name: "重试保存原计划" }));
      await screen.findByRole("heading", { name: "当前目标已变化" });
      expect(await cloud.getWorkspace("owner-a")).toEqual(replacement);
      expect(calls.some(({ path }) => path === "/api/planning/generate")).toBe(false);
      expect(count("planning_workspaces")).toBe(0);
    } finally { window.history.replaceState(null, "", "/"); }
  });
  it("blocks creation over an existing legacy cloud goal whose history cannot be archived", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing-legacy", consent: true, conflictResolution: "reject", state: createDemoState() });
    const original = await cloud.getWorkspace("owner-a");
    window.history.replaceState(null, "", "/setup?mode=create");
    try {
      render(<SetupPage />);
      expect(await screen.findByRole("heading", { name: "先继续当前路线" })).toBeInTheDocument();
      expect(screen.queryByLabelText("自定义岗位")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "查看当前路线" })).toHaveAttribute("href", "/path");
      expect(await cloud.getWorkspace("owner-a")).toEqual(original);
      expect(calls.every(({ method }) => method === "GET")).toBe(true);
    } finally { window.history.replaceState(null, "", "/"); }
  });
  it("keeps guest Flagship generation entirely on this device and does not claim account persistence", async () => {
    session.owner = null; localStorage.removeItem("arc:role-research:v1");
    const history = completeDemoUnit(createDemoState(), flagshipRole.today); saveDemoState(history);
    render(<SetupPage />); const user = userEvent.setup();
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.queryByText(/saves this plan to your account/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path?created=1"));
    expect(calls).toHaveLength(0); expect(count("career_goals")).toBe(0); expect(count("planning_workspaces")).toBe(0);
    expect(await createLocalPlanningRepository({ storage: localStorage }).load()).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!)).toEqual(history);
  });
  it.each(workspacePages)("hides prior absence permission immediately on an account roundtrip in $pageName", async ({ Page, title }) => {
    const visibleTitle = Page === StackPage ? "技能与资料" : title;
    saveDemoState({ ...createDemoState(), setup: { ...createDemoState().setup, roleId: "Ecologist" } });
    const page = render(<Page />);
    await screen.findByRole("heading", { level: 1, name: visibleTitle });
    let release!: () => void; const pending = new Promise<void>((resolve) => { release = resolve; });
    intercept = async (request) => {
      if (!request.url.endsWith("/api/planning/workspace")) return null;
      await pending;
      return Response.json({ error: { code: "UNAVAILABLE", message: "Synthetic failure", requestId: "request-new-owner" } }, { status: 503 });
    };
    session.owner = "owner-b"; page.rerender(<Page />);
    expect(screen.queryByRole("heading", { level: 1, name: visibleTitle })).not.toBeInTheDocument();
    expect(screen.queryByText(/当前内容使用 AI 原生全栈旗舰样本/)).not.toBeInTheDocument();
    session.owner = "owner-a"; page.rerender(<Page />);
    expect(screen.queryByRole("heading", { level: 1, name: visibleTitle })).not.toBeInTheDocument();
    expect(screen.queryByText(/当前内容使用 AI 原生全栈旗舰样本/)).not.toBeInTheDocument();
    await act(async () => { release(); });
    await screen.findByText("暂时无法确认已保存的学习计划");
    expect(screen.queryByText(/当前内容使用 AI 原生全栈旗舰样本/)).not.toBeInTheDocument();
  });
  it.each(workspacePages)("does not permit absence fallback until Arc confirms a local setup on $pageName", async ({ Page, title }) => {
    saveDemoState({ ...createDemoState(), setup: { ...createDemoState().setup, roleId: "Ecologist" } });
    intercept = async (request) => request.url.endsWith("/api/workspace")
      ? Response.json({ error: { code: "UNAVAILABLE", message: "Synthetic failure", requestId: "request-arc-failure" } }, { status: 503 }) : null;
    render(<Page />);
    if (Page === StackPage) await screen.findByRole("heading", { name: "技能与资料" });
    else await screen.findByText("暂时无法确认已保存的学习计划");
    expect(screen.queryByRole("heading", { level: 1, name: title })).not.toBeInTheDocument();
    expect(screen.queryByText(/当前内容使用 AI 原生全栈旗舰样本/)).not.toBeInTheDocument();
  });
  it.each(["unavailable", "declined"].flatMap((mode) => workspacePages.map((page) => ({ mode, ...page }))))("handles unsaved $mode $pageName according to its account boundary", async ({ mode, Page, title }) => {
    localStorage.removeItem("arc:role-research:v1");
    intercept = async (request) => request.url.endsWith("/eligibility") ? Response.json({ eligible: mode === "declined", requestId: "request-legacy-eligibility" }) : null;
    const page = render(<SetupPage />); const user = userEvent.setup();
    await user.type(screen.getByLabelText("自定义岗位"), "Ecologist");
    if (mode === "declined") await screen.findByRole("button", { name: "研究这个岗位" });
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path?created=1"));
    expect(count("career_goals")).toBe(0); expect(count("planning_workspaces")).toBe(0);
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!).setup.roleId).toBe("Ecologist");
    expect(calls.some(({ method }) => method !== "GET")).toBe(false);
    page.unmount(); render(<Page />);
    expect(await screen.findByRole("heading", { level: 1, name: Page === StackPage ? "技能与资料" : title })).toBeInTheDocument();
    if (Page === StackPage || Page === ProofPage) {
      expect(screen.queryByText(/当前内容使用 AI 原生全栈旗舰样本/)).not.toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Learning resources" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "创建学习路线 →" })).toBeInTheDocument();
    } else expect(screen.getByText(/当前内容使用 AI 原生全栈旗舰样本/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新读取计划" })).not.toBeInTheDocument();
  });
  it.each([true, false])("builds a real Flagship plan for a fresh owner (explicit fallback: %s) without importing device history", async (explicitFallback) => {
    if (!explicitFallback) localStorage.removeItem("arc:role-research:v1");
    saveDemoState(completeDemoUnit(createDemoState(), flagshipRole.today));
    const local = createLocalPlanningRepository({ storage: localStorage });
    await local.generate(guestRequest());
    const history = localStorage.getItem(DEMO_STORAGE_KEY); const localPlan = localStorage.getItem(PLANNING_STORAGE_KEY);
    const setupPage = render(<SetupPage />); const user = userEvent.setup();
    if (explicitFallback) await user.click(await screen.findByRole("button", { name: "使用精选路径" }));
    for (let index = 0; index < 3; index++) await user.click(screen.getByRole("button", { name: "继续" }));
    expect(screen.getByText("生成后，计划会保存到你的账户；已有的本地历史记录仍保留在此设备上。")).toBeInTheDocument();
    expect(count("career_goals")).toBe(0); expect(count("planning_workspaces")).toBe(0);
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path?created=1"));
    expect(count("career_goals")).toBe(1); expect(count("planning_workspaces")).toBe(1);
    const snapshot = await cloud.getWorkspace("owner-a");
    expect(snapshot?.state).toEqual({ setup: createDemoState().setup, completedUnitIds: [], proofs: [] });
    const response = await planning.getWorkspaceResponse("owner-a");
    expect(response.sourceContext?.reference).toEqual({ source: "flagship", roleId: flagshipRole.id });
    expect(response.workspace?.goalId).toBe(snapshot?.activeGoalId); expect(await cloud.getWorkspace("owner-b")).toBeNull();
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toBe(history); expect(localStorage.getItem(PLANNING_STORAGE_KEY)).toBe(localPlan);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull();
    expect(count("learning_events")).toBe(0); expect(count("proof_items")).toBe(0);
    setupPage.unmount();
    const pathPage = render(<PathPage />);
    expect(await screen.findByRole("list", { name: "学习阶段" })).toBeInTheDocument();
    expect(screen.getByText(flagshipBlueprint.summary)).toBeInTheDocument();
    expect(screen.queryByText(/当前内容使用 AI 原生全栈旗舰样本/)).not.toBeInTheDocument();
    pathPage.unmount(); render(<TodayPage />);
    const plan = response.workspace!.planVersions.find(({ id }) => id === response.workspace!.activePlanVersionId)!;
    const primaryId = plan.days.find(({ primaryUnitId }) => primaryUnitId !== null)!.primaryUnitId;
    const primary = response.workspace!.dailyUnits.find(({ id }) => id === primaryId)!;
    const title = flagshipUnitRegistry.tracks.flatMap(({ templates }) => templates).find(({ id }) => id === primary.templateId)!.title;
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(primary.objective)).toBeInTheDocument();
    expect(screen.getByRole("article", { name: title })).toHaveTextContent(`${primary.estimatedMinutes}分钟`);
    for (const step of primary.steps) expect(screen.getByRole("checkbox", { name: `${step.label}${step.minutes} 分钟` })).toBeInTheDocument();
    await user.click(screen.getByText("调整这项任务"));
    expect(screen.getByRole("button", { name: "延后" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: flagshipRole.today.title })).not.toBeInTheDocument();
  });
  it.each(["empty-200", "401", "429", "503", "network", "404-other-code", "500-NOT_FOUND", "malformed"].flatMap((mode) => workspacePages.map((page) => ({ mode, ...page }))))("keeps the $mode read boundary on $pageName", async ({ mode, Page, title }) => {
    const state = { ...createDemoState(), setup: { ...createDemoState().setup, roleId: "Ecologist" } };
    saveDemoState(state);
    if (mode === "empty-200") await cloud.importLocalState("owner-a", { migrationId: "legacy-empty-goal", consent: true, conflictResolution: "reject", state });
    intercept = async (request) => {
      if (!request.url.endsWith("/api/planning/workspace") || mode === "empty-200") return null;
      if (mode === "network") throw new TypeError("synthetic offline");
      if (mode === "malformed") return Response.json({ workspace: {} });
      const status = Number(mode.split("-")[0]);
      const code = mode === "401" ? "UNAUTHENTICATED" : mode === "429" ? "RATE_LIMITED" : mode === "404-other-code" ? "INVALID_INPUT" : mode === "500-NOT_FOUND" ? "NOT_FOUND" : "UNAVAILABLE";
      return Response.json({ error: { code, message: "Synthetic failure", requestId: "request-boundary" } }, { status });
    };
    render(<Page />);
    if (mode === "empty-200") expect(await screen.findByRole("heading", { level: 1, name: Page === StackPage ? "技能与资料" : title })).toBeInTheDocument();
    else if (mode === "401" && Page === StackPage) {
      await screen.findByText("登录已过期，请重新登录后查看你的技能与资料。");
      expect(screen.getByRole("link", { name: "重新登录" })).toHaveAttribute("href", "/sign-in?next=%2Fstack&reauth=1");
      expect(session.navigate).not.toHaveBeenCalled();
      expect(screen.queryByRole("heading", { level: 1, name: title })).not.toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Learning resources" })).not.toBeInTheDocument();
    }
    else {
      expect(await screen.findByText("暂时无法确认已保存的学习计划")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 1, name: title })).not.toBeInTheDocument();
      expect(screen.queryByText(/当前内容使用 AI 原生全栈旗舰样本/)).not.toBeInTheDocument();
    }
  });
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
  it.each(["research", "flagship"] as const)("preserves an immutable plan when another tab builds after %s preflight reads empty", async (source) => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing-empty", consent: true, conflictResolution: "reject", state: createDemoState() });
    const original = await cloud.getWorkspace("owner-a");
    render(<SetupPage />); const user = await reachBuild(source);
    let raced = false; let committedReceipts = 0;
    intercept = async (request) => {
      if (!raced && request.url.endsWith("/api/planning/workspace")) {
        raced = true;
        const response = await planning.getWorkspaceResponse("owner-a");
        expect(response.workspace).toBeNull();
        await planning.generate("owner-a", guestRequest());
        committedReceipts = count("idempotency_records");
        return Response.json(response);
      }
      return null;
    };
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await screen.findByText("Arc 未能保存计划，你仍可修改设置。");
    expect(raced).toBe(true); expect(count("planning_workspaces")).toBe(1);
    expect(session.navigate).not.toHaveBeenCalled();
    expect((await cloud.getWorkspace("owner-a"))!.state.setup).toEqual(original!.state.setup);
    expect(count("idempotency_records")).toBe(committedReceipts);
  });
  it("does not enqueue a failed current Research save when the account already has an empty goal", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-empty-goal", consent: true, conflictResolution: "reject", state: createDemoState() });
    render(<SetupPage />); const user = await reachBuild();
    intercept = async (request) => { if (request.method === "PUT") throw new TypeError("synthetic offline"); return null; };
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await screen.findByText("Arc 未能保存计划，你仍可修改设置。");
    expect(calls.filter(({ method }) => method === "PUT")).toHaveLength(1);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull();
    expect(count("planning_workspaces")).toBe(0); expect(session.navigate).not.toHaveBeenCalled();
  });
  it.each((["research", "flagship"] as const).flatMap((source) => ["invalid", "wrong-id", "imported-history", "wrong-goal", "failed"].map((failure) => ({ source, failure }))))("rejects $failure $source activation without queuing or generating", async ({ source, failure }) => {
    render(<SetupPage />); const user = await reachBuild(source);
    intercept = async (request) => {
      if (!request.url.endsWith("/api/migrations/local-state")) return null;
      const input = await request.json() as { migrationId: string };
      if (failure === "failed") throw new TypeError("synthetic offline");
      if (failure === "invalid") return Response.json({ result: { status: "imported" } });
      return Response.json({ result: { migrationId: failure === "wrong-id" ? "activation-other" : input.migrationId, status: "imported", activeGoalId: "goal-absent", importedCompletionCount: failure === "imported-history" ? 1 : 0, importedProofCount: 0, availableResolutions: [] } });
    };
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await screen.findByText("Arc 未能保存计划，你仍可修改设置。");
    expect(calls.filter(({ path }) => path === "/api/migrations/local-state")).toHaveLength(1);
    expect(count("career_goals")).toBe(0); expect(count("planning_workspaces")).toBe(0);
    expect(calls.some(({ path }) => path === "/api/planning/generate")).toBe(false);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull(); expect(session.navigate).not.toHaveBeenCalled();
  });
  it.each((["research", "flagship"] as const).flatMap((source) => ["activation", "verification"].flatMap((stage) => ["roundtrip", "unmount"].map((transition) => ({ source, stage, transition })))))("cancels $source $stage after $transition without generating or navigating", async ({ source, stage, transition }) => {
    const page = render(<SetupPage />); const user = await reachBuild(source);
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
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await waitFor(() => expect(paused).not.toBeNull());
    if (transition === "unmount") page.unmount();
    else { session.owner = "owner-b"; page.rerender(<SetupPage />); session.owner = "owner-a"; page.rerender(<SetupPage />); }
    await act(async () => { release(); });
    expect(paused!.signal.aborted).toBe(true);
    expect(count("planning_workspaces")).toBe(0); expect(await cloud.getWorkspace("owner-b")).toBeNull();
    expect(calls.some(({ path }) => path === "/api/planning/generate")).toBe(false);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull(); expect(session.navigate).not.toHaveBeenCalled();
  });
  it.each(["research", "flagship"] as const)("recovers an accepted %s activation after its response is lost without duplicating the goal or importing device history", async (source) => {
    render(<SetupPage />); const user = await reachBuild(source);
    let loseResponse = true;
    intercept = async (request) => {
      if (loseResponse && request.url.endsWith("/api/migrations/local-state")) {
        loseResponse = false;
        await cloud.importLocalState(request.headers.get("x-test-owner")!, await request.json());
        throw new TypeError("synthetic lost response after commit");
      }
      return null;
    };
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await screen.findByText("Arc 未能保存计划，你仍可修改设置。");
    expect(count("career_goals")).toBe(1); expect(count("planning_workspaces")).toBe(0);
    expect(localStorage.getItem("arc-offline-queue-v1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path?created=1"));
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
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path?created=1"));
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
  it.each(["flagship"] as const)("rejects an existing immutable workspace before changing its common role for %s", async (source) => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const original = await cloud.getWorkspace("owner-a"); const workspace = await planning.getWorkspaceResponse("owner-a");
    render(<SetupPage />); const user = await reachBuild(source); calls.length = 0;
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await screen.findByText("Arc 未能保存计划，你仍可修改设置。");
    expect(await cloud.getWorkspace("owner-a")).toEqual(original);
    expect(await planning.getWorkspaceResponse("owner-a")).toEqual(workspace);
    expect(calls.every(({ method }) => method === "GET")).toBe(true); expect(session.navigate).not.toHaveBeenCalled();
  });
  it("creates a new Research goal atomically and keeps the prior plan in history", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const original = (await cloud.getWorkspace("owner-a"))!;
    const previous = await planning.getWorkspaceResponse("owner-a");
    render(<SetupPage />); const user = await reachBuild(); calls.length = 0;
    expect(screen.getByRole("button", { name: "创建路线" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "创建新计划，并将当前计划保留在历史记录中" }));
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path?created=1"));
    const current = (await cloud.getWorkspace("owner-a"))!;
    expect(current.activeGoalId).not.toBe(original.activeGoalId);
    expect(current.state.setup.roleId).toBe(data.blueprint.name);
    expect(count("career_goals")).toBe(2); expect(count("planning_workspaces")).toBe(2);
    expect(await planning.getSavedWorkspaceResponse("owner-a", original.activeGoalId)).toEqual(previous);
    expect(db.database.prepare("SELECT status,active_slot FROM career_goals WHERE id=?1").get(original.activeGoalId)).toMatchObject({ status: "archived", active_slot: null });
    expect((await planning.getWorkspaceResponse("owner-a")).sourceContext?.reference).toMatchObject({ source: "research", researchRunId });
    expect(calls.filter(({ method }) => method !== "GET").map(({ path }) => path)).toEqual(["/api/planning/generate"]);
    expect(await cloud.getWorkspace("owner-b")).toBeNull();
  });
  it.each([false, true])("replays a new Research goal after a lost response without creating a second goal (refresh: %s)", async (refresh) => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const view = render(<SetupPage />); const user = await reachBuild();
    await user.click(screen.getByRole("checkbox", { name: "创建新计划，并将当前计划保留在历史记录中" }));
    let lost = false;
    intercept = async (request) => {
      if (!request.url.endsWith("/api/planning/generate") || lost) return null;
      lost = true; await planning.generate("owner-a", await request.json()); throw new TypeError("lost response after commit");
    };
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await screen.findByText("Arc 未能保存计划，你仍可修改设置。");
    expect(count("career_goals")).toBe(2);
    if (refresh) {
      view.unmount(); render(<SetupPage />);
      await user.click(await screen.findByRole("checkbox", { name: "创建新计划，并将当前计划保留在历史记录中" }));
    }
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await waitFor(() => expect(session.navigate).toHaveBeenCalledWith("/path?created=1"));
    expect(count("career_goals")).toBe(2); expect(count("planning_workspaces")).toBe(2);
    const writes = calls.filter(({ path }) => path === "/api/planning/generate");
    expect(writes).toHaveLength(2); expect(writes[1]?.body).toEqual(writes[0]?.body);
  });
  it("rechecks unavailable research and starts the entered role without replacing an existing goal", async () => {
    window.history.replaceState(null, "", "/setup?mode=create");
    localStorage.removeItem("arc:role-research:v1");
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const original = await cloud.getWorkspace("owner-a"); let eligible = false;
    intercept = async (request) => {
      if (request.url.endsWith("/eligibility")) return Response.json({ eligible, requestId: "request-eligibility-retry" });
      if (request.url.endsWith("/api/intelligence/research") && request.method === "POST") return Response.json({ requestId: "request-research-start", run: { id: "research-retry", role: "AI 工程师", locale: "zh-CN", state: "queued", retryable: false, backgroundAccepted: false } });
      return null;
    };
    render(<SetupPage />); const user = userEvent.setup();
    await user.type(await screen.findByLabelText("自定义岗位"), "AI 工程师");
    expect(await screen.findByText(/岗位研究暂不可用，当前无法创建新路线/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "继续" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "使用精选路径" })).not.toBeInTheDocument();
    eligible = true;
    await user.click(screen.getByRole("button", { name: "重新检查岗位研究" }));
    await user.click(await screen.findByRole("button", { name: "研究这个岗位" }));
    await screen.findByRole("heading", { name: "研究已排队" });
    expect(screen.getByLabelText("自定义岗位")).toHaveValue("AI 工程师");
    expect(calls.filter(({ path }) => path.endsWith("/eligibility"))).toHaveLength(2);
    expect(calls.find(({ path, method }) => path.endsWith("/api/intelligence/research") && method === "POST")?.body).toMatchObject({ role: "AI 工程师", locale: "zh-CN" });
    expect(await cloud.getWorkspace("owner-a")).toEqual(original);
    expect(count("career_goals")).toBe(1);
  });
  it("rolls back new Research goal activation if saving the plan fails", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const original = await cloud.getWorkspace("owner-a"); const previous = await planning.getWorkspaceResponse("owner-a");
    render(<SetupPage />); const user = await reachBuild();
    await user.click(screen.getByRole("checkbox", { name: "创建新计划，并将当前计划保留在历史记录中" }));
    db.failAtBatchStatement = 4;
    await user.click(screen.getByRole("button", { name: "创建路线" }));
    await screen.findByText("Arc 未能保存计划，你仍可修改设置。");
    expect(await cloud.getWorkspace("owner-a")).toEqual(original);
    expect(await planning.getWorkspaceResponse("owner-a")).toEqual(previous);
    expect(count("career_goals")).toBe(1); expect(count("planning_workspaces")).toBe(1);
  });
  it("keeps distinct new-goal mutations separate and replays an archived result without activating it", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const original = (await cloud.getWorkspace("owner-a"))!;
    const firstRequest = newResearchRequest(original.activeGoalId, "mutation-first-new");
    const first = await planning.generateResponse("owner-a", firstRequest);
    const second = await planning.generateResponse("owner-a", newResearchRequest(first.result.workspace.goalId, "mutation-second-new"));
    expect(second.result.workspace.goalId).not.toBe(first.result.workspace.goalId);
    expect(count("career_goals")).toBe(3); expect(count("planning_workspaces")).toBe(3);
    expect(await planning.generateResponse("owner-a", firstRequest)).toEqual(first);
    expect((await cloud.getWorkspace("owner-a"))?.activeGoalId).toBe(second.result.workspace.goalId);
  });
  it("rejects stale or foreign previous goals and Research sources without changing either owner", async () => {
    for (const owner of ["owner-a", "owner-b"]) {
      await cloud.importLocalState(owner, { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
      await planning.generate(owner, guestRequest());
    }
    const a = (await cloud.getWorkspace("owner-a"))!; const b = (await cloud.getWorkspace("owner-b"))!;
    await expect(planning.generate("owner-a", newResearchRequest(b.activeGoalId))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(planning.generate("owner-b", newResearchRequest(b.activeGoalId))).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    await expect(planning.generate("owner-a", { ...guestRequest(), newGoal: { previousGoalId: a.activeGoalId } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await cloud.getWorkspace("owner-a")).toEqual(a); expect(await cloud.getWorkspace("owner-b")).toEqual(b);
    expect(count("career_goals")).toBe(2);
  });
  it("rejects a new Research goal when the active goal changes at the transaction boundary", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const original = (await cloud.getWorkspace("owner-a"))!;
    const batch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (statements) => {
      db.database.prepare("UPDATE career_goals SET active_slot=NULL,status='archived' WHERE id=?1").run(original.activeGoalId);
      await cloud.importLocalState("owner-a", { migrationId: "migration-other-tab", consent: true, conflictResolution: "reject", state: createDemoState() });
      return batch(statements);
    });
    await expect(planning.generate("owner-a", newResearchRequest(original.activeGoalId))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(count("career_goals")).toBe(2); expect(count("planning_workspaces")).toBe(1);
    expect((await cloud.getWorkspace("owner-a"))?.state.setup.roleId).toBe(flagshipRole.id);
  });
  it("settles concurrent copies of the same new Research save to one goal", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const original = (await cloud.getWorkspace("owner-a"))!;
    const input = newResearchRequest(original.activeGoalId);
    const batch = db.batch.bind(db); let winner: unknown;
    vi.spyOn(db, "batch").mockImplementationOnce(async (statements) => {
      winner = await planning.generateResponse("owner-a", input);
      return batch(statements);
    });
    expect(await planning.generateResponse("owner-a", input)).toEqual(winner);
    expect(count("career_goals")).toBe(2); expect(count("planning_workspaces")).toBe(2);
  });
  it("keeps the previous default when a ready Research source is invalidated during commit", async () => {
    await cloud.importLocalState("owner-a", { migrationId: "migration-existing", consent: true, conflictResolution: "reject", state: createDemoState() });
    await planning.generate("owner-a", guestRequest());
    const original = (await cloud.getWorkspace("owner-a"))!;
    const previous = await planning.getWorkspaceResponse("owner-a");
    const batch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementationOnce(async (statements) => {
      db.database.prepare("UPDATE research_runs SET state='failed' WHERE id=?1").run(researchRunId);
      return batch(statements);
    });
    await expect(planning.generate("owner-a", newResearchRequest(original.activeGoalId))).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(await cloud.getWorkspace("owner-a")).toEqual(original);
    expect(await planning.getWorkspaceResponse("owner-a")).toEqual(previous);
    expect(count("career_goals")).toBe(1); expect(count("planning_workspaces")).toBe(1);
  });
});
