// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKimiLocalValidationProvider, OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { RESEARCH_PROVIDER_VERSIONS, RESEARCH_SEARCH_POLICY, type ResearchProvider } from "../../app/server/research/provider";
import { fixtureResponse, runValidation } from "../../scripts/live-research/validation";

const REQUEST = { role: "Data Product Manager", locale: "en-US" } as const;
const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const KEY_FIXTURE = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0,
  is_management_key: false, is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const EXPECTED_SEARCH = Object.freeze({
  policyId: "openrouter-web-search-exa-fast-v2",
  engine: "exa",
  mode: "fast",
  maxUses: 10,
  maxResults: 5,
  maxTotalResults: 50,
  maxCharacters: 2000,
});

function provider(kind: "standard" | "kimi", fetch: typeof globalThis.fetch): ResearchProvider {
  return kind === "standard"
    ? new OpenRouterResearchProvider({
      OPENROUTER_API_KEY: "synthetic-fixture-key",
      ARC_AI_MODEL_RESEARCH: "test/research-fixed",
      ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
    }, { fetch })
    : createKimiLocalValidationProvider({ key: "synthetic-fixture-key", fetch });
}

async function responseWithSearchCount(count: unknown): Promise<Response> {
  const payload = await fixtureResponse().json() as {
    usage: Record<string, unknown> & { server_tool_use?: unknown; server_tool_use_details?: unknown };
  };
  const legacy = payload.usage.server_tool_use;
  payload.usage.server_tool_use_details = legacy;
  delete payload.usage.server_tool_use;
  payload.usage.server_tool_use_details = typeof count === "number" ? { web_search_requests: count } : count;
  return Response.json(payload);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Research search policy", () => {
  it("exposes one frozen literal policy for request, identity and validation consumers", () => {
    expect(Object.isFrozen(RESEARCH_SEARCH_POLICY)).toBe(true);
    expect(RESEARCH_SEARCH_POLICY).toEqual(EXPECTED_SEARCH);
  });

  it.each(["standard", "kimi"] as const)("sends the shared bounded search configuration through %s", async (kind) => {
    const applicationFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("global fetch denied"); });
    const injectedFetch = vi.fn<typeof globalThis.fetch>(async () => fixtureResponse());
    vi.stubGlobal("fetch", applicationFetch);

    await provider(kind, injectedFetch).research(REQUEST);

    const body = JSON.parse(injectedFetch.mock.calls[0]![1]!.body as string) as {
      max_tool_calls: number;
      messages: Array<{ role: string; content: string }>;
      tools: Array<{ type: string; parameters: Record<string, unknown> }>;
    };
    expect(body.max_tool_calls).toBe(EXPECTED_SEARCH.maxUses);
    expect(body.tools).toEqual([{ type: "openrouter:web_search", parameters: {
      engine: EXPECTED_SEARCH.engine,
      mode: EXPECTED_SEARCH.mode,
      max_uses: EXPECTED_SEARCH.maxUses,
      max_results: EXPECTED_SEARCH.maxResults,
      max_total_results: EXPECTED_SEARCH.maxTotalResults,
      max_characters: EXPECTED_SEARCH.maxCharacters,
    } }]);
    expect(body.messages[0]!.content).toContain("Make at most 10 search queries in total; use fewer when sufficient. Once that limit is reached, do not perform further searches.");
    expect(JSON.parse(body.messages[1]!.content).versions).toMatchObject({
      promptVersion: "research-prompt-v6",
      modelConfigVersion: "research-model-config-v2",
    });
    expect(RESEARCH_PROVIDER_VERSIONS.modelConfigVersion).toBe("research-model-config-v2");
    expect(injectedFetch).toHaveBeenCalledOnce();
    expect(applicationFetch).not.toHaveBeenCalled();
  });

  it("accepts a valid four-search result through the actual adapter, SQLite and planning gate", async () => {
    const applicationFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("global fetch denied"); });
    const injectedFetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === KEY_URL) return Response.json(KEY_FIXTURE);
      expect(url).toBe(RESEARCH_URL);
      return responseWithSearchCount(4);
    });
    vi.stubGlobal("fetch", applicationFetch);

    const result = await runValidation({ executeOne: true, key: "synthetic-fixture-key", fetch: injectedFetch });

    expect(result).toMatchObject({
      outcome: "passed", reason: null, runState: "ready",
      usage: { webSearchRequests: 4, costMicros: 100_000 },
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

  it.each([2, 4, 10])("accepts a valid candidate with %i actual searches without changing accounting", async (count) => {
    const applicationFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("global fetch denied"); });
    const injectedFetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL
      ? Response.json(KEY_FIXTURE)
      : responseWithSearchCount(count));
    vi.stubGlobal("fetch", applicationFetch);

    const result = await runValidation({ executeOne: true, key: "synthetic-fixture-key", fetch: injectedFetch });

    expect(result).toMatchObject({
      outcome: "passed", reason: null, runState: "ready",
      usage: { webSearchRequests: count, costMicros: 100_000 },
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
    ["zero", 0, { usage: { webSearchRequests: 0 }, reservation: { status: "settled", settledMicros: 100_000 } }],
    ["eleven", 11, { usage: null, reservation: { status: "conservative-hold", settledMicros: 0 } }],
    ["malformed", { web_search_requests: "4" }, { usage: null, reservation: { status: "conservative-hold", settledMicros: 0 } }],
  ] as const)("keeps %s search usage from passing without fabricating billing", async (_label, count, expected) => {
    const applicationFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("global fetch denied"); });
    const injectedFetch = vi.fn<typeof globalThis.fetch>(async (url) => url === KEY_URL
      ? Response.json(KEY_FIXTURE)
      : responseWithSearchCount(count));
    vi.stubGlobal("fetch", applicationFetch);

    const result = await runValidation({ executeOne: true, key: "synthetic-fixture-key", fetch: injectedFetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "validation-incomplete", runState: "ready",
      ...expected,
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      planningGenerated: true, databaseDisposed: true,
    });
    expect(injectedFetch).toHaveBeenCalledTimes(2);
    expect(applicationFetch).not.toHaveBeenCalled();
  });
});
