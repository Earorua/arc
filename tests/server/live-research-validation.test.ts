// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureResponse, runValidation } from "../../scripts/live-research/validation";
import { createGuardedTransport, verifyKeyPolicy } from "../../scripts/live-research/transport";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { SqliteD1 } from "../helpers/sqlite-d1";
import { candidateWithMissingCitations, candidateWithMinuteMismatch } from "../fixtures/research/invalid-candidates";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const key = "synthetic-live-validation-key";
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, is_management_key: false,
  is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("isolated live Research validation", () => {
  it.each(["error", "manual"] as const)("permits one guarded POST with %s after the unchanged key check", async (redirect) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL ? Response.json(safeKeyData) : fixtureResponse());
    const transport = createGuardedTransport(key, fetch);
    const post = { method: "POST", redirect, headers: { Authorization: `Bearer ${key}` }, body: "{}" };
    await expect(transport.fetch(RESEARCH_URL, post)).rejects.toThrow("transport-denied");
    expect(fetch).not.toHaveBeenCalled();
    await transport.inspectKey();
    expect(fetch.mock.calls[0]).toEqual([KEY_URL, expect.objectContaining({ method: "GET", redirect: "error" })]);
    const firstPost = transport.fetch(RESEARCH_URL, post);
    await expect(transport.fetch(RESEARCH_URL, post)).rejects.toThrow("transport-denied");
    await expect(firstPost).resolves.toBeInstanceOf(Response);
    expect(fetch.mock.calls[1]).toEqual([RESEARCH_URL, post]);
    await expect(transport.fetch(RESEARCH_URL, post)).rejects.toThrow("transport-denied");
    await expect(transport.inspectKey()).rejects.toThrow("transport-denied");
    expect(transport.counts()).toMatchObject({ getCount: 1, postCount: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    transport.clear();
  });

  it("rejects missing/follow modes and manual GET without consuming request allowances", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL ? Response.json(safeKeyData) : fixtureResponse());
    const transport = createGuardedTransport(key, fetch);
    const headers = { Authorization: `Bearer ${key}` };
    for (const redirect of [undefined, "follow", "manual"] as const) {
      await expect(transport.fetch(KEY_URL, { method: "GET", headers, redirect })).rejects.toThrow("transport-denied");
    }
    expect(fetch).not.toHaveBeenCalled();
    await transport.inspectKey();
    for (const redirect of [undefined, "follow"] as const) {
      await expect(transport.fetch(RESEARCH_URL, { method: "POST", headers, body: "{}", redirect })).rejects.toThrow("transport-denied");
    }
    expect(transport.counts()).toMatchObject({ getCount: 1, postCount: 0 });
    await expect(transport.fetch(RESEARCH_URL, { method: "POST", headers, body: "{}", redirect: "manual" })).resolves.toBeInstanceOf(Response);
    expect(fetch).toHaveBeenCalledTimes(2);
    transport.clear();
  });

  it.each(["error", "manual"] as const)("keeps key-only mode closed to %s POST", async (redirect) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(safeKeyData));
    const transport = createGuardedTransport(key, fetch, { checkKeyOnly: true });
    await transport.inspectKey();
    await expect(transport.fetch(RESEARCH_URL, { method: "POST", redirect,
      headers: { Authorization: `Bearer ${key}` }, body: "{}" })).rejects.toThrow("transport-denied");
    expect(transport.counts()).toMatchObject({ getCount: 1, postCount: 0 });
    expect(fetch).toHaveBeenCalledOnce();
    transport.clear();
  });

  it.each(["error", "manual"] as const)("rejects a returned redirect with %s without reading or following it", async (redirect) => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
    const read = vi.spyOn(body, "getReader");
    const response = new Response(body, { status: 302, headers: { Location: "https://other.invalid" } });
    const headersGet = vi.spyOn(response.headers, "get");
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL ? Response.json(safeKeyData) : response);
    const transport = createGuardedTransport(key, fetch);
    await transport.inspectKey();
    await expect(transport.fetch(RESEARCH_URL, { method: "POST", redirect,
      headers: { Authorization: `Bearer ${key}` }, body: "{}" })).rejects.toThrow("transport-denied");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    expect(headersGet).not.toHaveBeenCalled();
    transport.clear();
  });

  it("rejects an already redirected manual POST response without inspecting Location", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
    const read = vi.spyOn(body, "getReader");
    const response = new Response(body, { status: 200 });
    Object.defineProperty(response, "redirected", { value: true });
    const headersGet = vi.spyOn(response.headers, "get");
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL ? Response.json(safeKeyData) : response);
    const transport = createGuardedTransport(key, fetch);
    await transport.inspectKey();
    await expect(transport.fetch(RESEARCH_URL, { method: "POST", redirect: "manual",
      headers: { Authorization: `Bearer ${key}` }, body: "{}" })).rejects.toThrow("transport-denied");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
    expect(headersGet).not.toHaveBeenCalled();
    transport.clear();
  });

  it("provides a default zero-network dry-run through Research and planning", async () => {
    const modulePath = "../../scripts/live-research/validation";
    const helper = import(/* @vite-ignore */ modulePath);
    await expect(helper.then((module) => module.runValidation())).resolves.toMatchObject({
      mode: "offline-dry-run", outcome: "passed", realRequestCount: 0,
      requestedModel: "moonshotai/kimi-k3", actualModel: "moonshotai/kimi-k3",
      runState: "ready", quality: { passed: true },
      ownerWrongReadRejected: true, planningGenerated: true, databaseDisposed: true,
    });
  });

  it.each([
    [1_400_000, 1_320_000],
    [-1, 0],
    [Number.NaN, null],
  ] as const)("bounds the monotonic Research elapsed measurement %s to %s", async (elapsed, expected) => {
    let call = 0;
    vi.stubGlobal("performance", { now: () => call++ === 0 ? 100 : 100 + elapsed });
    const result = await runValidation();
    expect(result).toMatchObject({ outcome: "passed", realRequestCount: 0, researchElapsedMs: expected });
  });

  it("checks only the key with one GET and no Research, accounting or planning operations", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(safeKeyData));
    const provider = vi.spyOn(OpenRouterResearchProvider.prototype, "research");
    const database = vi.spyOn(SqliteD1.prototype, "prepare");
    try {
      const result = await runValidation({ checkKeyOnly: true, key, fetch });
      expect(result).toMatchObject({ mode: "key-check-only", outcome: "passed", realRequestCount: 1,
        keyHttpStatus: 200, researchHttpStatus: null, researchRequestCount: 0, repairRequestCount: 0,
        runId: null, runState: null, auditCount: 0, usage: null, reservation: null,
        planningGenerated: false, freshAccountActivated: false, databaseDisposed: true,
        keyDiagnostics: { phase: "complete", failure: null } });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]![0]).toBe(KEY_URL);
      expect(provider).not.toHaveBeenCalled();
      expect(database).not.toHaveBeenCalled();
    } finally { provider.mockRestore(); database.mockRestore(); }
  });

  it("denies Research in a key-only transport even after the key passes", async () => {
    const fetch = vi.fn(async () => Response.json(safeKeyData));
    const transport = createGuardedTransport(key, fetch, { checkKeyOnly: true });
    await transport.inspectKey();
    await expect(transport.fetch(RESEARCH_URL, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${key}` }, body: "{}" }))
      .rejects.toThrow("transport-denied");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(transport.counts()).toMatchObject({ getCount: 1, postCount: 0 });
    transport.clear();
  });

  it.each([
    ["network-error", "request", null], ["http-error", "response", 401],
    ["invalid-response", "body", 200], ["policy-denied", "policy", 200],
  ] as const)("reports only safe key diagnostic fields for %s", async (failure, phase, keyHttpStatus) => {
    const fetch = vi.fn(async () => {
      if (failure === "network-error") throw new Error("CANARY-private-network-error");
      if (failure === "http-error") return new Response("CANARY-private-http-body", { status: 401 });
      if (failure === "invalid-response") return new Response("CANARY-private-invalid-json");
      return Response.json({ data: { ...safeKeyData.data, limit: null, label: "CANARY-private-label" } });
    });
    const result = await runValidation({ checkKeyOnly: true, key, fetch });
    expect(result).toMatchObject({ mode: "key-check-only", outcome: "incomplete", keyHttpStatus,
      realRequestCount: 1, researchRequestCount: 0, runState: null, auditCount: 0, reservation: null,
      keyDiagnostics: { phase, failure } });
    expect(result.keyDiagnostics!.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.keyDiagnostics!.elapsedMs).toBeLessThanOrEqual(30000);
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("executes exactly one key GET and one full Kimi Research POST through actual adapter, audit and planning", async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe(url === KEY_URL ? "error" : "manual");
      if (url === KEY_URL) { expect(init?.method).toBe("GET"); return Response.json(safeKeyData); }
      expect(url).toBe(RESEARCH_URL);
      const body = JSON.parse(init!.body as string);
      expect(body).toMatchObject({ model: "moonshotai/kimi-k3", max_tokens: 32_768, max_tool_calls: 10, stream: false,
        provider: { require_parameters: true, data_collection: "deny", zdr: true },
        response_format: { type: "json_schema", json_schema: { strict: true } },
        tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", mode: "fast", max_results: 5, max_uses: 10, max_total_results: 50, max_characters: 2000 } }],
      });
      expect(JSON.parse(body.messages[1].content)).toMatchObject({ role: "Data Product Manager", locale: "en-US" });
      return fixtureResponse();
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ mode: "live-one", outcome: "passed", realRequestCount: 2, researchRequestCount: 1,
      requestedModel: "moonshotai/kimi-k3", actualModel: "moonshotai/kimi-k3", runState: "ready", quality: { passed: true, issueCodes: [] },
      repairRequestCount: 0, auditCount: 1, usage: { totalTokens: 9000, costMicros: 100000 },
      reservation: { status: "settled", maximumMicros: 5000000, settledMicros: 100000 }, secondResearchRejected: true,
      ownerWrongReadRejected: true, freshAccountActivated: true, planningGenerated: true, databaseDisposed: true });
    expect(result.planningUnitCount).toBeGreaterThan(0);
  });

  it("waits past the old adapter and lease limits for one complete fixed-profile Research", async () => {
    vi.useFakeTimers();
    let reached!: () => void;
    const reachedPost = new Promise<void>((resolve) => { reached = resolve; });
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      expect(url).toBe(RESEARCH_URL);
      reached();
      return new Promise<Response>((resolve) => setTimeout(() => resolve(fixtureResponse()), 330_000));
    });

    let settled = false;
    const pending = runValidation({ executeOne: true, key, fetch }).finally(() => { settled = true; });
    await reachedPost;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(150_000);
    const result = await pending;

    expect(result).toMatchObject({ mode: "live-one", outcome: "passed", reason: null,
      requestedModel: "moonshotai/kimi-k3", actualModel: "moonshotai/kimi-k3", runState: "ready",
      quality: { passed: true }, citationCount: validAnnotations.length, skillCount: validResearchCandidate.skills.length,
      usage: { costMicros: 100_000, webSearchRequests: 2 }, reservation: { status: "settled", settledMicros: 100_000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true, freshAccountActivated: true, planningGenerated: true,
      databaseDisposed: true,
      researchPolicy: { profileId: "kimi-low-output32k-v3", reasoningEffort: "low", maxOutputTokens: 32_768,
        outputPolicyVersion: "kimi-complete-quality-v2", researchTimeoutMs: 1_200_000,
        activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000 },
      researchElapsedMs: 330_000,
    });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([[KEY_URL, "GET"], [RESEARCH_URL, "POST"]]);
    const body = JSON.parse(fetch.mock.calls[1]![1]!.body as string);
    expect(body).toMatchObject({ model: "moonshotai/kimi-k3", reasoning: { effort: "low" }, max_tokens: 32_768, stream: false,
      max_tool_calls: 10, tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", mode: "fast",
        max_results: 5, max_uses: 10, max_total_results: 50, max_characters: 2000 } }],
      provider: { require_parameters: true, data_collection: "deny", zdr: true },
      response_format: { type: "json_schema", json_schema: { strict: true } },
    });
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("rejects bare OK as full Research and retains its receipt without planning or Repair", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      const payload = await fixtureResponse().json() as { choices: { message: { content: string } }[] };
      payload.choices[0]!.message.content = "OK";
      return Response.json(payload);
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(result).toMatchObject({ mode: "live-one", outcome: "incomplete", reason: "research-failed",
      requestedModel: "moonshotai/kimi-k3", actualModel: "moonshotai/kimi-k3", runState: "failed",
      quality: { passed: false },
      usage: { promptTokens: 3000, completionTokens: 6000, totalTokens: 9000, costMicros: 100000, webSearchRequests: 2 },
      reservation: { status: "settled", maximumMicros: 5000000, settledMicros: 100000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      secondResearchRejected: true, ownerWrongReadRejected: true,
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0, databaseDisposed: true });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([[KEY_URL, "GET"], [RESEARCH_URL, "POST"]]);
  });

  it.each([
    ["missing citations", () => JSON.stringify(candidateWithMissingCitations()), "missing-skill-source"],
    ["minute mismatch", () => JSON.stringify(candidateWithMinuteMismatch()), "minute-mismatch"],
  ] as const)("keeps full Research in needs-review for %s with its receipt and no planning or Repair", async (_label, content, issueCode) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      const payload = await fixtureResponse().json() as {
        choices: { message: { content: string } }[];
        usage: { server_tool_use?: { web_search_requests: number }; server_tool_use_details?: { web_search_requests: number } };
      };
      const legacy = payload.usage.server_tool_use;
      payload.usage.server_tool_use_details = legacy;
      delete payload.usage.server_tool_use;
      payload.usage.server_tool_use_details = { web_search_requests: 4 };
      payload.choices[0]!.message.content = content();
      return Response.json(payload);
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(result).toMatchObject({ mode: "live-one", outcome: "incomplete", reason: "quality-needs-review",
      requestedModel: "moonshotai/kimi-k3", actualModel: "moonshotai/kimi-k3", runState: "needs-review",
      quality: { passed: false, issueCodes: expect.arrayContaining([issueCode]) },
      usage: { promptTokens: 3000, completionTokens: 6000, totalTokens: 9000, costMicros: 100000, webSearchRequests: 4 },
      reservation: { status: "settled", maximumMicros: 5000000, settledMicros: 100000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      secondResearchRejected: true, ownerWrongReadRejected: true,
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0, databaseDisposed: true });
    expect(result.quality.issueCount).toBeGreaterThan(0);
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([[KEY_URL, "GET"], [RESEARCH_URL, "POST"]]);
  });

  it("rejects a prior Astra model receipt as successful full Kimi acceptance", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      const payload = await fixtureResponse().json() as { model: string };
      payload.model = "openai/gpt-6-astra";
      return Response.json(payload);
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(result).toMatchObject({ mode: "live-one", outcome: "incomplete", reason: "validation-incomplete",
      requestedModel: "moonshotai/kimi-k3", actualModel: null, runState: "ready", quality: { passed: true },
      usage: { totalTokens: 9000, costMicros: 100000, webSearchRequests: 2 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1, databaseDisposed: true });
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([[KEY_URL, "GET"], [RESEARCH_URL, "POST"]]);
  });

  it.each([
    { limit: null }, { limit: 5.000001, limit_remaining: 5.000001 }, { limit: 0 }, { limit: "5" }, { usage: 0.1 }, { limit_remaining: 0.9 },
    { limit_reset: "daily" }, { is_management_key: true }, { is_provisioning_key: true }, { byok_usage: 1 },
  ])("denies unsafe key limits before Research: %j", async (override) => {
    const fetch = vi.fn(async () => Response.json({ data: { ...safeKeyData.data, ...override } }));
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ mode: "live-one", outcome: "incomplete", reason: "key-policy-denied",
      researchRequestCount: 0, runState: null, databaseDisposed: true });
  });

  it.each([[5, "passed"], [5.000001, "incomplete"]] as const)("applies the USD 5 receipt ceiling to cost %s without another request", async (cost, outcome) => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      // A smaller still-unused cap isolates the accounting predicate from the key-policy boundary.
      if (url === KEY_URL) return Response.json({ data: { ...safeKeyData.data, limit: 1, limit_remaining: 1 } });
      const payload = await fixtureResponse().json() as { usage: Record<string, unknown> };
      payload.usage.cost = cost;
      return Response.json(payload);
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(result).toMatchObject({ outcome, runState: "ready", quality: { passed: true }, planningGenerated: true,
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, databaseDisposed: true,
      reservation: { status: "settled", maximumMicros: 5000000, settledMicros: cost === 5 ? 5000000 : 5000001 },
    });
    expect(result.reason).toBe(outcome === "passed" ? null : "validation-incomplete");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("ignores key and transport without explicit execution", async () => {
    const fetch = vi.fn(async () => { throw new Error("CANARY-secret-exception"); });
    const result = await runValidation({ key: "CANARY-secret-key", fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: "offline-dry-run", outcome: "passed", realRequestCount: 0 });
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it.each([
    ["more than ten searches", { server_tool_use: { web_search_requests: 11 } }],
    ["all zero tokens", { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }],
    ["zero prompt tokens", { prompt_tokens: 0, total_tokens: 6000 }],
    ["zero completion tokens", { completion_tokens: 0, total_tokens: 3000 }],
  ])("keeps Ready validation incomplete for noncredible usage: %s", async (_label, usage) => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      const payload = await fixtureResponse().json() as { usage: Record<string, unknown> };
      payload.usage = { ...payload.usage, ...usage };
      return Response.json(payload);
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(result).toMatchObject({ runState: "ready", quality: { passed: true }, planningGenerated: true,
      outcome: "incomplete", reason: "validation-incomplete", repairRequestCount: 0, databaseDisposed: true });
    if (_label === "more than ten searches") {
      expect(result).toMatchObject({ usage: null, reservation: { status: "conservative-hold", settledMicros: 0 } });
    } else {
      expect(result.usage).not.toBeNull();
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["missing-usage", "no-search", "wrong-model", "malformed", "exception", "needs-review"])("stops without repair or retry on %s, with no canary disclosure", async (kind) => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      if (kind === "exception") throw new Error("CANARY-secret-exception");
      if (kind === "malformed") return new Response("CANARY-secret-body");
      const payload = await fixtureResponse().json() as {
        model: string; choices: { message: { content: string } }[];
        usage?: { server_tool_use: { web_search_requests: number } };
      };
      if (kind === "missing-usage") delete payload.usage;
      if (kind === "no-search") payload.usage!.server_tool_use.web_search_requests = 0;
      if (kind === "wrong-model") payload.model = "canary/secret-model";
      if (kind === "needs-review") payload.choices[0].message.content = '{"CANARY":"secret-content",}';
      return Response.json(payload);
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(result.outcome).toBe("incomplete");
    expect(result.repairRequestCount).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result).toLowerCase()).not.toContain("canary");
    expect(result.databaseDisposed).toBe(true);
  });

  it("denies other URLs, methods, redirects, early or repeated POST and repeated key GET", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => url === KEY_URL ? Response.json(safeKeyData) : fixtureResponse());
    const transport = createGuardedTransport(key, fetch);
    const request = { method: "POST", redirect: "error" as const, headers: { Authorization: `Bearer ${key}` }, body: "{}" };
    for (const [url, init] of [
      ["https://canary.invalid/secret", request], [RESEARCH_URL, request],
      [KEY_URL, { ...request, method: "DELETE" }], [KEY_URL, { ...request, method: "GET", redirect: "follow" }],
    ] as const) await expect(transport.fetch(url, init)).rejects.toThrow("transport-denied");
    expect(fetch).not.toHaveBeenCalled();
    await transport.inspectKey();
    await transport.fetch(RESEARCH_URL, request);
    await expect(transport.fetch(RESEARCH_URL, request)).rejects.toThrow("transport-denied");
    await expect(transport.inspectKey()).rejects.toThrow("transport-denied");
    expect(fetch).toHaveBeenCalledTimes(2);
    transport.clear();
    await expect(transport.fetch(RESEARCH_URL, request)).rejects.toThrow("transport-denied");
  });

  it.each(["redirect", "redirected", "large-body", "large-header", "invalid-json"])("fails key preflight closed for %s", async (kind) => {
    const fetch = vi.fn(async () => {
      if (kind === "redirect") return new Response("CANARY", { status: 302, headers: { Location: "https://canary.invalid" } });
      if (kind === "redirected") { const response = Response.json(safeKeyData); Object.defineProperty(response, "redirected", { value: true }); return response; }
      if (kind === "large-body") return new Response("CANARY".repeat(6000));
      if (kind === "large-header") return new Response("CANARY", { headers: { "content-length": "32769" } });
      return new Response("CANARY-invalid-json");
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(result.outcome).toBe("incomplete");
    expect(result.researchRequestCount).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it("accepts safe documented key fields without expiry or opaque label inspection", () => {
    const payload = structuredClone(safeKeyData) as { data: Record<string, unknown> };
    delete payload.data.expires_at;
    delete payload.data.is_provisioning_key;
    payload.data.label = "CANARY-opaque-not-a-name";
    expect(() => verifyKeyPolicy(payload)).not.toThrow();
  });

  it("allows a key response after twelve seconds within the read-only deadline", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn(async () => new Promise<Response>((resolve) => setTimeout(() => resolve(Response.json(safeKeyData)), 12000)));
      const transport = createGuardedTransport(key, fetch, { checkKeyOnly: true });
      const check = transport.inspectKey().then(() => true, () => false);
      await vi.advanceTimersByTimeAsync(12000);
      expect(await check).toBe(true);
      expect(transport.diagnostics()).toEqual({ phase: "complete", failure: null, elapsedMs: 12000 });
      expect(transport.counts()).toMatchObject({ getCount: 1, postCount: 0, keyHttpStatus: 200 });
      expect(fetch).toHaveBeenCalledTimes(1);
      transport.clear();
    } finally { vi.useRealTimers(); }
  });

  it.each(["request", "body"] as const)("distinguishes a stalled key %s timeout without releasing a POST", async (phase) => {
    vi.useFakeTimers();
    try {
      const transport = createGuardedTransport(key, async () => phase === "request" ? new Promise<Response>(() => undefined)
        : new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"CANARY":"partial-body"')); } })));
      const failure = expect(transport.inspectKey()).rejects.toThrow("key-check-failed");
      await vi.advanceTimersByTimeAsync(30000);
      await failure;
      expect(transport.counts()).toMatchObject({ getCount: 1, postCount: 0 });
      expect(transport.diagnostics()).toEqual({ phase, failure: `${phase}-timeout`, elapsedMs: 30000 });
      await expect(transport.fetch(RESEARCH_URL, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${key}` }, body: "{}" }))
        .rejects.toThrow("transport-denied");
      expect(JSON.stringify(transport.diagnostics())).not.toContain("CANARY");
      transport.clear();
    } finally { vi.useRealTimers(); }
  });

  it.each([
    ["default offline dry-run", [], ""],
    ["malformed stdin", ["--execute-one"], "CANARY bad-key"],
    ["malformed key-only stdin", ["--check-key-only"], "CANARY bad-key"],
    ["unexpected CLI argument", ["--key=CANARY-secret"], ""],
  ] as const)("runs one bounded child for %s without echoing input", (_label, args, input) => {
    const child = spawnSync(process.execPath, ["scripts/live-research/runner.mjs", ...args], { encoding: "utf8", input, timeout: 30000 });
    expect(child.error).toBeUndefined();
    if (!args.length) {
      expect(child.status).toBe(0);
      expect(child.stdout).toContain('"mode": "offline-dry-run"');
      expect(child.stdout).toContain('"realRequestCount": 0');
    } else expect(child.status).toBe(1);
    expect(child.stdout + child.stderr).not.toContain("CANARY");
  }, 35000);

  it("ships a masked PowerShell launcher with no key argument, environment or file channel", () => {
    let source = "";
    try { source = readFileSync("scripts/live-research/run.ps1", "utf8"); } catch { /* RED: absent launcher */ }
    expect(source).toContain("Read-Host");
    expect(source).toContain("-AsSecureString");
    expect(source).toContain("RedirectStandardInput = $true");
    expect(source).toContain("StandardInput.Write");
    expect(source).toContain("StandardInput.Close");
    expect(source).toContain("ZeroFreeBSTR");
    expect(source).toContain("USD 5 key");
    expect(source).toContain("One live Research request: moonshotai/kimi-k3; reasoning low; 32768 output tokens; Provider deadline 20 minutes; launcher total deadline 22 minutes; dedicated unused USD 5 key; no repair or retry.");
    expect(source).toContain("$CheckKeyOnly");
    expect(source).not.toMatch(/Set-Content|Out-File|SetEnvironmentVariable|\$env:.*KEY|Write-(?:Output|Host).*\$plain/u);
  });

  it.runIf(process.platform === "win32")("runs the default Windows PowerShell launcher without credentials", () => {
    const child = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/live-research/run.ps1"], { encoding: "utf8", timeout: 30000 });
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('"mode": "offline-dry-run"');
    expect(child.stdout).toContain('"realRequestCount": 0');
    expect(child.stdout).toContain('"databaseDisposed": true');
  }, 35000);

  it("rejects conflicting CLI modes before reading a key", () => {
    const child = spawnSync(process.execPath, ["scripts/live-research/runner.mjs", "--execute-one", "--check-key-only"], { encoding: "utf8", input: "", timeout: 30000 });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain("mode-conflict");
    expect(child.stdout).not.toContain("Summary:");
  }, 35000);

  it.runIf(process.platform === "win32")("rejects conflicting PowerShell modes before any masked prompt", () => {
    const child = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/live-research/run.ps1", "-ExecuteOne", "-CheckKeyOnly"], { encoding: "utf8", input: "", timeout: 30000 });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain("launcher-mode-conflict");
    expect(child.stdout).not.toContain("Paste dedicated");
    expect(child.stdout).not.toContain("Summary:");
  }, 35000);
});
