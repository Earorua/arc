// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { researchCandidateSchema } from "../../app/contracts/research";
import { createKimiLocalValidationProvider, OpenRouterResearchProvider, OPENROUTER_LIMITS } from "../../app/server/research/openrouter-provider";
import { RESEARCH_PROVIDER_VERSIONS, ResearchProviderError, type ResearchProvider } from "../../app/server/research/provider";
import type { ProviderResultDiagnostic } from "../../app/server/research/result-diagnostic";
import { fixtureResponse, runValidation } from "../../scripts/live-research/validation";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const REQUEST = { role: "Data Product Manager", locale: "en-US" } as const;
const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const KEY_FIXTURE = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0,
  is_management_key: false, is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const USAGE = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.1,
  server_tool_use_details: { web_search_requests: 2 } };
const SAFE_USAGE = { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros: 100_000, webSearchRequests: 2 };

type NestedAnnotation = {
  type: string;
  url?: unknown;
  title?: unknown;
  url_citation?: { url?: unknown; title?: unknown; content?: unknown };
};
type FixturePayload = {
  model: string;
  choices: Array<{ finish_reason: string; message: { content: string; annotations: NestedAnnotation[] } }>;
  usage: Record<string, unknown>;
};

function providerResponse(annotations: NestedAnnotation[], changes: Record<string, unknown> = {}): Response {
  return Response.json({
    model: "moonshotai/kimi-k3",
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(validResearchCandidate), annotations } }],
    usage: USAGE,
    ...changes,
  });
}

const entrypoints = [
  {
    name: "standard",
    model: "test/research-fixed",
    maxOutputTokens: 12_000,
    timeoutMs: 20_000,
    reasoning: undefined,
    create(fetch: typeof globalThis.fetch): ResearchProvider {
      return new OpenRouterResearchProvider({ OPENROUTER_API_KEY: "synthetic-fixture-key",
        ARC_AI_MODEL_RESEARCH: "test/research-fixed", ARC_AI_MODEL_ECONOMY: "test/economy-fixed", researchTimeoutMs: 20_000 }, { fetch });
    },
  },
  {
    name: "Kimi local",
    model: "moonshotai/kimi-k3",
    maxOutputTokens: 32_768,
    timeoutMs: 1_200_000,
    reasoning: { effort: "low" },
    create(fetch: typeof globalThis.fetch): ResearchProvider {
      return createKimiLocalValidationProvider({ key: "synthetic-fixture-key", fetch });
    },
  },
] as const;

function nested(url: unknown, title?: unknown): NestedAnnotation {
  const urlCitation: NonNullable<NestedAnnotation["url_citation"]> = { url };
  if (arguments.length > 1) urlCitation.title = title;
  return { type: "url_citation", url_citation: urlCitation };
}

function fetchReturning(response: Response) {
  return vi.fn<typeof globalThis.fetch>(async () => response);
}

async function providerFailure(provider: ResearchProvider, code = "invalid-transport") {
  const error: unknown = await provider.research(REQUEST).catch((value: unknown) => value);
  expect(error).toBeInstanceOf(ResearchProviderError);
  expect(error).toMatchObject({ code });
  return error as ResearchProviderError;
}

async function compatibleFixturePayload(): Promise<FixturePayload> {
  const payload = await fixtureResponse().json() as FixturePayload;
  for (const annotation of payload.choices[0]!.message.annotations) delete annotation.url_citation?.title;
  const legacy = payload.usage.server_tool_use;
  payload.usage.server_tool_use_details = legacy;
  delete payload.usage.server_tool_use;
  return payload;
}

async function validationRun(change?: (payload: FixturePayload) => void) {
  const payload = await compatibleFixturePayload();
  change?.(payload);
  const applicationFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("global application fetch must stay blocked"); });
  vi.stubGlobal("fetch", applicationFetch);
  const injectedFetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    if (url === KEY_URL) {
      expect(init).toMatchObject({ method: "GET", redirect: "error" });
      return Response.json(KEY_FIXTURE);
    }
    expect(url).toBe(RESEARCH_URL);
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    return Response.json(payload);
  });
  const result = await runValidation({ executeOne: true, key: "synthetic-fixture-key", fetch: injectedFetch });
  return { applicationFetch, injectedFetch, payload, result };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenRouter nested citation response compatibility", () => {
  it.each(entrypoints)("keeps the exact $name request policy while sharing response parsing", async (entrypoint) => {
    const fetch = fetchReturning(providerResponse([nested("https://example.com/guide", "Supplied title")]));
    const result = await entrypoint.create(fetch).research(REQUEST);
    expect(result.annotations).toEqual([{ type: "url_citation", url: "https://example.com/guide", title: "Supplied title" }]);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(RESEARCH_URL);
    expect(init).toMatchObject({ method: "POST", redirect: "manual", headers: {
      Authorization: "Bearer synthetic-fixture-key", "Content-Type": "application/json",
    }, signal: expect.any(AbortSignal) });
    const body = JSON.parse(init!.body as string);
    expect(Object.keys(body).sort()).toEqual((entrypoint.reasoning
      ? ["max_tokens", "max_tool_calls", "messages", "model", "provider", "reasoning", "response_format", "stream", "tools"]
      : ["max_tokens", "max_tool_calls", "messages", "model", "provider", "response_format", "stream", "tools"]).sort());
    expect(body).toMatchObject({ model: entrypoint.model, stream: false, max_tokens: entrypoint.maxOutputTokens, max_tool_calls: 10,
      provider: { require_parameters: true, data_collection: "deny", zdr: true },
      response_format: { type: "json_schema", json_schema: { name: "arc_research_candidate", strict: true,
        schema: z.toJSONSchema(researchCandidateSchema, { target: "draft-7" }) } },
      tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", mode: "fast", max_results: 5,
        max_uses: 10, max_total_results: 50, max_characters: 2000 } }],
    });
    expect(body.reasoning).toEqual(entrypoint.reasoning);
    expect(JSON.parse(body.messages[1].content)).toEqual({ ...REQUEST, versions: RESEARCH_PROVIDER_VERSIONS });
  });

  it.each(entrypoints)("uses the unchanged $name response deadline", async (entrypoint) => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Promise<Response>(() => undefined));
    const pending = providerFailure(entrypoint.create(fetch), "timeout");
    await vi.advanceTimersByTimeAsync(entrypoint.timeoutMs - 1);
    expect(fetch.mock.calls[0]![1]!.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(fetch.mock.calls[0]![1]!.signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(entrypoints.flatMap((entrypoint) => [
    { entrypoint, url: "https://DOCS.GetDbt.COM:443/guide?utm_source=demo#part", title: "docs.getdbt.com" },
    { entrypoint, url: "https://docs.getdbt.com./guide", title: "docs.getdbt.com" },
    { entrypoint, url: "https://例子.测试/guide", title: "xn--fsqu00a.xn--0zwm56d" },
  ]))("derives $title under existing URL policy through $entrypoint.name and retains $url", async ({ entrypoint, url, title }) => {
    const fetch = fetchReturning(providerResponse([nested(url)]));
    const result = await entrypoint.create(fetch).research(REQUEST);
    expect(result.annotations).toEqual([{ type: "url_citation", url, title }]);
    expect(result.usage).toEqual(SAFE_USAGE);
    expect(result.actualModel).toBe("moonshotai/kimi-k3");
  });

  it.each(entrypoints.flatMap((entrypoint) => [
    [entrypoint, "missing", undefined],
    [entrypoint, "overlong", `https://example.com/${"x".repeat(2_049)}`],
    [entrypoint, "HTTP", "http://example.com/guide"],
    [entrypoint, "private", "https://127.0.0.1/guide"],
    [entrypoint, "local", "https://service.local/guide"],
    [entrypoint, "credentialed", "https://user:password@example.com/guide"],
    [entrypoint, "secret parameter", "https://example.com/guide?api_key=secret-value"],
    [entrypoint, "bad encoded", "https://example.com/%00secret"],
  ] as const))("rejects a missing-title $1 URL through $0.name", async (entrypoint, _label, url) => {
    const fetch = fetchReturning(providerResponse([nested(url)]));
    const error = await providerFailure(entrypoint.create(fetch));
    expect(error).toMatchObject({ charged: true, actualModel: "moonshotai/kimi-k3", usage: SAFE_USAGE });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(entrypoints.flatMap((entrypoint) => [
    [entrypoint, "null", null], [entrypoint, "number", 42],
    [entrypoint, "overlong", "x".repeat(501)],
  ] as const))("does not replace a $1 supplied title through $0.name", async (entrypoint, _label, title) => {
    const fetch = fetchReturning(providerResponse([nested("https://example.com/guide", title)]));
    const error = await providerFailure(entrypoint.create(fetch));
    expect(error).toMatchObject({ charged: true, actualModel: "moonshotai/kimi-k3", usage: SAFE_USAGE });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(entrypoints)("does not add flat citation support through $name", async (entrypoint) => {
    const flat = { type: "url_citation", url: "https://example.com/guide", title: "Flat title" };
    const fetch = fetchReturning(providerResponse([flat]));
    const error = await providerFailure(entrypoint.create(fetch));
    expect(error).toMatchObject({ charged: true, actualModel: "moonshotai/kimi-k3", usage: SAFE_USAGE });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(entrypoints.flatMap((entrypoint) => ["", " \t\r\n", "\u2003"].map((title) => ({ entrypoint, title }))))(
    "retains all 50 citations when title 28 is blank through $entrypoint.name", async ({ entrypoint, title }) => {
      const citations = Array.from({ length: 50 }, (_, index) => nested(
        `https://ocw.mit.edu/courses/fixture-${index}/`, index === 27 ? title : `Course ${index}`,
      ));
      const fetch = fetchReturning(providerResponse(citations));
      const result = await entrypoint.create(fetch).research(REQUEST);
      expect(result.annotations).toHaveLength(50);
      expect(result.annotations[27]).toEqual({ type: "url_citation", title: "ocw.mit.edu",
        url: "https://ocw.mit.edu/courses/fixture-27/" });
      expect(result.annotations[26]?.title).toBe("Course 26");
      expect(result.content).toBe(JSON.stringify(validResearchCandidate));
      expect(result.usage).toEqual(SAFE_USAGE);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it.each(["https://127.0.0.1/private", "https://service.local/path", "http://example.com/path",
    "https://user:password@example.com/path", "https://example.com/path?api_key=secret-value"])(
    "rejects a blank title when the fallback URL is unsafe: %s", async (url) => {
      const fetch = fetchReturning(providerResponse([nested(url, " ")]));
      const error = await providerFailure(entrypoints[1].create(fetch));
      expect(error).toMatchObject({ charged: true, usage: SAFE_USAGE });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("preserves annotation diagnostics and audited charges on an invalid fallback URL", async () => {
    const diagnostics: ProviderResultDiagnostic[] = [];
    const fetch = fetchReturning(providerResponse([nested("https://127.0.0.1/private")]));
    const provider = createKimiLocalValidationProvider({ key: "synthetic-fixture-key", fetch,
      onResultDiagnostic: (diagnostic) => { diagnostics.push(diagnostic); } });
    const error = await providerFailure(provider);
    expect(error).toMatchObject({ charged: true, actualModel: "moonshotai/kimi-k3", usage: SAFE_USAGE });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ outcome: "rejected", reason: "annotations-invalid" });
  });

  it("keeps the 256 annotation boundary and rejects 257 without losing audited billing", async () => {
    const accepted = [nested("https://example.com/guide"), ...Array.from({ length: 255 }, () => ({ type: "other" }))];
    const acceptedFetch = fetchReturning(providerResponse(accepted));
    expect((await entrypoints[0].create(acceptedFetch).research(REQUEST)).annotations).toEqual([
      { type: "url_citation", url: "https://example.com/guide", title: "example.com" },
    ]);

    const rejectedFetch = fetchReturning(providerResponse([...accepted, { type: "other" }]));
    const error = await providerFailure(entrypoints[0].create(rejectedFetch));
    expect(error).toMatchObject({ charged: true, actualModel: "moonshotai/kimi-k3", usage: SAFE_USAGE });
  });

  it("retains audited billing for oversized content and rejects an oversized outer response before parsing", async () => {
    const content = "界".repeat(Math.floor(OPENROUTER_LIMITS.contentBytes / 3) + 1);
    const contentFetch = fetchReturning(providerResponse([nested("https://example.com/guide")], {
      choices: [{ finish_reason: "stop", message: { content, annotations: [nested("https://example.com/guide")] } }],
    }));
    const contentError = await providerFailure(entrypoints[0].create(contentFetch));
    expect(contentError).toMatchObject({ charged: true, actualModel: "moonshotai/kimi-k3", usage: SAFE_USAGE });

    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const outerFetch = fetchReturning(new Response(stream, { headers: { "Content-Length": String(OPENROUTER_LIMITS.responseBytes + 1) } }));
    const outerError = await providerFailure(entrypoints[0].create(outerFetch));
    expect(outerError).toMatchObject({ charged: "unknown", actualModel: null, usage: null });
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe("synthetic local response compatibility validation", () => {
  it("imports a complete fenced candidate with blank citation titles without another model call", async () => {
    const { applicationFetch, injectedFetch, result } = await validationRun((payload) => {
      const message = payload.choices[0]!.message;
      message.content = `\`\`\`json\n${message.content}\n\`\`\``;
      for (const annotation of message.annotations) if (annotation.url_citation) annotation.url_citation.title = " ";
    });
    expect(result).toMatchObject({ outcome: "passed", runState: "ready", planningGenerated: true,
      quality: { passed: true, issueCodes: [] }, repairRequestCount: 0, researchRequestCount: 1,
      reservation: { status: "settled", settledMicros: 100_000 },
      researchResponsePreflightDiagnostic: { version: "response-preflight-v2", candidateSchema: { outcome: "accepted" } },
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expect(injectedFetch).toHaveBeenCalledTimes(2);
    expect(applicationFetch).not.toHaveBeenCalled();
  });
  it("accepts missing titles and server_tool_use_details through the actual adapter, SQLite, audit and planning path", async () => {
    const { applicationFetch, injectedFetch, result } = await validationRun();
    expect(injectedFetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
    ]);
    expect(applicationFetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      mode: "live-one", outcome: "passed", reason: null, runState: "ready",
      quality: { passed: true, issueCodes: [], issueCount: 0 },
      researchCandidateDiagnostic: { outcome: "accepted", reason: null, issues: [], truncated: false },
      usage: { promptTokens: 3000, completionTokens: 6000, totalTokens: 9000, costMicros: 100_000, webSearchRequests: 2 },
      reservation: { status: "settled", maximumMicros: 5_000_000, settledMicros: 100_000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true, freshAccountActivated: true,
      planningGenerated: true, databaseDisposed: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
  });

  it("accepts four-search usage under the new policy while preserving settled cost", async () => {
    const { applicationFetch, injectedFetch, result } = await validationRun((payload) => {
      payload.usage.server_tool_use_details = { web_search_requests: 4 };
    });
    expect(result).toMatchObject({
      mode: "live-one", outcome: "passed", reason: null, runState: "ready",
      quality: { passed: true, issueCodes: [], issueCount: 0 },
      researchCandidateDiagnostic: { outcome: "accepted", reason: null, issues: [], truncated: false },
      usage: { promptTokens: 3000, completionTokens: 6000, totalTokens: 9000, costMicros: 100_000, webSearchRequests: 4 },
      reservation: { status: "settled", maximumMicros: 5_000_000, settledMicros: 100_000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true, freshAccountActivated: true,
      planningGenerated: true, databaseDisposed: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expect(injectedFetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
    ]);
    expect(applicationFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["missing role", (candidate: Record<string, unknown>) => { delete candidate.role; }, { path: "role", code: "invalid-type" }],
    ["scalar role", (candidate: Record<string, unknown>) => { candidate.role = "Data Product Manager"; }, { path: "role", code: "invalid-type" }],
    ["unknown root key", (candidate: Record<string, unknown>) => { candidate.privateBody = "synthetic-source-sentinel"; }, { path: "$", code: "unrecognized-keys" }],
    ["bad skill category", (candidate: Record<string, unknown>) => {
      ((candidate.skills as Array<Record<string, unknown>>)[0]!).category = "marketing";
    }, { path: "skills[].category", code: "invalid-value" }],
    ["bad skill importance", (candidate: Record<string, unknown>) => {
      ((candidate.skills as Array<Record<string, unknown>>)[0]!).importance = "critical";
    }, { path: "skills[].importance", code: "invalid-value" }],
    ["missing unit definitions", (candidate: Record<string, unknown>) => { delete candidate.unitTemplates; }, { path: "unitTemplates", code: "invalid-type" }],
    ["missing source data", (candidate: Record<string, unknown>) => { delete candidate.resources; }, { path: "resources", code: "invalid-type" }],
  ] as const)("rejects strict candidate shape: %s", async (_name, mutate, issue) => {
    const { applicationFetch, injectedFetch, result } = await validationRun((payload) => {
      payload.usage.server_tool_use_details = { web_search_requests: 4 };
      const candidate = structuredClone(validResearchCandidate) as unknown as Record<string, unknown>;
      mutate(candidate);
      payload.choices[0]!.message.content = JSON.stringify(candidate);
    });
    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed",
      researchCandidateDiagnostic: { outcome: "rejected", reason: "schema-rejected", issues: [issue], truncated: false },
      researchRunDiagnostic: { errorCode: "invalid-result" },
      repairRequestCount: 0, auditCount: 1, realRequestCount: 2, researchRequestCount: 1, databaseDisposed: true,
    });
    expect(injectedFetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
    ]);
    expect(applicationFetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "unreferenced candidate URL", expectedState: "needs-review", expectedReason: "quality-needs-review",
      expectedDiagnostic: { quality: { passed: false, issueCodes: ["unreferenced-url"] } },
      change(payload: FixturePayload) {
        const candidate = structuredClone(validResearchCandidate) as unknown as { resources: Array<{ url: string }> };
        candidate.resources[0]!.url = "https://example.com/unreferenced";
        payload.choices[0]!.message.content = JSON.stringify(candidate);
      },
    },
    {
      name: "unsafe supplied title", expectedState: "failed", expectedReason: "research-failed",
      expectedDiagnostic: { errorCode: "invalid-transport", quality: null },
      change(payload: FixturePayload) { payload.choices[0]!.message.annotations[0]!.url_citation!.title = "<script>unsafe</script>"; },
    },
    {
      name: "encoded markup in a removable tracking parameter", expectedState: "failed", expectedReason: "research-failed",
      expectedDiagnostic: { errorCode: "invalid-transport", quality: null },
      change(payload: FixturePayload) { payload.choices[0]!.message.annotations[0]!.url_citation!.url =
        `${validAnnotations[0]!.url}?utm_source=%3Cscript%3Eunsafe%3C%2Fscript%3E`; },
    },
    {
      name: "encoded secret text in a removable fragment", expectedState: "failed", expectedReason: "research-failed",
      expectedDiagnostic: { errorCode: "invalid-transport", quality: null },
      change(payload: FixturePayload) { payload.choices[0]!.message.annotations[0]!.url_citation!.url =
        `${validAnnotations[0]!.url}#api_key%3Dsk-or-v1-abcdefghijklmnop`; },
    },
    {
      name: "malformed candidate", expectedState: "failed", expectedReason: "research-failed",
      expectedDiagnostic: { errorCode: "invalid-result", quality: { passed: false, issueCodes: ["invalid-schema"] } },
      change(payload: FixturePayload) {
        const candidate = structuredClone(validResearchCandidate) as unknown as { evidence?: unknown };
        delete candidate.evidence;
        payload.choices[0]!.message.content = JSON.stringify(candidate);
      },
    },
  ])("keeps $name on its existing quality path without repair or retry", async ({ change, expectedDiagnostic, expectedReason, expectedState }) => {
    const { applicationFetch, injectedFetch, result } = await validationRun(change);
    expect(result).toMatchObject({ outcome: "incomplete", reason: expectedReason, runState: expectedState,
      repairRequestCount: 0, auditCount: 1, realRequestCount: 2, researchRequestCount: 1, databaseDisposed: true,
      researchRunDiagnostic: expectedDiagnostic,
    });
    expect(injectedFetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
    ]);
    expect(applicationFetch).not.toHaveBeenCalled();
  });

  it("keeps a usage-container conflict Ready with a conservative hold and an incomplete summary", async () => {
    const { applicationFetch, injectedFetch, result } = await validationRun((payload) => {
      payload.usage.server_tool_use = { web_search_requests: 1 };
    });
    expect(result).toMatchObject({
      outcome: "incomplete", reason: "validation-incomplete", runState: "ready",
      quality: { passed: true, issueCodes: [] },
      researchCandidateDiagnostic: { outcome: "accepted", reason: null },
      usage: null, reservation: { status: "conservative-hold", maximumMicros: 5_000_000, settledMicros: 0 },
      repairRequestCount: 0, auditCount: 1, realRequestCount: 2, researchRequestCount: 1,
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true,
    });
    expect(injectedFetch).toHaveBeenCalledTimes(2);
    expect(applicationFetch).not.toHaveBeenCalled();
  });
});
