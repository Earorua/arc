// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { verifyKeyPolicy } from "../../scripts/live-research/transport";
import { runAccountCheck } from "../../scripts/live-research/account-check";

const KEY_URL = "https://openrouter.ai/api/v1/key";
const CATALOG_URL = "https://openrouter.ai/api/v1/models/user";
const MODEL = "openai/gpt-5.6-sol";
const key = "synthetic-account-check-key";
const usedKey = { data: { limit: 5, limit_remaining: 4.75, usage: 0.25, byok_usage: 0,
  limit_reset: null, is_management_key: false, is_provisioning_key: false, expires_at: null } };
const catalog = { data: [{ id: MODEL }] };

function fixtureFetch(keyPayload: unknown = usedKey, catalogPayload: unknown = catalog) {
  return vi.fn<typeof globalThis.fetch>(async (url, init) => {
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer " + key);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect([KEY_URL, CATALOG_URL]).toContain(url);
    return Response.json(url === KEY_URL ? keyPayload : catalogPayload);
  });
}

function expectPrivate(result: unknown) {
  expect(JSON.stringify(result)).not.toMatch(/CANARY|synthetic-account-check-key|https:\/\//u);
}

describe("standalone read-only account diagnostics", () => {
  it("admits existing usage for only two exact GETs while the live key policy still rejects it", async () => {
    expect(() => verifyKeyPolicy(usedKey)).toThrow("key-policy-denied");
    const fetch = fixtureFetch();
    const result = await runAccountCheck({ key, fetch });
    expect(result).toMatchObject({ mode: "account-check-only", outcome: "completed", reason: null,
      requestedModel: MODEL, modelListed: true, realRequestCount: 2, keyRequestCount: 1, catalogRequestCount: 1,
      researchRequestCount: 0, repairRequestCount: 0, keyHttpStatus: 200, catalogHttpStatus: 200,
      keyObservation: { limitUsd: 5, remainingUsd: 4.75, usageUsd: 0.25, byokUsageUsd: 0 },
      keyDiagnostics: { phase: "complete", failure: null }, catalogDiagnostics: { phase: "complete", failure: null } });
    expect(Number.isFinite(Date.parse(result.timestamp))).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["mode", "outcome", "reason", "timestamp", "requestedModel", "modelListed",
      "realRequestCount", "keyRequestCount", "catalogRequestCount", "researchRequestCount", "repairRequestCount",
      "keyHttpStatus", "catalogHttpStatus", "keyObservation", "keyDiagnostics", "catalogDiagnostics"].sort());
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([KEY_URL, CATALOG_URL]);
    expectPrivate(result);
  });

  it.each([
    ["exact ID", [{ id: MODEL }], true], ["other ID", [{ id: "CANARY-other-model" }], false],
    ["prefix is not equality", [{ id: MODEL + ":CANARY" }], false], ["empty array", [], false],
    ["ignored metadata and response URLs", [{ id: MODEL, name: "CANARY", url: "https://canary.invalid" }], true],
  ] as const)("completes catalog observation for %s", async (_label, data, modelListed) => {
    const fetch = fixtureFetch({ data: { ...usedKey.data, label: "CANARY", hash: "CANARY", usage: 0, byok_usage: 1 } }, { data });
    const result = await runAccountCheck({ key, fetch });
    expect(result).toMatchObject({ outcome: "completed", modelListed, keyObservation: { usageUsd: 0, byokUsageUsd: 1 } });
    expect(fetch).toHaveBeenCalledTimes(2);
    expectPrivate(result);
  });

  it.each([
    ["null", null], ["missing", {}], ["null data", { data: null }], ["object data", { data: {} }],
    ["null entry", { data: [null] }], ["number entry", { data: [1] }], ["array entry", { data: [[]] }],
    ["missing ID", { data: [{}] }], ["numeric ID", { data: [{ id: 1 }] }], ["empty ID", { data: [{ id: "" }] }],
    ["blank ID", { data: [{ id: "   " }] }], ["long ID", { data: [{ id: "x".repeat(257) }] }],
    ["invalid entry after match", { data: [{ id: MODEL }, { name: "CANARY" }] }],
    ["over entry limit", { data: Array.from({ length: 10_001 }, () => ({ id: MODEL })) }],
    ["truncated total", { ...catalog, total_count: 2 }], ["bad total", { ...catalog, total_count: "1" }],
    ["noninteger total", { ...catalog, total_count: 1.5 }], ["negative total", { data: [], total_count: -1 }],
    ["over total limit", { ...catalog, total_count: 10_001 }], ["null links", { ...catalog, links: null }],
    ["array links", { ...catalog, links: [] }], ["next page", { ...catalog, links: { next: "https://canary.invalid" } }],
    ["false next", { ...catalog, links: { next: false } }],
  ])("rejects malformed or incomplete catalog: %s", async (_label, payload) => {
    const fetch = fixtureFetch(usedKey, payload);
    const result = await runAccountCheck({ key, fetch });
    expect(result).toMatchObject({ outcome: "incomplete", reason: "catalog-check-failed", modelListed: null,
      catalogDiagnostics: { failure: "invalid-response" }, realRequestCount: 2 });
    expectPrivate(result);
  });

  it("accepts entry and ID boundaries and explicit complete pagination metadata", async () => {
    const data = Array.from({ length: 10_000 }, (_, index) => ({ id: index === 9_999 ? MODEL : "x".repeat(256) }));
    const result = await runAccountCheck({ key, fetch: fixtureFetch(usedKey, { data, total_count: 10_000, links: { next: null } }) });
    expect(result).toMatchObject({ outcome: "completed", modelListed: true });
  });

  it.each([undefined, null, 42, "", "CANARY bad", "CANARY\n", "x".repeat(513), "CANARY-密钥"])("rejects invalid key before fetch: %j", async (input) => {
    const fetch = fixtureFetch();
    const result = await runAccountCheck({ key: input, fetch });
    expect(result).toMatchObject({ outcome: "incomplete", reason: "key-invalid", modelListed: null,
      keyObservation: { limitUsd: null, remainingUsd: null, usageUsd: null, byokUsageUsd: null }, realRequestCount: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expectPrivate(result);
  });

  it("requires injected fetch and never falls back to ambient network", async () => {
    const ambient = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("CANARY ambient fetch"));
    try {
      const result = await runAccountCheck({ key, fetch: undefined as unknown as typeof globalThis.fetch });
      expect(result).toMatchObject({ outcome: "incomplete", realRequestCount: 0 });
      expect(ambient).not.toHaveBeenCalled();
    } finally { ambient.mockRestore(); }
  });

  it.each([
    { limit: null }, { limit: 0 }, { limit: 5.000001 }, { limit_reset: "daily" }, { is_management_key: true },
    { is_management_key: undefined }, { is_provisioning_key: true }, { expires_at: "2000-01-01T00:00:00Z" },
    { expires_at: "CANARY-invalid" }, { expires_at: 123 }, { limit_remaining: 5.1 },
  ])("rejects key policy before catalog and preserves observed usage: %j", async (override) => {
    const fetch = fixtureFetch({ data: { ...usedKey.data, ...override, label: "CANARY" } });
    const result = await runAccountCheck({ key, fetch });
    expect(result).toMatchObject({ outcome: "incomplete", reason: "key-policy-denied", modelListed: null,
      keyObservation: { usageUsd: 0.25, byokUsageUsd: 0 }, keyDiagnostics: { phase: "policy", failure: "policy-denied" },
      catalogRequestCount: 0, catalogHttpStatus: null });
    expect(fetch).toHaveBeenCalledTimes(1);
    expectPrivate(result);
  });

  it.each(["limit", "limit_remaining", "usage", "byok_usage"] as const)("never converts missing, negative or malformed %s to zero", async (field) => {
    const observationField = { limit: "limitUsd", limit_remaining: "remainingUsd", usage: "usageUsd", byok_usage: "byokUsageUsd" }[field];
    for (const value of [undefined, null, -1, "0", false, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      const fetch = fixtureFetch({ data: { ...usedKey.data, [field]: value } });
      const result = await runAccountCheck({ key, fetch });
      expect(result).toMatchObject({ outcome: "incomplete", keyObservation: { [observationField]: null } });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    const nonfiniteJson = JSON.stringify(usedKey).replace('"' + field + '":' + usedKey.data[field], '"' + field + '":1e999');
    const result = await runAccountCheck({ key, fetch: async () => new Response(nonfiniteJson) });
    expect(result).toMatchObject({ outcome: "incomplete", keyObservation: { [observationField]: null } });
  });

  it.each([[null], [[]], [{}], [{ data: [] }], [{ data: "CANARY" }]])("rejects malformed key envelope: %j", async (payload) => {
    const fetch = fixtureFetch(payload);
    const result = await runAccountCheck({ key, fetch });
    expect(result).toMatchObject({ outcome: "incomplete", keyObservation: { limitUsd: null, remainingUsd: null, usageUsd: null, byokUsageUsd: null } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expectPrivate(result);
  });

  for (const endpoint of ["key", "catalog"] as const) {
    const limit = endpoint === "key" ? 32_768 : 8_388_608;
    const errorCases = (endpoint === "key" ? [{ label: "key data", data: catalog.data }]
      : [{ label: "empty catalog", data: [] }, { label: "Sol catalog", data: catalog.data }])
      .flatMap((variant) => [{ code: 403, message: "CANARY-private-error" }, "CANARY-error", {}, [], false, 0]
        .map((error) => ({ ...variant, error })));
    it.each(errorCases)(
      endpoint + " rejects valid $label accompanied by a non-null error: $error", async ({ data, error }) => {
        const fetch = fixtureFetch(endpoint === "key" ? { ...usedKey, error } : usedKey,
          endpoint === "catalog" ? { data, error } : { data });
        const result = await runAccountCheck({ key, fetch });
        expect(result).toMatchObject({ outcome: "incomplete", modelListed: null,
          reason: endpoint === "key" ? "key-check-failed" : "catalog-check-failed",
          keyHttpStatus: 200, catalogHttpStatus: endpoint === "key" ? null : 200,
          [endpoint + "Diagnostics"]: { phase: "body", failure: "invalid-response" },
          researchRequestCount: 0, repairRequestCount: 0 });
        if (endpoint === "key") expect(result.keyObservation).toEqual({
          limitUsd: null, remainingUsd: null, usageUsd: null, byokUsageUsd: null,
        });
        expect(fetch).toHaveBeenCalledTimes(endpoint === "key" ? 1 : 2);
        expectPrivate(result);
      });

    it.each([undefined, null])(endpoint + " accepts absent or null error with valid data: %j", async (error) => {
      const fetch = fixtureFetch(endpoint === "key" ? { ...usedKey, error } : usedKey,
        endpoint === "catalog" ? { ...catalog, error } : catalog);
      const result = await runAccountCheck({ key, fetch });
      expect(result).toMatchObject({ outcome: "completed", reason: null, modelListed: true,
        keyObservation: { limitUsd: 5, remainingUsd: 4.75, usageUsd: 0.25, byokUsageUsd: 0 } });
      expect(fetch).toHaveBeenCalledTimes(2);
      expectPrivate(result);
    });

    it(endpoint + " classifies a synchronous injected transport failure without disclosure", async () => {
      const fetch = vi.fn<typeof globalThis.fetch>((url) => {
        if (endpoint === "catalog" && url === KEY_URL) return Promise.resolve(Response.json(usedKey));
        throw new Error("CANARY-synchronous-network");
      });
      const result = await runAccountCheck({ key, fetch });
      expect(result).toMatchObject({ outcome: "incomplete", [endpoint + "Diagnostics"]: { phase: "request", failure: "network-error" } });
      expect(fetch).toHaveBeenCalledTimes(endpoint === "key" ? 1 : 2);
      expectPrivate(result);
    });

    it.each(["network", "http", "redirect", "redirected", "missing-body", "utf8", "json", "large-body", "large-header", "bad-header", "body-error"])(endpoint + " fails closed for %s without leaking response data", async (kind) => {
      const cancel = vi.fn();
      const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
        if (endpoint === "catalog" && url === KEY_URL) return Response.json(usedKey);
        if (kind === "network") throw new Error("CANARY-private-network");
        if (kind === "missing-body") return new Response(null);
        if (kind === "utf8") return new Response(new Uint8Array([0xc3, 0x28]));
        if (kind === "json") return new Response("CANARY-not-json");
        if (kind === "body-error") return new Response(new ReadableStream({ start(controller) { controller.error(new Error("CANARY-read")); } }));
        const body = new ReadableStream<Uint8Array>({ start(controller) {
          controller.enqueue(kind === "large-body" ? new Uint8Array(limit + 1) : new TextEncoder().encode("CANARY"));
        }, cancel });
        const response = new Response(body, { status: kind === "http" ? 403 : kind === "redirect" ? 302 : 200,
          headers: kind === "large-header" ? { "content-length": String(limit + 1) } : kind === "bad-header" ? { "content-length": "CANARY" } : {} });
        if (kind === "redirected") Object.defineProperty(response, "redirected", { value: true });
        return response;
      });
      const result = await runAccountCheck({ key, fetch });
      expect(result).toMatchObject({ outcome: "incomplete", modelListed: null,
        reason: endpoint === "key" ? "key-check-failed" : "catalog-check-failed",
        [endpoint + "Diagnostics"]: { failure: kind === "network" || kind === "body-error" ? "network-error" : kind === "http" ? "http-error" : "invalid-response" } });
      expect(fetch).toHaveBeenCalledTimes(endpoint === "key" ? 1 : 2);
      if (["http", "redirect", "redirected", "large-body", "large-header", "bad-header"].includes(kind)) expect(cancel).toHaveBeenCalledTimes(1);
      expectPrivate(result);
    });

    it.each(["request", "body", "never-body"] as const)(endpoint + " enforces one deadline across stalled %s and cancels late responses", async (phase) => {
      vi.useFakeTimers();
      try {
        const cancel = vi.fn();
        let signal: AbortSignal | null | undefined;
        let resolveLate: ((value: Response) => void) | undefined;
        const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
          if (endpoint === "catalog" && url === KEY_URL) return Response.json(usedKey);
          signal = init?.signal;
          if (phase === "request") return new Promise<Response>((resolve) => { resolveLate = resolve; });
          await new Promise((resolve) => setTimeout(resolve, 12_000));
          return new Response(new ReadableStream<Uint8Array>({ start(controller) {
            if (phase === "body") controller.enqueue(new TextEncoder().encode('{"CANARY":"unfinished'));
          }, cancel }));
        });
        const check = runAccountCheck({ key, fetch });
        await vi.advanceTimersByTimeAsync(30_000);
        const result = await check;
        expect(result).toMatchObject({ outcome: "incomplete", modelListed: null,
          [endpoint + "Diagnostics"]: { phase: phase === "request" ? "request" : "body", failure: phase === "request" ? "request-timeout" : "body-timeout", elapsedMs: 30_000 } });
        expect(signal?.aborted).toBe(true);
        const before = JSON.stringify(result);
        if (phase === "request") resolveLate!(new Response(new ReadableStream({ cancel })));
        await vi.advanceTimersByTimeAsync(1);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).toBe(before);
        expect(fetch).toHaveBeenCalledTimes(endpoint === "key" ? 1 : 2);
        expectPrivate(result);
      } finally { vi.useRealTimers(); }
    });
  }

  it("has no imports or implicit environment/network channels", () => {
    let source = "";
    try { source = readFileSync("scripts/live-research/account-check.ts", "utf8"); } catch { /* RED: capability absent */ }
    expect(source).toContain("runAccountCheck");
    expect(source).not.toMatch(/^\s*import\s|import\(|process\.|globalThis\.fetch\(|chat\/completions|\/credits/mu);
  });
});

const modeCombinations = [
  ["--execute-one", "--check-account-only"], ["--check-key-only", "--check-account-only"],
  ["--execute-one", "--check-key-only", "--check-account-only"], ["--check-account-only", "--check-account-only"],
  ["--execute-one", "--execute-one"], ["--check-key-only", "--check-key-only"],
];

describe("account diagnostic launchers", () => {
  it.each(modeCombinations)("rejects CLI conflicts before reading input: %j", (...args) => {
    const child = spawnSync(process.execPath, ["scripts/live-research/runner.mjs", ...args], { encoding: "utf8", input: "CANARY malformed", timeout: 30_000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toContain("mode-conflict");
    expect(child.stdout).not.toContain("Summary:");
    expect(child.stdout + child.stderr).not.toContain("CANARY");
  }, 35_000);

  it.each([["--check-account-only"], ["--check-account-only", "--unknown=CANARY"]])("rejects malformed stdin or unknown arguments: %j", (...args) => {
    const child = spawnSync(process.execPath, ["scripts/live-research/runner.mjs", ...args], { encoding: "utf8", input: "CANARY malformed", timeout: 30_000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stdout).not.toContain("Summary:");
    expect(child.stdout + child.stderr).not.toContain("CANARY");
  }, 35_000);

  it.each([true, false])("runs account-only child with injected fixtures and safe output (catalog valid: %s)", (valid) => {
    const script = "globalThis.fetch = async (url, init) => {" +
      "if (init.method !== 'GET' || init.redirect !== 'error' || init.body !== undefined) throw new Error('CANARY denied');" +
      "if (url === " + JSON.stringify(KEY_URL) + ") return Response.json(" + JSON.stringify(usedKey) + ");" +
      "if (url === " + JSON.stringify(CATALOG_URL) + ") return Response.json(" + JSON.stringify(valid ? { data: [{ id: "CANARY-other-model" }] } : { data: [{ name: "CANARY" }] }) + ");" +
      "throw new Error('CANARY forbidden destination');};" +
      "process.argv = ['node', 'runner', '--check-account-only']; await import('./scripts/live-research/runner.mjs');";
    const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8", input: key, timeout: 30_000 });
    try {
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(valid ? 0 : 1);
      expect(child.stdout).toContain('"mode": "account-check-only"');
      expect(child.stdout).toContain('"outcome": "' + (valid ? "completed" : "incomplete") + '"');
      expect(child.stdout).toContain('"modelListed": ' + (valid ? "false" : "null"));
      expect(child.stdout).toContain('"researchRequestCount": 0');
      expect(child.stdout).toContain("Summary:");
      expect(child.stdout + child.stderr).not.toMatch(/CANARY|synthetic-account-check-key/u);
    } finally {
      // Only the wx-created report named by this child is ours; preserve earlier evidence.
      const created = /^Summary: ([^\r\n]+)$/mu.exec(child.stdout)?.[1];
      if (created) {
        const outputPath = resolve(created);
        expect(dirname(outputPath)).toBe(resolve("outputs/live-research"));
        expect(basename(outputPath)).toMatch(/^summary-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/u);
        unlinkSync(outputPath);
      }
    }
  }, 35_000);

  it.runIf(process.platform === "win32").each([
    ["-ExecuteOne", "-CheckAccountOnly"], ["-CheckKeyOnly", "-CheckAccountOnly"], ["-ExecuteOne", "-CheckKeyOnly", "-CheckAccountOnly"],
  ])("rejects PowerShell conflicts before masked prompt: %j", (...args) => {
    const child = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/live-research/run.ps1", ...args], { encoding: "utf8", input: "CANARY malformed", timeout: 30_000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toContain("launcher-mode-conflict");
    expect(child.stdout).not.toMatch(/Paste dedicated|Summary:/u);
    expect(child.stdout + child.stderr).not.toContain("CANARY");
  }, 35_000);

  it("reuses masked stdin and removes inherited credential/injection environment variables", () => {
    const source = readFileSync("scripts/live-research/run.ps1", "utf8");
    expect(source).toContain("$CheckAccountOnly");
    expect(source).toContain("--check-account-only");
    expect(source).toContain("existing dedicated limited test key");
    expect(source).toContain("-AsSecureString");
    expect(source).toContain("StandardInput.Write");
    expect(source).toContain("ZeroFreeBSTR");
    expect(source).toContain("EnvironmentVariables.Remove('OPENROUTER_API_KEY')");
    expect(source).toContain("EnvironmentVariables.Remove('NODE_OPTIONS')");
    expect(source).toContain("WaitForExit(180000)");
  });
});
