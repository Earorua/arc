// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_POLICY, runValidation } from "../../scripts/live-research/validation";

const key = "synthetic-live-validation-key";
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, is_management_key: false,
  is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";

afterEach(() => { vi.useRealTimers(); });

describe("live Research failure summary", () => {
  it("defaults the safe failure category for offline and key-only validation", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(safeKeyData));

    const [offline, keyOnly] = await Promise.all([
      runValidation(),
      runValidation({ checkKeyOnly: true, key, fetch }),
    ]);

    expect(offline).toHaveProperty("failureCategory", null);
    expect(keyOnly).toHaveProperty("failureCategory", null);
    expect(offline).toMatchObject({ realRequestCount: 0,
      researchPolicy: { profileId: "kimi-low-output32k-v3", reasoningEffort: "low", maxOutputTokens: 32_768,
        outputPolicyVersion: "kimi-complete-quality-v2", researchTimeoutMs: 1_200_000,
        activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000 },
    });
    expect(offline.researchElapsedMs).toBeTypeOf("number");
    expect(keyOnly).toMatchObject({ researchPolicy: null, researchElapsedMs: null });
  });

  it("reports timeout after HTTP 200 when the Research body stalls", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"model":"moonshotai/kimi-k3",')); },
      cancel,
    });
    let researchStarted!: () => void;
    const reachedResearch = new Promise<void>((resolve) => { researchStarted = resolve; });
    const observed: { signal?: AbortSignal } = {};
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      expect(url).toBe(RESEARCH_URL);
      observed.signal = init?.signal ?? undefined;
      researchStarted();
      return new Response(stream, { status: 200 });
    });

    const pending = runValidation({ executeOne: true, key, fetch });
    await reachedResearch;
    expect(observed.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(LIVE_POLICY.timeoutMs);
    const result = await pending;

    expect(result).toMatchObject({
      mode: "live-one", outcome: "incomplete", reason: "research-failed",
      runState: "failed", failureCategory: "timeout", researchHttpStatus: 200,
      actualModel: null, usage: null,
      reservation: { status: "conservative-hold", maximumMicros: LIVE_POLICY.maximumMicros, settledMicros: 0 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0,
      researchFailureDiagnostic: null, databaseDisposed: true,
      researchPolicy: { profileId: "kimi-low-output32k-v3", reasoningEffort: "low", maxOutputTokens: 32_768,
        outputPolicyVersion: "kimi-complete-quality-v2", researchTimeoutMs: 1_200_000,
        activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000 },
      researchElapsedMs: 1_200_000,
    });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([[KEY_URL, "GET"], [RESEARCH_URL, "POST"]]);
    expect(observed.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports timeout with no HTTP status when the Research request stalls before headers", async () => {
    vi.useFakeTimers();
    let researchStarted!: () => void;
    const reachedResearch = new Promise<void>((resolve) => { researchStarted = resolve; });
    const observed: { signal?: AbortSignal } = {};
    const aborted = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      expect(url).toBe(RESEARCH_URL);
      observed.signal = init?.signal ?? undefined;
      researchStarted();
      return new Promise<Response>((_resolve, reject) => {
        observed.signal!.addEventListener("abort", () => { aborted(); reject(new Error("CANARY-private-abort")); }, { once: true });
      });
    });

    const pending = runValidation({ executeOne: true, key, fetch });
    await reachedResearch;
    expect(observed.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(LIVE_POLICY.timeoutMs);
    const result = await pending;

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed", failureCategory: "timeout",
      researchHttpStatus: null, usage: null,
      reservation: { status: "conservative-hold", settledMicros: 0 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0,
      freshAccountActivated: false, planningGenerated: false, databaseDisposed: true,
      researchPolicy: { profileId: "kimi-low-output32k-v3", maxOutputTokens: 32_768,
        outputPolicyVersion: "kimi-complete-quality-v2" }, researchElapsedMs: 1_200_000,
    });
    expect(observed.signal?.aborted).toBe(true);
    expect(aborted).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("classifies malformed HTTP 200 JSON as invalid-result without retry or disclosure", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL
      ? Response.json(safeKeyData)
      : new Response("{\"CANARY-private-body\":", { status: 200 }));

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed", failureCategory: "invalid-result",
      researchHttpStatus: 200, actualModel: null, usage: null,
      reservation: { status: "conservative-hold", settledMicros: 0 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      freshAccountActivated: false, planningGenerated: false, databaseDisposed: true,
    });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([[KEY_URL, "GET"], [RESEARCH_URL, "POST"]]);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });
});
