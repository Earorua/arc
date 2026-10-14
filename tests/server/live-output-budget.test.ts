// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureResponse, LIVE_POLICY, runValidation, validationFingerprint } from "../../scripts/live-research/validation";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const key = "synthetic-output-budget-key";
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0,
  is_management_key: false, is_provisioning_key: false, byok_usage: 0, expires_at: null } };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("live Research output budget receipts", () => {
  it("projects the complete fixed output policy and deadlines after one substantive Research", async () => {
    expect(validResearchCandidate.skills.length).toBeGreaterThan(1);
    expect(validAnnotations.length).toBeGreaterThan(1);
    let researchBody: Record<string, unknown> | null = null;
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      expect(url).toBe(RESEARCH_URL);
      researchBody = JSON.parse(init!.body as string) as Record<string, unknown>;
      return fixtureResponse();
    });

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      mode: "live-one",
      outcome: "passed",
      researchPolicy: {
        profileId: "kimi-low-output32k-v3",
        reasoningEffort: "low",
        maxOutputTokens: 32_768,
        outputPolicyVersion: "kimi-complete-quality-v2",
        researchTimeoutMs: 1_200_000,
        activeTtlMs: 1_260_000,
        launcherTimeoutMs: 1_320_000,
      },
      realRequestCount: 2,
      researchRequestCount: 1,
      repairRequestCount: 0,
      runState: "ready",
      quality: { passed: true, issueCodes: [], issueCount: 0 },
      citationCount: validAnnotations.length,
      skillCount: validResearchCandidate.skills.length,
      auditCount: 1,
      usage: { promptTokens: 3_000, completionTokens: 6_000, totalTokens: 9_000,
        costMicros: 100_000, webSearchRequests: 2 },
      reservation: { status: "settled", maximumMicros: 5_000_000, settledMicros: 100_000 },
      ownerWrongReadRejected: true,
      secondResearchRejected: true,
      freshAccountActivated: true,
      planningGenerated: true,
      databaseDisposed: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expect(researchBody).toMatchObject({ model: "moonshotai/kimi-k3", max_tokens: 32_768,
      reasoning: { effort: "low" }, stream: false });
    const messages = researchBody!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]!.content).toContain("Apply kimi-complete-quality-v2.");
    expect(JSON.parse(messages[1]!.content)).toMatchObject({ role: "Data Product Manager", locale: "en-US" });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [KEY_URL, "GET"],
      [RESEARCH_URL, "POST"],
    ]);
  });

  it("fingerprints every output-policy and deadline field independently", () => {
    type FingerprintDescriptor = Readonly<{
      profileId: string;
      model: string;
      reasoningEffort: string;
      maxOutputTokens: number;
      outputPolicyVersion: string;
      researchTimeoutMs: number;
      activeTtlMs: number;
      launcherTimeoutMs: number;
    }>;
    const profile = Object.freeze({
      profileId: "trusted-profile",
      model: "trusted/model",
      reasoningEffort: "low",
      maxOutputTokens: 32_768,
      outputPolicyVersion: "trusted-output-v1",
      researchTimeoutMs: 1_200_000,
      activeTtlMs: 1_260_000,
      launcherTimeoutMs: 1_320_000,
    } satisfies FingerprintDescriptor);
    const baseline = validationFingerprint(profile);
    expect(baseline).toMatch(/^[a-f0-9]{64}$/u);
    for (const changed of [
      { maxOutputTokens: 32_767 },
      { outputPolicyVersion: "trusted-output-v2" },
      { researchTimeoutMs: 1_199_999 },
      { activeTtlMs: 1_259_999 },
      { launcherTimeoutMs: 1_319_999 },
    ] satisfies ReadonlyArray<Partial<FingerprintDescriptor>>) {
      expect(validationFingerprint(Object.freeze({ ...profile, ...changed }))).not.toBe(baseline);
    }
    expect(validationFingerprint(Object.freeze({ ...profile }))).toBe(baseline);
  });

  it("settles trusted usage for a length completion without parsing or accepting truncated content", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      expect(url).toBe(RESEARCH_URL);
      const payload = await fixtureResponse().json() as {
        choices: Array<{ finish_reason: string; message: { content: string } }>;
      };
      payload.choices[0]!.finish_reason = "length";
      payload.choices[0]!.message.content = payload.choices[0]!.message.content.slice(0, -1);
      return Response.json(payload);
    });

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      mode: "live-one", outcome: "incomplete", reason: "research-failed",
      runState: "failed", failureCategory: "invalid-result",
      actualModel: "moonshotai/kimi-k3",
      providerResultDiagnostic: { outcome: "rejected", reason: "finish-not-stop",
        finishReasonState: "recognized", finishReason: "length", usageIssueCodes: [] },
      researchCandidateDiagnostic: null,
      researchAttemptDiagnostic: { status: "failed", errorCode: "invalid-transport", charged: true },
      usage: { promptTokens: 3_000, completionTokens: 6_000, totalTokens: 9_000,
        costMicros: 100_000, webSearchRequests: 2 },
      reservation: { status: "settled", maximumMicros: 5_000_000, settledMicros: 100_000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0,
      databaseDisposed: true,
    });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
    ]);
  });

  it("keeps a 1200000 ms local deadline observable without the former 720000 ms saturation", async () => {
    vi.useFakeTimers();
    let reached!: () => void;
    const reachedPost = new Promise<void>((resolve) => { reached = resolve; });
    const observed: { signal?: AbortSignal } = {};
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      expect(url).toBe(RESEARCH_URL);
      observed.signal = init?.signal ?? undefined;
      reached();
      return new Promise<Response>((_resolve, reject) => {
        observed.signal!.addEventListener("abort", () => reject(new Error("synthetic-abort")), { once: true });
      });
    });

    const pending = runValidation({ executeOne: true, key, fetch });
    await reachedPost;
    expect(observed.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(LIVE_POLICY.timeoutMs);
    const result = await pending;

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed", failureCategory: "timeout",
      actualModel: null, usage: null,
      researchAttemptDiagnostic: { status: "failed", errorCode: "timeout", charged: "unknown" },
      researchTransportDiagnostic: { version: "transport-diagnostic-v3", phase: "fetch", reason: "deadline",
        receivedBytes: 0, bodyComplete: false, localCancellation: "deadline-abort",
        localCancellationElapsedMs: 1_200_000, headersElapsedMs: null, bodyEndElapsedMs: null, responseFormat: null,
        nativeErrorKind: null },
      reservation: { status: "conservative-hold", maximumMicros: 5_000_000, settledMicros: 0 },
      researchElapsedMs: 1_200_000,
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      freshAccountActivated: false, planningGenerated: false, databaseDisposed: true,
    });
    expect(result.researchElapsedMs).not.toBe(720_000);
    expect(result.researchStartedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
    expect(observed.signal?.aborted).toBe(true);
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
