// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runMinimalProbe } from "../../scripts/live-research/minimal-probe";

const key = "synthetic-minimal-key";
const keyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, byok_usage: 0, is_management_key: false } };
const success = () => ({ model: "moonshotai/kimi-k3", choices: [{ finish_reason: "stop", message: { content: "OK" } }],
  usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12, cost: 0.001 } });
function live(response: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async (url, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${key}`);
    expect(init?.redirect).toBe("error");
    if (url === "https://openrouter.ai/api/v1/key") return Response.json(keyData);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toEqual({ model: "moonshotai/kimi-k3", messages: [{ role: "user", content: "Reply exactly OK." }],
      max_tokens: 512, stream: false, provider: { require_parameters: true, data_collection: "deny", zdr: true } });
    return response();
  });
}
describe("minimal probe transport", () => {
  it("defaults to an offline fixture and never uses even an injected external fetch", async () => {
    const external = vi.fn<typeof fetch>();
    const result = await runMinimalProbe({ fetch: external });
    expect(result).toMatchObject({ mode: "offline-minimal-probe", outcome: "passed", requestedModel: "moonshotai/kimi-k3",
      realRequestCount: 0, output: "expected-ok" });
    expect(external).not.toHaveBeenCalled();
  });
  it("sends exactly one bounded minimal POST after key inspection", async () => {
    const external = live(() => Response.json(success()));
    const result = await runMinimalProbe({ executeOne: true, key, fetch: external });
    expect(external).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ mode: "minimal-probe-one", outcome: "passed", keyHttpStatus: 200, inferenceHttpStatus: 200,
      keyRequestCount: 1, inferenceRequestCount: 1, realRequestCount: 2, researchRequestCount: 0, repairRequestCount: 0,
      requestedModel: "moonshotai/kimi-k3", actualModel: "moonshotai/kimi-k3", output: "expected-ok",
      usage: { costMicros: 1000, totalTokens: 12 } });
  });
  it("denies missing transport and used keys before any POST", async () => {
    expect(await runMinimalProbe({ executeOne: true, key })).toMatchObject({ outcome: "incomplete", realRequestCount: 0 });
    const external = vi.fn<typeof fetch>(async () => Response.json({ data: { ...keyData.data, usage: 0.1 } }));
    expect(await runMinimalProbe({ executeOne: true, key, fetch: external })).toMatchObject({ reason: "key-policy-denied", inferenceRequestCount: 0 });
    expect(external).toHaveBeenCalledTimes(1);
  });
  it.each([200, 403])("reports JSON errors at HTTP %s without echoing arbitrary provider text", async (status) => {
    const external = live(() => Response.json({ error: { code: 403, message: `Permission denied: ${key} CANARY@example.com`,
      metadata: { error_type: "permission_denied", raw: "CANARY-RAW" } } }, { status }));
    const result = await runMinimalProbe({ executeOne: true, key, fetch: external });
    expect(result).toMatchObject({ outcome: "incomplete", inferenceHttpStatus: status, inferenceRequestCount: 1,
      inferenceDiagnostics: { errorCode: 403, errorType: "permission_denied" }, messageExplanation: { state: "recognized" } });
    expect(JSON.stringify(result)).not.toMatch(/CANARY|synthetic-minimal-key|Permission denied:/u);
    expect(external).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["empty output", { ...success(), choices: [{ finish_reason: "length", message: { content: "" } }] }, "no-visible-output"],
    ["malformed choices", { ...success(), choices: [] }, "invalid-response"],
    ["over-budget receipt", { ...success(), usage: { cost: 5.000001 } }, "cost-over-limit"],
    ["choice error", { ...success(), choices: [{ error: { code: 403, message: "Forbidden" }, message: { content: "OK" } }] }, "provider-error"],
  ])("records %s without retry", async (_label, body, reason) => {
    const external = live(() => Response.json(body));
    expect(await runMinimalProbe({ executeOne: true, key, fetch: external })).toMatchObject({ outcome: "incomplete", reason });
    expect(external).toHaveBeenCalledTimes(2);
  });
  it("keeps missing cost unknown and suppresses generated text and unknown model IDs", async () => {
    const external = live(() => Response.json({ model: "CANARY-model", choices: [{ message: { content: "CANARY-private-response" } }] }));
    const result = await runMinimalProbe({ executeOne: true, key, fetch: external });
    expect(result).toMatchObject({ outcome: "passed", output: "other-text", actualModel: null, usage: { costMicros: null } });
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });
  it.each([
    [[], 0.1],
    [[{}], 0.1],
    [[{ message: { content: { private: "CANARY" } } }], 0.1],
    [[], 5.000001],
  ])("preserves a valid usage receipt when completion structure is malformed (%j)", async (choices, cost) => {
    const external = live(() => Response.json({ ...success(), choices, usage: { ...success().usage, cost } }));
    const result = await runMinimalProbe({ executeOne: true, key, fetch: external });
    expect(result).toMatchObject({ outcome: "incomplete", reason: "invalid-response",
      usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12, costMicros: Math.ceil((cost as number) * 1_000_000) } });
    expect(external).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });
  it.each([
    () => new Response("CANARY-invalid-json", { status: 403 }),
    () => new Response(new Uint8Array([0xff])),
    () => new Response(" ".repeat(65537)),
    () => new Response("{}", { headers: { "content-length": "65537" } }),
    () => new Response("CANARY", { status: 302 }),
  ])("rejects unsafe response boundaries", async (response) => {
    const result = await runMinimalProbe({ executeOne: true, key, fetch: live(response) });
    expect(result.outcome).toBe("incomplete");
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });
  it("cancels a hanging body at the total deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    try {
      const result = runMinimalProbe({ executeOne: true, key, fetch: live(() => new Response(new ReadableStream({ cancel }))) });
      await vi.advanceTimersByTimeAsync(120000);
      expect(await result).toMatchObject({ outcome: "incomplete", reason: "timeout", inferenceRequestCount: 1 });
      expect(cancel).toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("cancels a response arriving after the deadline and never retries", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let resolve!: (response: Response) => void;
    const external = live(() => new Promise<Response>((done) => { resolve = done; }));
    try {
      const pending = runMinimalProbe({ executeOne: true, key, fetch: external });
      await vi.advanceTimersByTimeAsync(120000);
      expect(await pending).toMatchObject({ reason: "timeout", inferenceRequestCount: 1 });
      resolve(new Response(new ReadableStream({ cancel })));
      await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalled();
      expect(external).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it.each(["--execute-one", "--check-key-only", "--check-account-only"])("rejects minimal CLI mode combined with %s before stdin", (flag) => {
    const child = spawnSync(process.execPath, ["scripts/live-research/runner.mjs", "--probe-minimal", flag], { input: "CANARY bad-key", encoding: "utf8", timeout: 30000 });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain("mode-conflict");
    expect(child.stdout + child.stderr).not.toContain("CANARY");
  });
  it("rejects malformed stdin in the new mode before creating a network transport", () => {
    const child = spawnSync(process.execPath, ["scripts/live-research/runner.mjs", "--probe-minimal"], { input: "CANARY invalid-key", encoding: "utf8", timeout: 30000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toContain("validation-incomplete");
    expect(child.stdout + child.stderr).not.toMatch(/CANARY|Summary:/u);
  });
  it.runIf(process.platform === "win32").each(["-ExecuteOne", "-CheckKeyOnly", "-CheckAccountOnly"])("rejects masked launcher mode conflicts with %s", (flag) => {
    const child = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/live-research/run.ps1", "-ProbeMinimal", flag], { input: "CANARY", encoding: "utf8", timeout: 30000 });
    expect(child.status).toBe(1);
    expect(child.stderr).toContain("launcher-mode-conflict");
    expect(child.stdout + child.stderr).not.toMatch(/Paste dedicated|CANARY/u);
  });
  it("routes the new masked mode before full Research validation without database imports", () => {
    expect(readFileSync("scripts/live-research/run.ps1", "utf8")).toContain("--probe-minimal");
    const runner = readFileSync("scripts/live-research/runner.mjs", "utf8");
    expect(runner).toContain('/scripts/live-research/minimal-probe.ts');
    expect(runner.indexOf('/scripts/live-research/minimal-probe.ts')).toBeLessThan(runner.indexOf('/scripts/live-research/validation.ts'));
    expect(readFileSync("scripts/live-research/minimal-probe.ts", "utf8")).not.toMatch(/sqlite|createResearchD1|orchestrator|process\.env|console\./u);
  });
});
