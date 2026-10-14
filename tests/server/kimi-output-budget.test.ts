// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createKimiLocalValidationProvider, OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { ResearchProviderError } from "../../app/server/research/provider";

const request = { role: "Data Product Manager", locale: "en-US" } as const;

function lengthResponse() {
  return Response.json({
    model: "moonshotai/kimi-k3",
    choices: [{ finish_reason: "length" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.1,
      server_tool_use: { web_search_requests: 2 } },
  });
}

describe("Kimi local output budget", () => {
  it("sends the fixed 32768-token budget only through the local validation factory", async () => {
    const localFetch = vi.fn<typeof globalThis.fetch>(async () => lengthResponse());
    const local = createKimiLocalValidationProvider({ key: "synthetic-local-key", fetch: localFetch });

    await local.research(request).catch(() => undefined);

    expect(localFetch).toHaveBeenCalledOnce();
    expect(JSON.parse(localFetch.mock.calls[0]![1]!.body as string).max_tokens).toBe(32_768);

    const standardFetch = vi.fn<typeof globalThis.fetch>(async () => lengthResponse());
    const standard = new OpenRouterResearchProvider({ OPENROUTER_API_KEY: "synthetic-standard-key",
      ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3", ARC_AI_MODEL_ECONOMY: "moonshotai/kimi-k3" },
    { fetch: standardFetch });
    await standard.research(request).catch(() => undefined);
    const standardBody = JSON.parse(standardFetch.mock.calls[0]![1]!.body as string);
    expect(standardBody.max_tokens).toBe(12_000);
    expect(standardBody).not.toHaveProperty("reasoning");
    expect(standardBody.messages[0].content).not.toContain("kimi-complete-quality-v2");
  });

  it("adds the fixed complete-quality policy before an unchanged pure JSON schema suffix", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => lengthResponse());
    const provider = createKimiLocalValidationProvider({ key: "synthetic-local-key", fetch });
    await provider.research(request).catch(() => undefined);
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    const system = body.messages[0].content as string;
    const marker = "\nOUTPUT_CONTRACT_JSON:\n";
    const markerIndex = system.indexOf(marker);
    expect(markerIndex).toBeGreaterThan(0);
    const policy = system.slice(0, markerIndex);
    expect(policy).toContain("kimi-complete-quality-v2");
    expect(policy).toContain("role, skills, prerequisiteEdges, resources, stages, unitTemplates, and evidence");
    expect(policy).toContain("every necessary skill");
    expect(policy).toContain("at least one learn unit, exactly one calibrate unit, and exactly one reinforce unit");
    expect(policy).toContain("no hidden skill-count cap");
    expect(policy).toContain("Do not invent source authority or citations");
    expect(policy).toContain("Do not force units below 60 minutes");
    expect(policy).toContain("Return only one complete candidate JSON object");
    expect(policy).toContain("rely on continuation");
    expect(JSON.parse(system.slice(markerIndex + marker.length))).toEqual(body.response_format.json_schema.schema);
  });

  it("keeps the standard Kimi model on the standard 120 second ceiling", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => lengthResponse());
    const provider = new OpenRouterResearchProvider({ OPENROUTER_API_KEY: "synthetic-standard-key",
      ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3", ARC_AI_MODEL_ECONOMY: "moonshotai/kimi-k3",
      researchTimeoutMs: 120_001 }, { fetch });
    const error = await provider.research(request).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ResearchProviderError);
    expect(error).toMatchObject({ code: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
