// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchRunPublicViewSchema } from "../../app/contracts/research";
import * as openRouterProviderModule from "../../app/server/research/openrouter-provider";
import { ResearchOrchestrator } from "../../app/server/research/orchestrator";
import * as transportDiagnosticModule from "../../app/server/research/transport-diagnostic";
import { fixtureResponse, LIVE_POLICY, runValidation, type ValidationSummary } from "../../scripts/live-research/validation";
import * as sqliteD1Module from "../helpers/sqlite-d1";

const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const key = "synthetic-format";
const request = { role: "Synthetic Quality Contract Role", locale: "en-US" } as const;
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0,
  is_management_key: false, is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const tables = ["research_runs", "research_packages", "ai_runs", "quota_ledger", "ai_budget_reservations",
  "ai_budget_buckets", "idempotency_records"] as const;
const originalCreateDatabase = sqliteD1Module.createResearchD1;
const originalCreateLocalProvider = openRouterProviderModule.createKimiLocalValidationProvider;
const originalProjectTransportDiagnostic = transportDiagnosticModule.projectTransportDiagnostic;
const originalStart = ResearchOrchestrator.prototype.start;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("global network denied"); }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function guardedFetch(response: () => Response) {
  return vi.fn<typeof globalThis.fetch>(async (url) => {
    if (url === KEY_URL) return Response.json(safeKeyData);
    if (url === RESEARCH_URL) return response();
    throw new Error("unexpected synthetic URL");
  });
}

function expectFailedFormatRun(result: ValidationSummary, injected: ReturnType<typeof guardedFetch>) {
  expect(injected.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
  ]);
  expect(result).toMatchObject({
    mode: "live-one", outcome: "incomplete", reason: "research-failed", runState: "failed",
    failureCategory: "invalid-result", keyHttpStatus: 200, researchHttpStatus: 200,
    actualModel: null, usage: null, realRequestCount: 2, researchRequestCount: 1,
    repairRequestCount: 0, auditCount: 1,
    researchAttemptDiagnostic: { status: "failed", errorCode: "invalid-transport", charged: "unknown" },
    researchRunDiagnostic: { errorCode: "invalid-transport", quality: null },
    reservation: { status: "conservative-hold", maximumMicros: 5_000_000, settledMicros: 0 },
    ownerWrongReadRejected: true, secondResearchRejected: true, databaseDisposed: true,
    freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0,
    researchPolicy: { profileId: "kimi-low-output32k-v3", reasoningEffort: "low", maxOutputTokens: 32_768,
      outputPolicyVersion: "kimi-complete-quality-v2", researchTimeoutMs: 1_200_000,
      activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000 },
  });
}

function sha256(body: string) {
  return { bytes: new TextEncoder().encode(body).byteLength,
    sha256: createHash("sha256").update(body).digest("hex") };
}

function responseBody(call: [input: RequestInfo | URL, init?: RequestInit]) {
  expect(call[1]?.body).toBeTypeOf("string");
  return call[1]!.body as string;
}

type CapturedRows = Record<(typeof tables)[number], unknown[]>;
type ObserverMode = "baseline" | "disabled" | "throw" | "reject" | "pending";

function captureRowsBeforeClose() {
  let rows: CapturedRows | null = null;
  let closed = false;
  const spy = vi.spyOn(sqliteD1Module, "createResearchD1").mockImplementation(() => {
    const database = originalCreateDatabase();
    const close = database.close.bind(database);
    database.close = () => {
      rows = Object.fromEntries(tables.map((table) => [table,
        database.database.prepare(`SELECT * FROM ${table}`).all()])) as CapturedRows;
      close();
      closed = true;
      expect(() => database.database.prepare("SELECT 1")).toThrow();
    };
    return database;
  });
  return { spy, read: () => ({ rows, closed }) };
}

function stableBusinessState(summary: ValidationSummary, publicRun: unknown, durable: CapturedRows) {
  const business: Partial<ValidationSummary> = { ...summary };
  delete business.timestamp;
  delete business.researchElapsedMs;
  delete business.researchStartedAt;
  delete business.researchTransportDiagnostic;
  const ids = new Map<string, string>();
  const token = (map: Map<string, string>, value: string, prefix: string) => {
    let found = map.get(value);
    if (!found) { found = `<${prefix}-${map.size + 1}>`; map.set(value, found); }
    return found;
  };
  const normalizeString = (value: string) => value
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu,
      (match) => token(ids, match, "id"))
    .replace(/research-(?:attempt|quota)-[0-9a-f]{32}/gu,
      (match) => token(ids, match, "derived-id"));
  const normalize = (value: unknown): unknown => {
    if (typeof value === "string") return normalizeString(value);
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        .map(([name, child]) => [name, /(?:elapsedMs|ElapsedMs|latency_ms)$/u.test(name) ? "<duration>" : normalize(child)]));
    return value;
  };
  return normalize({ business, publicRun, durable });
}

async function durableScenario(mode: ObserverMode) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-12T12:00:00.000Z"));
  const capture = captureRowsBeforeClose();
  let publicRun: Awaited<ReturnType<ResearchOrchestrator["start"]>> | null = null;
  const startSpy = vi.spyOn(ResearchOrchestrator.prototype, "start").mockImplementation(async function (
    this: ResearchOrchestrator, ownerId, input, context,
  ) {
    const result = await originalStart.call(this, ownerId, input, context);
    publicRun = structuredClone(result);
    return result;
  });
  let observerCalls = 0;
  const providerSpy = vi.spyOn(openRouterProviderModule, "createKimiLocalValidationProvider")
    .mockImplementation((options) => {
      const summaryObserver = options.onTransportDiagnostic;
      const onTransportDiagnostic = mode === "disabled" ? undefined : mode === "baseline"
        ? (diagnostic: Parameters<NonNullable<typeof summaryObserver>>[0]) => {
          observerCalls++;
          return summaryObserver?.(diagnostic);
        }
        : mode === "throw" ? () => { observerCalls++; throw new Error("CANARY-observer-throw"); }
          : mode === "reject" ? async () => { observerCalls++; throw new Error("CANARY-observer-reject"); }
            : () => { observerCalls++; return new Promise<never>(() => undefined); };
      return originalCreateLocalProvider({ ...options, onTransportDiagnostic });
    });
  const injected = guardedFetch(() => new Response("<html>CANARY-private-body", {
    status: 200, headers: { "Content-Type": "application/json", "X-Private": "CANARY-private-header" },
  }));
  const completion = runValidation({ executeOne: true, key, fetch: injected });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([completion, new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("observer delayed validation completion")), 5_000);
  })]).finally(() => clearTimeout(timeout));
  await Promise.resolve();
  const captured = capture.read();
  expect(captured.closed).toBe(true);
  expect(captured.rows).not.toBeNull();
  expect(researchRunPublicViewSchema.safeParse(publicRun).success).toBe(true);
  expect(observerCalls).toBe(mode === "disabled" ? 0 : 1);
  expectFailedFormatRun(result, injected);
  expect(JSON.stringify(result)).not.toContain("CANARY");
  expect(JSON.stringify(captured.rows)).not.toMatch(/CANARY|responseFormat|bodyPrefixKind|transport-diagnostic-v3/u);
  providerSpy.mockRestore();
  capture.spy.mockRestore();
  startSpy.mockRestore();
  vi.useRealTimers();
  return { result, publicRun, durable: captured.rows! };
}

type MaliciousNestedValue = { responseFormat: unknown; reads: () => number };
const maliciousNestedCases: ReadonlyArray<readonly [string, () => MaliciousNestedValue]> = [
  ["nested getter", () => {
    let reads = 0;
    const responseFormat = Object.defineProperties({}, {
      contentType: { enumerable: true, get: () => { reads++; return "text"; } },
      bodyPrefixKind: { enumerable: true, value: "html-like" },
    });
    return { responseFormat, reads: (): number => reads };
  }],
  ["nested symbol", () => ({ responseFormat: Object.assign({ contentType: "text", bodyPrefixKind: "html-like" },
    { [Symbol("CANARY-private-symbol")]: "CANARY-private-symbol-value" }), reads: (): number => 0 })],
  ["nested extra property", () => ({ responseFormat: { contentType: "text", bodyPrefixKind: "html-like",
    privateBody: "CANARY-private-extra" }, reads: (): number => 0 })],
  ["nested illegal enum", () => ({ responseFormat: { contentType: "CANARY-illegal-enum",
    bodyPrefixKind: "html-like" }, reads: (): number => 0 })],
];

describe("guarded live response-format Summary", () => {
  it.each([
    ["ascii whitespace", " ".repeat(1_100), "text/plain", "text", "ascii-whitespace-only"],
    ["HTML", "<html>CANARY-private-body</html>".padEnd(1_100, " "), "text/plain", "text", "html-like"],
    ["SSE", "data: CANARY-private-body".padEnd(1_100, " "), "text/plain", "text", "sse-like"],
    ["truncated JSON", '{"CANARY-private-body":'.padEnd(1_100, " "), "text/plain", "text", "json-container-like"],
    ["contradictory HTML header and JSON body", '{"CANARY-private-body":'.padEnd(1_100, " "), "text/html", "html", "json-container-like"],
  ] as const)("projects fixed safe format evidence for %s", async (_label, body, contentType, expectedContentType, bodyPrefixKind) => {
    expect(new TextEncoder().encode(body)).toHaveLength(1_100);
    const injected = guardedFetch(() => new Response(body, { status: 200, headers: {
      "Content-Type": contentType, "X-Private": "CANARY-private-header",
    } }));

    const result = await runValidation({ executeOne: true, key, fetch: injected });

    expectFailedFormatRun(result, injected);
    expect(result.researchTransportDiagnostic).toMatchObject({
      version: "transport-diagnostic-v3", phase: "outer-json", reason: "invalid-json", receivedBytes: 1_100,
      bodyComplete: true, localCancellation: "none", nativeErrorKind: null, localCancellationElapsedMs: null,
      responseFormat: { contentType: expectedContentType, bodyPrefixKind },
    });
    const diagnostic = result.researchTransportDiagnostic;
    expect(diagnostic?.version).toBe("transport-diagnostic-v3");
    if (!diagnostic || diagnostic.version !== "transport-diagnostic-v3") throw new Error("expected synthetic v3 diagnostic");
    expect(Object.keys(diagnostic.responseFormat!).sort()).toEqual(["bodyPrefixKind", "contentType"]);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it.each(maliciousNestedCases)("drops the whole invalid v3 value for a %s without changing the failure", async (_label, malicious) => {
    const value = malicious();
    let projectionCount = 0;
    vi.spyOn(transportDiagnosticModule, "projectTransportDiagnostic").mockImplementation((input) => {
      projectionCount++;
      const projected = originalProjectTransportDiagnostic(input);
      if (projectionCount !== 1 || !projected || projected.version !== "transport-diagnostic-v3") return projected;
      return { ...projected, responseFormat: value.responseFormat } as unknown as typeof projected;
    });
    const injected = guardedFetch(() => new Response("<html>CANARY-private-body", {
      status: 200, headers: { "Content-Type": "text/plain" },
    }));

    const result = await runValidation({ executeOne: true, key, fetch: injected });

    expect(projectionCount).toBe(2);
    expect(value.reads()).toBe(0);
    expect(result.researchTransportDiagnostic).toBeNull();
    expectFailedFormatRun(result, injected);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it("retains the original invalid-transport failure when final Summary projection throws", async () => {
    let projectionCount = 0;
    vi.spyOn(transportDiagnosticModule, "projectTransportDiagnostic").mockImplementation((input) => {
      projectionCount++;
      if (projectionCount === 2) throw new Error("CANARY-summary-projector");
      return originalProjectTransportDiagnostic(input);
    });
    const injected = guardedFetch(() => new Response("<html>CANARY-private-body", { status: 200 }));

    const result = await runValidation({ executeOne: true, key, fetch: injected });

    expect(projectionCount).toBe(2);
    expect(result.researchTransportDiagnostic).toBeNull();
    expectFailedFormatRun(result, injected);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });
});

describe("response-format observation noninterference", () => {
  it("keeps public business state and every relevant SQLite table equivalent across observer outcomes", async () => {
    const baseline = await durableScenario("baseline");
    const expected = stableBusinessState(baseline.result, baseline.publicRun, baseline.durable);

    for (const mode of ["disabled", "throw", "reject", "pending"] as const) {
      const scenario = await durableScenario(mode);
      expect(stableBusinessState(scenario.result, scenario.publicRun, scenario.durable)).toEqual(expected);
    }
  }, 30_000);

  it("keeps a valid fixture Ready with activation and six planned units", async () => {
    const injected = guardedFetch(() => fixtureResponse());

    const result = await runValidation({ executeOne: true, key, fetch: injected });

    expect(result).toMatchObject({
      outcome: "passed", reason: null, runState: "ready", quality: { passed: true, issueCodes: [] },
      actualModel: LIVE_POLICY.model, usage: { totalTokens: 9_000, costMicros: 100_000, webSearchRequests: 2 },
      reservation: { status: "settled", maximumMicros: LIVE_POLICY.maximumMicros, settledMicros: 100_000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0,
      freshAccountActivated: true, planningGenerated: true, planningUnitCount: 6, databaseDisposed: true,
      researchTransportDiagnostic: null,
    });
    expect(injected).toHaveBeenCalledTimes(2);
  });

  it("keeps the default path offline with no global fetch or guarded key request", async () => {
    const deniedGlobalFetch = globalThis.fetch as ReturnType<typeof vi.fn>;

    const result = await runValidation();

    expect(result).toMatchObject({ mode: "offline-dry-run", outcome: "passed", reason: null,
      keyHttpStatus: null, keyDiagnostics: null, realRequestCount: 0, researchRequestCount: 1,
      repairRequestCount: 0, runState: "ready", freshAccountActivated: true,
      planningGenerated: true, planningUnitCount: 6, databaseDisposed: true });
    expect(deniedGlobalFetch).not.toHaveBeenCalled();
  });
});

describe("response-format request byte identity", () => {
  it("matches the frozen local Research fingerprint with observation disabled and enabled", async () => {
    const fingerprints = [];
    for (const enabled of [false, true]) {
      const observer = vi.fn();
      const injected = vi.fn<typeof globalThis.fetch>(async () => fixtureResponse());
      const provider = openRouterProviderModule.createKimiLocalValidationProvider({ key, fetch: injected,
        ...(enabled ? { onTransportDiagnostic: observer } : {}) });
      await provider.research(request);
      fingerprints.push(sha256(responseBody(injected.mock.calls[0]!)));
      expect(observer).not.toHaveBeenCalled();
    }
    expect(fingerprints).toEqual([
      { bytes: 23_801, sha256: "3063ec32a2b204460913a5ab2b97702c2094936507c77e08143feb9805dd59bf" },
      { bytes: 23_801, sha256: "3063ec32a2b204460913a5ab2b97702c2094936507c77e08143feb9805dd59bf" },
    ]);
  });

  it("matches frozen standard Research and Repair fingerprints with a supported observer absent and present", async () => {
    const fingerprints: Array<{ research: ReturnType<typeof sha256>; repair: ReturnType<typeof sha256> }> = [];
    for (const enabled of [false, true]) {
      const observer = vi.fn();
      const injected = vi.fn<typeof globalThis.fetch>(async () => fixtureResponse());
      const provider = new openRouterProviderModule.OpenRouterResearchProvider({
        OPENROUTER_API_KEY: "synthetic-dummy-credential", ARC_AI_MODEL_RESEARCH: "test/research-fixed",
        ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
      }, { fetch: injected, ...(enabled ? { onFailureDiagnostic: observer } : {}) });
      await provider.research(request);
      await provider.repair({ ...request, originalContent: JSON.stringify({ synthetic: true }), annotations: [] });
      fingerprints.push({ research: sha256(responseBody(injected.mock.calls[0]!)),
        repair: sha256(responseBody(injected.mock.calls[1]!)) });
      expect(observer).not.toHaveBeenCalled();
    }
    expect(fingerprints).toEqual([0, 1].map(() => ({
      research: { bytes: 21_131, sha256: "f50977dc802c04e18e08a073138703d332cf4f8a85444a76bbe167a74f6d2938" },
      repair: { bytes: 7_295, sha256: "42e8ea328df2aaa618cd684a7f59c7920bc4d181409c582df1d9f9b032d0f2be" },
    })));
  });
});
