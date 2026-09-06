// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fixtureResponse, LIVE_POLICY, runValidation } from "../../scripts/live-research/validation";
import { createGuardedTransport, verifyKeyPolicy } from "../../scripts/live-research/transport";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const key = "synthetic-live-validation-key";
const safeKeyData = { data: { limit: 1, limit_remaining: 1, limit_reset: null, usage: 0, is_management_key: false,
  is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";

describe("isolated live Research validation", () => {
  it("provides a default zero-network dry-run through Research and planning", async () => {
    const modulePath = "../../scripts/live-research/validation";
    const helper = import(/* @vite-ignore */ modulePath);
    await expect(helper.then((module) => module.runValidation())).resolves.toMatchObject({
      mode: "offline-dry-run", outcome: "passed", realRequestCount: 0,
      runState: "ready", quality: { passed: true },
      ownerWrongReadRejected: true, planningGenerated: true, databaseDisposed: true,
    });
  });

  it("executes exactly one key GET and one unchanged Research POST through actual adapter, audit and planning", async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      if (url === KEY_URL) { expect(init?.method).toBe("GET"); return Response.json(safeKeyData); }
      expect(url).toBe(RESEARCH_URL);
      const body = JSON.parse(init!.body as string);
      expect(body).toMatchObject({ model: "openai/gpt-5.6-sol", max_tokens: 12000, max_tool_calls: 2, stream: false,
        provider: { require_parameters: true, data_collection: "deny", zdr: true },
        response_format: { type: "json_schema", json_schema: { strict: true } },
        tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", mode: "fast", max_results: 5, max_uses: 2, max_total_results: 10, max_characters: 2000 } }],
      });
      expect(JSON.parse(body.messages[1].content)).toMatchObject({ role: "Data Product Manager", locale: "en-US" });
      return fixtureResponse();
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ mode: "live-one", outcome: "passed", realRequestCount: 2, researchRequestCount: 1,
      repairRequestCount: 0, auditCount: 1, actualModel: LIVE_POLICY.model, usage: { totalTokens: 9000, costMicros: 100000 },
      reservation: { status: "settled", maximumMicros: 1000000, settledMicros: 100000 }, secondResearchRejected: true,
      ownerWrongReadRejected: true, freshAccountActivated: true, planningGenerated: true, databaseDisposed: true });
  });

  it.each([
    { limit: null }, { limit: 2 }, { limit: 0 }, { limit: "1" }, { usage: 0.1 }, { limit_remaining: 0.9 },
    { limit_reset: "daily" }, { is_management_key: true }, { is_provisioning_key: true }, { byok_usage: 1 },
  ])("denies unsafe key limits before Research: %j", async (override) => {
    const fetch = vi.fn(async () => Response.json({ data: { ...safeKeyData.data, ...override } }));
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ mode: "live-one", outcome: "incomplete", reason: "key-policy-denied",
      researchRequestCount: 0, runState: null, databaseDisposed: true });
  });

  it("ignores key and transport without explicit execution", async () => {
    const fetch = vi.fn(async () => { throw new Error("CANARY-secret-exception"); });
    const result = await runValidation({ key: "CANARY-secret-key", fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: "offline-dry-run", outcome: "passed", realRequestCount: 0 });
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it.each([
    ["more than two searches", { server_tool_use: { web_search_requests: 3 } }],
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
    expect(result.usage).not.toBeNull();
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

  it("times out stalled key inspection and never releases a POST", async () => {
    vi.useFakeTimers();
    try {
      const transport = createGuardedTransport(key, async () => new Promise<Response>(() => undefined));
      const failure = expect(transport.inspectKey()).rejects.toThrow("key-check-failed");
      await vi.advanceTimersByTimeAsync(10000);
      await failure;
      expect(transport.counts()).toMatchObject({ getCount: 1, postCount: 0 });
      transport.clear();
    } finally { vi.useRealTimers(); }
  });

  it.each([
    ["default offline dry-run", [], ""],
    ["malformed stdin", ["--execute-one"], "CANARY bad-key"],
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
    expect(source).not.toMatch(/Set-Content|Out-File|SetEnvironmentVariable|\$env:.*KEY|Write-(?:Output|Host).*\$plain/u);
  });

  it.runIf(process.platform === "win32")("runs the default Windows PowerShell launcher without credentials", () => {
    const child = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/live-research/run.ps1"], { encoding: "utf8", timeout: 30000 });
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('"mode": "offline-dry-run"');
    expect(child.stdout).toContain('"realRequestCount": 0');
    expect(child.stdout).toContain('"databaseDisposed": true');
  }, 35000);
});
