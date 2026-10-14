// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import * as responsePreflightModule from "../../app/server/research/response-preflight-diagnostic";
import { fixtureResponse, runValidation } from "../../scripts/live-research/validation";
import { validResearchCandidate } from "../fixtures/research/valid-candidate";

const KEY = "synthetic-response-preflight-key";
const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const SAFE_KEY = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0,
  is_management_key: false, is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const { projectResponsePreflightDiagnostic } = responsePreflightModule;

type Annotation = { type?: unknown; url_citation?: { url?: unknown; title?: unknown; content?: unknown }; [key: string]: unknown };
type Payload = {
  model: string;
  choices: Array<{ finish_reason: unknown; message: { content: unknown; annotations: unknown }; [key: string]: unknown }>;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
};
type Summary = Awaited<ReturnType<typeof runValidation>>;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function payloadFixture(): Promise<Payload> {
  return await fixtureResponse().json() as Payload;
}

async function syntheticRun(
  change?: (payload: Payload) => void,
  response?: (payload: Payload) => Response | Promise<Response>,
): Promise<{ result: Summary; fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>; globalFetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>> }> {
  const payload = await payloadFixture();
  change?.(payload);
  const globalFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("CANARY-global-fetch-denied"); });
  vi.stubGlobal("fetch", globalFetch);
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    if (url === KEY_URL) {
      expect(init).toMatchObject({ method: "GET", redirect: "error" });
      return Response.json(SAFE_KEY);
    }
    expect(url).toBe(RESEARCH_URL);
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    return response ? response(payload) : Response.json(payload);
  });
  return { result: await runValidation({ executeOne: true, key: KEY, fetch }), fetch, globalFetch };
}

function annotations(payload: Payload): Annotation[] {
  return payload.choices[0]!.message.annotations as Annotation[];
}

function setCandidate(payload: Payload, change: (candidate: Record<string, unknown>) => void) {
  const candidate = structuredClone(validResearchCandidate) as unknown as Record<string, unknown>;
  change(candidate);
  payload.choices[0]!.message.content = JSON.stringify(candidate);
}

function expectOneSyntheticRoundTrip(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>, globalFetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) {
  expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
  ]);
  expect(globalFetch).not.toHaveBeenCalled();
}

describe("local response preflight summary", () => {
  it("reports bad annotations and a bad raw candidate independently before the business parser", async () => {
    const { result, fetch, globalFetch } = await syntheticRun((payload) => {
      annotations(payload)[0]!.url_citation!.title = null;
      setCandidate(payload, (candidate) => { delete candidate.evidence; });
    });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed",
      researchResponsePreflightDiagnostic: {
        version: "response-preflight-v1", stage: "complete-content-preflight",
        annotations: { state: "incompatible", issues: [{ index: 0, code: "title-null" }] },
        candidateSchema: { outcome: "rejected", reason: "schema-rejected",
          issues: [{ path: "evidence", code: "invalid-type" }], truncated: false },
      },
      researchCandidateDiagnostic: null,
      researchRunDiagnostic: { errorCode: "invalid-transport", quality: null },
      reservation: { status: "settled", settledMicros: 100_000 },
      ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0,
      repairRequestCount: 0, databaseDisposed: true,
    });
    expectOneSyntheticRoundTrip(fetch, globalFetch);
  });

  it("retains a schema-accepted preflight when bad annotations stop the actual candidate parser", async () => {
    const { result, fetch, globalFetch } = await syntheticRun((payload) => {
      annotations(payload)[0]!.url_citation!.title = null;
    });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed",
      researchResponsePreflightDiagnostic: {
        annotations: { state: "incompatible", issues: [{ index: 0, code: "title-null" }] },
        candidateSchema: { outcome: "accepted", reason: null, issues: [], truncated: false },
      },
      researchCandidateDiagnostic: null,
      researchRunDiagnostic: { errorCode: "invalid-transport", quality: null },
      reservation: { status: "settled", settledMicros: 100_000 },
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0,
    });
    expectOneSyntheticRoundTrip(fetch, globalFetch);
  });

  it("keeps a good annotation preflight separate from the authoritative schema rejection", async () => {
    const { result, fetch, globalFetch } = await syntheticRun((payload) => {
      setCandidate(payload, (candidate) => { delete candidate.evidence; });
    });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed",
      researchResponsePreflightDiagnostic: {
        annotations: { state: "compatible", issues: [] },
        candidateSchema: { outcome: "rejected", reason: "schema-rejected",
          issues: [{ path: "evidence", code: "invalid-type" }], truncated: false },
      },
      researchCandidateDiagnostic: { outcome: "rejected", reason: "schema-rejected",
        issues: [{ path: "evidence", code: "invalid-type" }], truncated: false },
      researchRunDiagnostic: { errorCode: "invalid-result", quality: { passed: false, issueCodes: ["invalid-schema"] } },
      reservation: { status: "settled", settledMicros: 100_000 },
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0,
    });
    expectOneSyntheticRoundTrip(fetch, globalFetch);
  });

  it("reports both accepted preflights without changing the complete service outcome", async () => {
    const { result, fetch, globalFetch } = await syntheticRun();

    expect(result).toMatchObject({
      outcome: "passed", reason: null, runState: "ready", quality: { passed: true, issueCodes: [], issueCount: 0 },
      researchResponsePreflightDiagnostic: {
        version: "response-preflight-v1", stage: "complete-content-preflight",
        annotations: { state: "compatible", issues: [], truncated: false },
        candidateSchema: { outcome: "accepted", reason: null, issues: [], truncated: false },
      },
      researchCandidateDiagnostic: { outcome: "accepted", reason: null, issues: [], truncated: false },
      researchRunDiagnostic: { errorCode: null, quality: { passed: true, issueCodes: [] } },
      usage: { promptTokens: 3_000, completionTokens: 6_000, totalTokens: 9_000, costMicros: 100_000, webSearchRequests: 2 },
      reservation: { status: "settled", maximumMicros: 5_000_000, settledMicros: 100_000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true,
      researchPolicy: { profileId: "kimi-low-output32k-v3", reasoningEffort: "low", maxOutputTokens: 32_768,
        outputPolicyVersion: "kimi-complete-quality-v2", researchTimeoutMs: 1_200_000,
        activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000 },
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expect(new TextEncoder().encode(JSON.stringify(result.researchResponsePreflightDiagnostic)).byteLength).toBeLessThanOrEqual(8_192);
    expectOneSyntheticRoundTrip(fetch, globalFetch);
  });

  it("distinguishes raw fenced JSON preflight syntax from later normalized acceptance", async () => {
    const { result, fetch, globalFetch } = await syntheticRun((payload) => {
      payload.choices[0]!.message.content = `\`\`\`json\n${String(payload.choices[0]!.message.content)}\n\`\`\``;
    });

    expect(result).toMatchObject({
      outcome: "passed", runState: "ready", quality: { passed: true },
      researchResponsePreflightDiagnostic: {
        annotations: { state: "compatible" },
        candidateSchema: { outcome: "rejected", reason: "json-syntax", issues: [], truncated: false },
      },
      researchCandidateDiagnostic: { outcome: "accepted", reason: null, issues: [], truncated: false },
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expectOneSyntheticRoundTrip(fetch, globalFetch);
  });

  it("does not let schema-valid preflight metadata rescue source-unsafe markup", async () => {
    const canary = "<script>CANARY-private-title</script>";
    const { result, fetch, globalFetch } = await syntheticRun((payload) => {
      annotations(payload)[0]!.url_citation!.title = canary;
      payload.privateResponse = "CANARY-private-response";
      payload.choices[0]!.message.annotations = annotations(payload).map((annotation, index) =>
        index === 0 ? { ...annotation, content: "CANARY-private-annotation" } : annotation);
    });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed",
      researchResponsePreflightDiagnostic: {
        annotations: { state: "compatible", issues: [] },
        candidateSchema: { outcome: "accepted", reason: null, issues: [] },
      },
      researchCandidateDiagnostic: null,
      researchRunDiagnostic: { errorCode: "invalid-transport", quality: null },
      reservation: { status: "settled", settledMicros: 100_000 },
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0,
    });
    expect(JSON.stringify(result.researchResponsePreflightDiagnostic)).not.toContain("CANARY");
    expectOneSyntheticRoundTrip(fetch, globalFetch);
  });

  it("keeps missing usage on conservative hold even when both preflights accept", async () => {
    const { result, fetch, globalFetch } = await syntheticRun((payload) => { delete payload.usage; });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "validation-incomplete", runState: "ready",
      researchResponsePreflightDiagnostic: {
        annotations: { state: "compatible" }, candidateSchema: { outcome: "accepted", reason: null },
      },
      researchCandidateDiagnostic: { outcome: "accepted", reason: null },
      usage: null, reservation: { status: "conservative-hold", settledMicros: 0 },
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expectOneSyntheticRoundTrip(fetch, globalFetch);
  });

  it("records the authored offline adapter preflight with zero external requests", async () => {
    const globalFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("CANARY-global-fetch-denied"); });
    vi.stubGlobal("fetch", globalFetch);

    const result = await runValidation();

    expect(result).toMatchObject({
      mode: "offline-dry-run", outcome: "passed", reason: null,
      researchResponsePreflightDiagnostic: {
        annotations: { state: "compatible" }, candidateSchema: { outcome: "accepted", reason: null },
      },
      realRequestCount: 0, researchRequestCount: 1, repairRequestCount: 0,
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["projector null", () => vi.spyOn(responsePreflightModule, "projectResponsePreflightDiagnostic").mockReturnValue(null)],
    ["projector throw", () => vi.spyOn(responsePreflightModule, "projectResponsePreflightDiagnostic").mockImplementation(() => {
      throw new Error("CANARY-projector-throw");
    })],
  ] as const)("isolates %s from an accepted business result", async (_label, arrange) => {
    arrange();
    const { result, fetch, globalFetch } = await syntheticRun();

    expect(result).toMatchObject({ outcome: "passed", runState: "ready", researchResponsePreflightDiagnostic: null,
      researchCandidateDiagnostic: { outcome: "accepted" }, reservation: { status: "settled", settledMicros: 100_000 },
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true });
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expectOneSyntheticRoundTrip(fetch, globalFetch);
  });

  it("uses the real projector to reject unsafe callback metadata without changing rejection or settlement", async () => {
    vi.spyOn(responsePreflightModule, "projectResponsePreflightDiagnostic").mockImplementation((input) =>
      projectResponsePreflightDiagnostic({ ...input as object, privateBody: "CANARY-unknown-key",
        get privateGetter(): never { throw new Error("CANARY-getter"); } }));
    const { result, fetch, globalFetch } = await syntheticRun((payload) => {
      annotations(payload)[0]!.url_citation!.title = null;
    });

    expect(result).toMatchObject({ outcome: "incomplete", reason: "research-failed", runState: "failed",
      researchResponsePreflightDiagnostic: null, researchCandidateDiagnostic: null,
      researchRunDiagnostic: { errorCode: "invalid-transport", quality: null },
      reservation: { status: "settled", settledMicros: 100_000 },
      freshAccountActivated: false, planningGenerated: false, databaseDisposed: true });
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expectOneSyntheticRoundTrip(fetch, globalFetch);
  });

  it("keeps preflight null when complete bounded content is unavailable", async () => {
    const cases: Array<{ name: string; run: () => Promise<Summary> }> = [
      { name: "missing key", run: async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(SAFE_KEY));
        const result = await runValidation({ executeOne: true, fetch });
        expect(fetch).not.toHaveBeenCalled();
        return result;
      } },
      { name: "key check only", run: async () => {
        const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(SAFE_KEY));
        const result = await runValidation({ checkKeyOnly: true, key: KEY, fetch });
        expect(fetch).toHaveBeenCalledOnce();
        return result;
      } },
      { name: "HTTP error", run: async () => (await syntheticRun(undefined,
        () => new Response("CANARY-private-http", { status: 503 }))).result },
      { name: "length completion", run: async () => (await syntheticRun((payload) => {
        payload.choices[0]!.finish_reason = "length";
      })).result },
      { name: "oversize content", run: async () => (await syntheticRun((payload) => {
        payload.choices[0]!.message.content = "x".repeat(196_609);
      })).result },
      { name: "transport rejection", run: async () => (await syntheticRun(undefined,
        () => Promise.reject(new Error("CANARY-private-transport")))).result },
    ];

    for (const { name, run } of cases) {
      const result = await run();
      expect(result.researchResponsePreflightDiagnostic, name).toBeNull();
      expect(JSON.stringify(result), name).not.toContain("CANARY");
      expect(result.databaseDisposed, name).toBe(true);
    }
  });

  it("does not retain a prior diagnostic across consecutive validation runs", async () => {
    const first = await syntheticRun();
    const second = await syntheticRun((payload) => { payload.choices[0]!.finish_reason = "length"; });

    expect(first.result.researchResponsePreflightDiagnostic).toMatchObject({
      annotations: { state: "compatible" }, candidateSchema: { outcome: "accepted" },
    });
    expect(second.result).toMatchObject({
      outcome: "incomplete", runState: "failed", researchResponsePreflightDiagnostic: null,
      researchCandidateDiagnostic: null, repairRequestCount: 0, databaseDisposed: true,
    });
    expectOneSyntheticRoundTrip(first.fetch, first.globalFetch);
    expectOneSyntheticRoundTrip(second.fetch, second.globalFetch);
  });
});
