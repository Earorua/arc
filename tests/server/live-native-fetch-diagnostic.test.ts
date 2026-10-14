// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchRunPublicViewSchema } from "../../app/contracts/research";
import { ResearchOrchestrator } from "../../app/server/research/orchestrator";
import * as fetchDiagnosticModule from "../../scripts/live-research/fetch-diagnostic";
import * as transportModule from "../../scripts/live-research/transport";
import { fixtureResponse, LIVE_POLICY, runValidation, type ValidationSummary } from "../../scripts/live-research/validation";
import * as sqliteD1Module from "../helpers/sqlite-d1";

const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const key = "synthetic-native-fetch-key";
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0,
  is_management_key: false, byok_usage: 0 } };
const tables = ["research_runs", "research_packages", "ai_runs", "quota_ledger", "ai_budget_reservations",
  "ai_budget_buckets", "idempotency_records"] as const;
type CapturedRows = Record<(typeof tables)[number], unknown[]>;
type ObserverMode = "baseline" | "disabled" | "throw" | "reject" | "pending";

const originalCreateDatabase = sqliteD1Module.createResearchD1;
const originalCreateGuardedTransport = transportModule.createGuardedTransport;
const originalProjectNativeFetchDiagnostic = fetchDiagnosticModule.projectNativeFetchDiagnostic;
const originalStart = ResearchOrchestrator.prototype.start;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("GLOBAL_FETCH_MUST_NOT_RUN"); }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function captureRowsBeforeClose() {
  let rows: CapturedRows | null = null;
  let closed = false;
  const spy = vi.spyOn(sqliteD1Module, "createResearchD1").mockImplementation(() => {
    const db = originalCreateDatabase();
    const close = db.close.bind(db);
    db.close = () => {
      rows = Object.fromEntries(tables.map((table) => [table, db.database.prepare(`SELECT * FROM ${table}`).all()])) as CapturedRows;
      close();
      closed = true;
      expect(() => db.database.prepare("SELECT 1")).toThrow();
    };
    return db;
  });
  return { spy, read: () => ({ rows, closed }) };
}

function capturePublicRun() {
  let publicRun: Awaited<ReturnType<ResearchOrchestrator["start"]>> | null = null;
  const spy = vi.spyOn(ResearchOrchestrator.prototype, "start").mockImplementation(async function (
    this: ResearchOrchestrator, ownerId, input, context,
  ) {
    const result = await originalStart.call(this, ownerId, input, context);
    publicRun = structuredClone(result);
    return result;
  });
  return { spy, read: () => publicRun };
}

function rejectionFetch(code: string, message = "CANARY-private-native-message") {
  return vi.fn<typeof globalThis.fetch>(async (url) => {
    if (url === KEY_URL) return Response.json(safeKeyData);
    throw new Error(message, { cause: { code, detail: "CANARY-private-cause" } });
  });
}

function expectOneFailedResearch(result: ValidationSummary, injected: ReturnType<typeof vi.fn>) {
  expect(injected.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
  ]);
  expect(result).toMatchObject({
    mode: "live-one", outcome: "incomplete", reason: "research-failed", runState: "failed",
    failureCategory: "service-unavailable", keyHttpStatus: 200, researchHttpStatus: null,
    actualModel: null, usage: null,
    researchAttemptDiagnostic: { status: "failed", errorCode: "unavailable", charged: "unknown" },
    researchRunDiagnostic: { errorCode: "unavailable", quality: null },
    researchTransportDiagnostic: { version: "transport-diagnostic-v3", phase: "fetch", reason: "fetch-error",
      receivedBytes: 0, bodyComplete: false, localCancellation: "none", nativeErrorKind: "other",
      headersElapsedMs: null, bodyEndElapsedMs: null, localCancellationElapsedMs: null, responseFormat: null },
    reservation: { status: "conservative-hold", maximumMicros: LIVE_POLICY.maximumMicros, settledMicros: 0 },
    realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
    ownerWrongReadRejected: true, secondResearchRejected: true,
    freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0, databaseDisposed: true,
  });
}

function assertNoPrivateData(...values: unknown[]) {
  const serialized = JSON.stringify(values);
  expect(serialized).not.toMatch(/CANARY|UND_ERR_|ECONN|ENOTFOUND|CERT_HAS_EXPIRED|ETIMEDOUT|synthetic-native-fetch-key/u);
  expect(serialized).not.toContain("native-fetch-diagnostic-v1");
}

function stableState(summary: ValidationSummary, publicRun: unknown, durable: CapturedRows) {
  const business: Partial<ValidationSummary> = { ...summary };
  delete business.timestamp;
  delete business.researchElapsedMs;
  delete business.researchStartedAt;
  delete business.researchNativeFetchDiagnostic;
  const ids = new Map<string, string>();
  const replaceId = (value: string) => {
    let replacement = ids.get(value);
    if (!replacement) { replacement = `<id-${ids.size + 1}>`; ids.set(value, replacement); }
    return replacement;
  };
  const normalize = (value: unknown): unknown => {
    if (typeof value === "string") return value
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu, replaceId)
      .replace(/research-(?:attempt|quota)-[0-9a-f]{32}/gu, replaceId);
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) => [name, /(?:elapsedMs|ElapsedMs|latency_ms)$/u.test(name) ? "<duration>" : normalize(child)]));
    return value;
  };
  return normalize({ business, publicRun, durable });
}

async function observerScenario(mode: ObserverMode) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-13T04:00:00.000Z"));
  const capture = captureRowsBeforeClose();
  const publicCapture = capturePublicRun();
  let observerCalls = 0;
  const guardSpy = vi.spyOn(transportModule, "createGuardedTransport").mockImplementation((guardKey, injectedFetch, options = {}) => {
    const summaryObserver = options.onResearchFetchDiagnostic;
    const observer = mode === "disabled" ? undefined : mode === "baseline"
      ? (diagnostic: fetchDiagnosticModule.NativeFetchDiagnostic) => { observerCalls++; return summaryObserver?.(diagnostic); }
      : mode === "throw" ? () => { observerCalls++; throw new Error("CANARY-observer-throw"); }
        : mode === "reject" ? async () => { observerCalls++; throw new Error("CANARY-observer-reject"); }
          : () => { observerCalls++; return new Promise<never>(() => undefined); };
    return originalCreateGuardedTransport(guardKey, injectedFetch, { ...options, onResearchFetchDiagnostic: observer });
  });
  const injected = rejectionFetch("UND_ERR_HEADERS_TIMEOUT");
  const result = await runValidation({ executeOne: true, key, fetch: injected });
  await Promise.resolve();
  const durable = capture.read();
  const publicRun = publicCapture.read();
  expect(observerCalls).toBe(mode === "disabled" ? 0 : 1);
  expect(durable.closed).toBe(true);
  expect(durable.rows).not.toBeNull();
  expect(researchRunPublicViewSchema.safeParse(publicRun).success).toBe(true);
  expectOneFailedResearch(result, injected);
  assertNoPrivateData({ ...result, researchNativeFetchDiagnostic: null }, durable.rows, publicRun);
  guardSpy.mockRestore();
  publicCapture.spy.mockRestore();
  capture.spy.mockRestore();
  vi.useRealTimers();
  return stableState(result, publicRun, durable.rows!);
}

describe("live native fetch diagnostic summary", () => {
  it.each([
    ["headers timeout", "UND_ERR_HEADERS_TIMEOUT", "headers-timeout"],
    ["socket failure", "UND_ERR_SOCKET", "socket"],
    ["connect timeout", "UND_ERR_CONNECT_TIMEOUT", "connect-timeout"],
    ["DNS failure", "ENOTFOUND", "dns"],
    ["TLS failure", "CERT_HAS_EXPIRED", "tls"],
    ["system timeout", "ETIMEDOUT", "system-timeout"],
  ] as const)("projects %s without changing the existing business result", async (_label, code, kind) => {
    const capture = captureRowsBeforeClose();
    const publicCapture = capturePublicRun();
    const injected = rejectionFetch(code);

    const result = await runValidation({ executeOne: true, key, fetch: injected });

    expect(result.researchNativeFetchDiagnostic).toEqual({ version: "native-fetch-diagnostic-v1", kind });
    expect(Object.keys(result.researchNativeFetchDiagnostic!)).toEqual(["version", "kind"]);
    expectOneFailedResearch(result, injected);
    const durable = capture.read();
    expect(durable.closed).toBe(true);
    expect(durable.rows && Object.keys(durable.rows)).toEqual(tables);
    expect(researchRunPublicViewSchema.safeParse(publicCapture.read()).success).toBe(true);
    assertNoPrivateData({ ...result, researchNativeFetchDiagnostic: null }, durable.rows, publicCapture.read());
  });

  it("reprojects a poisoned guard projection without invoking its getter", async () => {
    let calls = 0;
    let getterReads = 0;
    vi.spyOn(fetchDiagnosticModule, "projectNativeFetchDiagnostic").mockImplementation((value) => {
      calls++;
      const projected = originalProjectNativeFetchDiagnostic(value);
      if (calls !== 1 || !projected) return projected;
      return Object.defineProperties({ ...projected, privateCode: "CANARY-extra" }, {
        cause: { enumerable: true, get: () => { getterReads++; return "CANARY-getter"; } },
      }) as unknown as typeof projected;
    });
    const injected = rejectionFetch("UND_ERR_HEADERS_TIMEOUT");

    const result = await runValidation({ executeOne: true, key, fetch: injected });

    expect(calls).toBe(2);
    expect(getterReads).toBe(0);
    expect(result.researchNativeFetchDiagnostic).toBeNull();
    expectOneFailedResearch(result, injected);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it("records an unclassified native redirect-error rejection only as other", async () => {
    const injected = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      throw new TypeError("CANARY-native-redirect-error");
    });

    const result = await runValidation({ executeOne: true, key, fetch: injected });

    expect(result.researchNativeFetchDiagnostic).toEqual({ version: "native-fetch-diagnostic-v1", kind: "other" });
    expectOneFailedResearch(result, injected);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it.each([
    ["default offline", () => runValidation()],
    ["key only", () => runValidation({ checkKeyOnly: true, key,
      fetch: vi.fn(async () => Response.json(safeKeyData)) as typeof globalThis.fetch })],
    ["successful Research", () => runValidation({ executeOne: true, key,
      fetch: vi.fn(async (url) => url === KEY_URL ? Response.json(safeKeyData) : fixtureResponse()) })],
    ["returned redirect", () => runValidation({ executeOne: true, key,
      fetch: vi.fn(async (url) => url === KEY_URL ? Response.json(safeKeyData) : new Response("CANARY", { status: 302 })) })],
    ["body reader rejection", () => runValidation({ executeOne: true, key, fetch: vi.fn(async (url) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      return new Response(new ReadableStream<Uint8Array>({ pull() {
        throw Object.assign(new Error("CANARY-body"), { code: "UND_ERR_BODY_TIMEOUT" });
      } }), { status: 200 });
    }) })],
  ] as const)("keeps the fixed diagnostic null for %s", async (_label, execute) => {
    const result = await execute();
    expect(result.researchNativeFetchDiagnostic).toBeNull();
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it.each(["disabled", "throw", "reject", "pending"] as const)(
    "keeps summary, public run, and seven durable tables unchanged when the guard observer is %s",
    async (mode) => {
      const baseline = await observerScenario("baseline");
      const altered = await observerScenario(mode);
      expect(altered).toEqual(baseline);
    },
  );

  it("closes both observers before a fetch rejects after the 20-minute Provider deadline", async () => {
    vi.useFakeTimers();
    const capture = captureRowsBeforeClose();
    let retainedSummaryObserver: ((diagnostic: fetchDiagnosticModule.NativeFetchDiagnostic) => unknown) | undefined;
    vi.spyOn(transportModule, "createGuardedTransport").mockImplementation((guardKey, injectedFetch, options = {}) => {
      retainedSummaryObserver = options.onResearchFetchDiagnostic;
      return originalCreateGuardedTransport(guardKey, injectedFetch, options);
    });
    let postEntered = false;
    let rejectBottom: (reason?: unknown) => void = () => undefined;
    const bottom = new Promise<Response>((_resolve, reject) => { rejectBottom = reject; });
    const bottomSettled = bottom.then(() => undefined, () => undefined);
    const injected = vi.fn<typeof globalThis.fetch>((url) => {
      if (url === KEY_URL) return Promise.resolve(Response.json(safeKeyData));
      postEntered = true;
      return bottom;
    });
    let projectionCalls = 0;
    vi.spyOn(fetchDiagnosticModule, "projectNativeFetchDiagnostic").mockImplementation((value) => {
      projectionCalls++;
      return originalProjectNativeFetchDiagnostic(value);
    });

    const pending = runValidation({ executeOne: true, key, fetch: injected });
    for (let turns = 0; turns < 100 && !postEntered; turns++) await vi.advanceTimersByTimeAsync(0);
    expect(postEntered).toBe(true);
    await vi.advanceTimersByTimeAsync(LIVE_POLICY.timeoutMs);
    const result = await pending;
    const completeSummaryObject = result;
    const completeSummary = structuredClone(result);

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed", failureCategory: "timeout",
      actualModel: null, usage: null, researchNativeFetchDiagnostic: null,
      researchAttemptDiagnostic: { status: "failed", errorCode: "timeout", charged: "unknown" },
      researchTransportDiagnostic: { version: "transport-diagnostic-v3", phase: "fetch", reason: "deadline",
        receivedBytes: 0, bodyComplete: false, localCancellation: "deadline-abort", nativeErrorKind: null,
        localCancellationElapsedMs: LIVE_POLICY.timeoutMs, headersElapsedMs: null, bodyEndElapsedMs: null, responseFormat: null },
      reservation: { status: "conservative-hold", maximumMicros: LIVE_POLICY.maximumMicros, settledMicros: 0 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0, databaseDisposed: true,
    });
    expect(capture.read()).toMatchObject({ closed: true, rows: expect.any(Object) });
    expect(projectionCalls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    rejectBottom(new Error("CANARY-late-native", { cause: { code: "UND_ERR_HEADERS_TIMEOUT" } }));
    await bottomSettled;
    await vi.advanceTimersByTimeAsync(0);
    expect(projectionCalls).toBe(0);
    expect(result.researchNativeFetchDiagnostic).toBeNull();
    expect(result).toBe(completeSummaryObject);
    expect(result).toEqual(completeSummary);

    let getterReads = 0;
    const malicious = Object.defineProperties({}, {
      version: { enumerable: true, value: "native-fetch-diagnostic-v1" },
      kind: { enumerable: true, get: () => { getterReads++; return "headers-timeout"; } },
    }) as fetchDiagnosticModule.NativeFetchDiagnostic;
    retainedSummaryObserver?.(malicious);
    expect(getterReads).toBe(0);
    expect(projectionCalls).toBe(0);
    expect(result).toBe(completeSummaryObject);
    expect(result).toEqual(completeSummary);
    expect(injected.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
