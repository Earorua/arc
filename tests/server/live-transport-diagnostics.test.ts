// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import * as transportDiagnosticModule from "../../app/server/research/transport-diagnostic";
import { fixtureResponse, LIVE_POLICY, runValidation } from "../../scripts/live-research/validation";

const key = "synthetic-transport-observation";
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, is_management_key: false,
  is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";

type Summary = Awaited<ReturnType<typeof runValidation>>;

const { projectTransportDiagnostic } = transportDiagnosticModule;

afterEach(() => { vi.restoreAllMocks(); });

function expectUtcTimestamp(value: string | null) {
  expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  expect(Number.isFinite(Date.parse(value!))).toBe(true);
}

function expectOneGuardedRoundTrip(fetch: ReturnType<typeof vi.fn>, result: Summary, researchHttpStatus: number | null) {
  expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
  ]);
  expect(result).toMatchObject({
    mode: "live-one", outcome: "incomplete", reason: "research-failed", runState: "failed",
    keyHttpStatus: 200, researchHttpStatus, realRequestCount: 2, researchRequestCount: 1,
    repairRequestCount: 0, auditCount: 1,
    reservation: { status: "conservative-hold", maximumMicros: LIVE_POLICY.maximumMicros, settledMicros: 0 },
    ownerWrongReadRejected: true, secondResearchRejected: true,
    freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0, databaseDisposed: true,
  });
  expectUtcTimestamp(result.researchStartedAt);
}

describe("live Research transport diagnostics", () => {
  it("summarizes truncated HTTP 200 JSON through the actual guarded validation path", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL
      ? Response.json(safeKeyData)
      : new Response('{"CANARY-private-body":', { status: 200 }));

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      mode: "live-one", outcome: "incomplete", reason: "research-failed",
      runState: "failed", failureCategory: "invalid-result", researchHttpStatus: 200,
      actualModel: null, usage: null,
      researchAttemptDiagnostic: { status: "failed", errorCode: "invalid-transport", charged: "unknown" },
      reservation: { status: "conservative-hold", maximumMicros: LIVE_POLICY.maximumMicros, settledMicros: 0 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0, databaseDisposed: true,
      researchTransportDiagnostic: {
        version: "transport-diagnostic-v3", phase: "outer-json", reason: "invalid-json",
        receivedBytes: new TextEncoder().encode('{"CANARY-private-body":').byteLength,
        bodyComplete: true, localCancellation: "none", nativeErrorKind: null, localCancellationElapsedMs: null,
        responseFormat: { contentType: "text", bodyPrefixKind: "json-container-like" },
      },
    });
    expectOneGuardedRoundTrip(fetch, result, 200);
    expect(result.researchTransportDiagnostic?.headersElapsedMs).toBeTypeOf("number");
    expect(result.researchTransportDiagnostic?.bodyEndElapsedMs).toBeTypeOf("number");
    expect(Object.keys(result.researchTransportDiagnostic!).sort()).toEqual([
      "bodyComplete", "bodyEndElapsedMs", "headersElapsedMs", "localCancellation", "localCancellationElapsedMs",
      "nativeErrorKind", "phase", "reason", "receivedBytes", "responseFormat", "version",
    ]);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it("reprojects the strict v3 observer value and rejects unknown transport properties", async () => {
    let projectionCount = 0;
    vi.spyOn(transportDiagnosticModule, "projectTransportDiagnostic").mockImplementation((value) => {
      projectionCount++;
      const projected = projectTransportDiagnostic(value);
      if (projectionCount !== 1 || !projected) return projected;
      return { ...projected, privateBody: "CANARY-unknown-observer-property" } as unknown as typeof projected;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL
      ? Response.json(safeKeyData)
      : new Response("CANARY-invalid-json", { status: 200 }));

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(projectionCount).toBe(2);
    expect(result.researchTransportDiagnostic).toBeNull();
    expectOneGuardedRoundTrip(fetch, result, 200);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it.each([
    ["native headers timeout", () => { throw Object.assign(new Error("CANARY-native-message"), { code: "UND_ERR_HEADERS_TIMEOUT" }); }, null],
    ["generic fetch failure", () => { throw new Error("CANARY-generic-message"); }, null],
    ["redirect", () => new Response("CANARY-redirect-body", { status: 302, headers: { Location: "https://canary.invalid" } }), 302],
  ] as const)("reports the guard-wrapped %s only as a safe fetch failure", async (_label, researchResponse, status) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL ? Response.json(safeKeyData) : researchResponse());

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      failureCategory: "service-unavailable", actualModel: null, usage: null,
      researchAttemptDiagnostic: { status: "failed", errorCode: "unavailable", charged: "unknown" },
      researchRunDiagnostic: { errorCode: "unavailable", quality: null },
      researchTransportDiagnostic: {
        version: "transport-diagnostic-v3", phase: "fetch", reason: "fetch-error", receivedBytes: 0,
        bodyComplete: false, localCancellation: "none", nativeErrorKind: "other",
        headersElapsedMs: null, bodyEndElapsedMs: null, localCancellationElapsedMs: null, responseFormat: null,
      },
    });
    expectOneGuardedRoundTrip(fetch, result, status);
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expect(JSON.stringify(result)).not.toContain("UND_ERR_HEADERS_TIMEOUT");
  });

  it("retains a native body-timeout classification when the guarded HTTP 200 reader rejects", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() { throw Object.assign(new Error("CANARY-body-timeout-message"), { code: "UND_ERR_BODY_TIMEOUT" }); },
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL
      ? Response.json(safeKeyData)
      : new Response(stream, { status: 200 }));

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      failureCategory: "service-unavailable", actualModel: null, usage: null,
      researchAttemptDiagnostic: { status: "failed", errorCode: "unavailable", charged: "unknown" },
      researchRunDiagnostic: { errorCode: "unavailable", quality: null },
      researchTransportDiagnostic: {
        version: "transport-diagnostic-v3", phase: "body-read", reason: "body-read-error", receivedBytes: 0,
        bodyComplete: false, localCancellation: "reject-read-abort", nativeErrorKind: "body-timeout", responseFormat: null,
      },
    });
    expect(result.researchTransportDiagnostic?.headersElapsedMs).toBeTypeOf("number");
    expect(result.researchTransportDiagnostic?.bodyEndElapsedMs).toBeTypeOf("number");
    expect(result.researchTransportDiagnostic?.localCancellationElapsedMs).toBeTypeOf("number");
    expectOneGuardedRoundTrip(fetch, result, 200);
    expect(stream.locked).toBe(false);
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expect(JSON.stringify(result)).not.toContain("UND_ERR_BODY_TIMEOUT");
  });

  it("reports the exact byte-limit sentinel and cancels an oversized guarded body", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(524_289)); },
      cancel,
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL
      ? Response.json(safeKeyData)
      : new Response(stream, { status: 200 }));

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      failureCategory: "invalid-result", actualModel: null, usage: null,
      researchAttemptDiagnostic: { status: "failed", errorCode: "invalid-transport", charged: "unknown" },
      researchRunDiagnostic: { errorCode: "invalid-transport", quality: null },
      researchTransportDiagnostic: {
        version: "transport-diagnostic-v3", phase: "body-read", reason: "body-too-large", receivedBytes: 524_289,
        bodyComplete: false, localCancellation: "reject-read-abort", nativeErrorKind: null, responseFormat: null,
      },
    });
    expectOneGuardedRoundTrip(fetch, result, 200);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it("keeps successful Research trustworthy while recording only its UTC invocation time", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL ? Response.json(safeKeyData) : fixtureResponse());

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      mode: "live-one", outcome: "passed", reason: null, runState: "ready", quality: { passed: true, issueCodes: [] },
      actualModel: LIVE_POLICY.model, usage: { totalTokens: 9000, costMicros: 100000, webSearchRequests: 2 },
      reservation: { status: "settled", maximumMicros: LIVE_POLICY.maximumMicros, settledMicros: 100000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true,
      researchTransportDiagnostic: null,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expectUtcTimestamp(result.researchStartedAt);
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
    ]);
  });

  it("leaves both transport fields null until an explicitly requested Research adapter invocation", async () => {
    const ignoredFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("CANARY-ignored"); });
    const keyOnlyFetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(safeKeyData));
    const invalidKeyFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("CANARY-invalid-key-ignored"); });

    const offline = await runValidation({ key: "CANARY-ignored-key", fetch: ignoredFetch });
    const keyOnly = await runValidation({ checkKeyOnly: true, key, fetch: keyOnlyFetch });
    const preAdapterFailure = await runValidation({ executeOne: true, key: "invalid key", fetch: invalidKeyFetch });

    expect(offline).toMatchObject({ outcome: "passed", realRequestCount: 0,
      researchTransportDiagnostic: null, researchStartedAt: null, databaseDisposed: true });
    expect(keyOnly).toMatchObject({ outcome: "passed", realRequestCount: 1, researchRequestCount: 0,
      researchTransportDiagnostic: null, researchStartedAt: null, databaseDisposed: true });
    expect(preAdapterFailure).toMatchObject({ outcome: "incomplete", reason: "key-invalid", realRequestCount: 0,
      researchTransportDiagnostic: null, researchStartedAt: null, databaseDisposed: true });
    expect(ignoredFetch).not.toHaveBeenCalled();
    expect(keyOnlyFetch).toHaveBeenCalledOnce();
    expect(invalidKeyFetch).not.toHaveBeenCalled();
    expect(JSON.stringify([offline, keyOnly, preAdapterFailure])).not.toContain("CANARY");
  });

  it("keeps provider and candidate observations on a semantic failure without a transport diagnosis", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      const payload = await fixtureResponse().json() as { choices: Array<{ message: { content: string } }> };
      const candidate = JSON.parse(payload.choices[0]!.message.content) as Record<string, unknown>;
      delete candidate.evidence;
      candidate.privateBody = "CANARY-semantic-private";
      payload.choices[0]!.message.content = JSON.stringify(candidate);
      return Response.json(payload);
    });

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed",
      providerResultDiagnostic: { outcome: "accepted", reason: null },
      researchCandidateDiagnostic: { outcome: "rejected", reason: "schema-rejected" },
      researchTransportDiagnostic: null,
      usage: { totalTokens: 9000, costMicros: 100000 }, reservation: { status: "settled", settledMicros: 100000 },
      freshAccountActivated: false, planningGenerated: false, databaseDisposed: true,
    });
    expectUtcTimestamp(result.researchStartedAt);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it("isolates the Summary transport projector from the original guarded failure behavior", async () => {
    let projectionCount = 0;
    vi.spyOn(transportDiagnosticModule, "projectTransportDiagnostic").mockImplementation((value) => {
      projectionCount++;
      if (projectionCount === 1) return projectTransportDiagnostic(value);
      throw new Error("CANARY-summary-projector");
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL
      ? Response.json(safeKeyData)
      : new Response('{"CANARY-private-body":', { status: 200 }));

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(projectionCount).toBe(2);
    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed", failureCategory: "invalid-result",
      researchAttemptDiagnostic: { status: "failed", errorCode: "invalid-transport", charged: "unknown" },
      reservation: { status: "conservative-hold", settledMicros: 0 },
      researchTransportDiagnostic: null, ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: false, planningGenerated: false, databaseDisposed: true,
    });
    expectOneGuardedRoundTrip(fetch, result, 200);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });
});
