// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createKimiLocalValidationProvider,
  getKimiLocalValidationProfile,
  OpenRouterResearchProvider,
} from "../../app/server/research/openrouter-provider";
import { ResearchProviderError } from "../../app/server/research/provider";

const REQUEST = { role: "Synthetic Quality Contract Role", locale: "en-US" } as const;
const REPAIR_ORIGINAL_CONTENT = "{\"synthetic\":true}";
const KEY = "synthetic-dummy-credential";
const STANDARD_RESEARCH_SHA256 = "ca1086cc876a9d1edf3bac26ffea04e410139a4ea3baa37b2c5f72f49878f408";
const STANDARD_REPAIR_SHA256 = "2fef124876e28a27b73b00e076307168f231fd40e68ff8f4708bc187ebb4f55d";

type CapturedBody = Readonly<{
  max_tokens: number;
  messages: ReadonlyArray<Readonly<{ role: string; content: string }>>;
  reasoning?: Readonly<{ effort: string }>;
}>;

function response(): Response {
  return Response.json({
    id: "synthetic-quality-contract",
    model: "test/actual-model",
    choices: [{ finish_reason: "stop", message: { content: "{}", annotations: [] } }],
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function captureFetch() {
  const bodies: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    bodies.push(init?.body as string);
    return response();
  });
  return { bodies, fetch };
}

async function captureLocalResearch(): Promise<{ raw: string; body: CapturedBody }> {
  const { bodies, fetch } = captureFetch();
  const globalFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("real fetch denied"); });
  vi.stubGlobal("fetch", globalFetch);
  const provider = createKimiLocalValidationProvider({ key: KEY, fetch });
  await provider.research(REQUEST);
  expect(fetch).toHaveBeenCalledOnce();
  expect(globalFetch).not.toHaveBeenCalled();
  expect(bodies).toHaveLength(1);
  return { raw: bodies[0]!, body: JSON.parse(bodies[0]!) as CapturedBody };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("../../app/server/research/local-validation-profile.json");
  vi.resetModules();
});

describe("local quality request contract", () => {
  it("admits only the exact v3 profile and v2 output policy", () => {
    expect(getKimiLocalValidationProfile()).toEqual({
      profileId: "kimi-low-output32k-v3",
      model: "moonshotai/kimi-k3",
      reasoningEffort: "low",
      maxOutputTokens: 32_768,
      outputPolicyVersion: "kimi-complete-quality-v2",
      researchTimeoutMs: 1_200_000,
      activeTtlMs: 1_260_000,
      launcherTimeoutMs: 1_320_000,
    });
  });

  it.each([
    ["old", "kimi-low-output32k-v2", "kimi-complete-quality-v1"],
    ["mixed old profile", "kimi-low-output32k-v2", "kimi-complete-quality-v2"],
    ["mixed old policy", "kimi-low-output32k-v3", "kimi-complete-quality-v1"],
  ] as const)("rejects the %s profile before transport", async (_label, profileId, outputPolicyVersion) => {
    vi.resetModules();
    vi.doMock("../../app/server/research/local-validation-profile.json", () => ({ default: {
      profileId,
      model: "moonshotai/kimi-k3",
      reasoningEffort: "low",
      maxOutputTokens: 32_768,
      outputPolicyVersion,
      researchTimeoutMs: 1_200_000,
      activeTtlMs: 1_260_000,
      launcherTimeoutMs: 1_320_000,
    } }));
    const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("transport must not run"); });
    const providerModule = await import("../../app/server/research/openrouter-provider");
    expect(() => providerModule.createKimiLocalValidationProvider({ key: KEY, fetch })).toThrowError(
      expect.objectContaining({ code: "unavailable", retryable: false, charged: false }) as ResearchProviderError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires complete seven-section registries with bounded per-skill unit kinds", async () => {
    const { body } = await captureLocalResearch();
    const policy = body.messages[0]!.content;
    for (const text of [
      "all seven sections: role, skills, prerequisiteEdges, resources, stages, unitTemplates, and evidence",
      "every necessary skill",
      "no hidden skill-count cap",
      "at least one learn unit, exactly one calibrate unit, and exactly one reinforce unit",
      "at most 8 unit templates per skill",
      "Do not use duplicate or empty shells to satisfy these counts",
    ]) expect(policy).toContain(text);
  });

  it("requires graph identity, reference, stage, and reciprocal-link closure", async () => {
    const { body } = await captureLocalResearch();
    const policy = body.messages[0]!.content;
    for (const text of [
      "IDs are unique within their own entity type",
      "Every step ID is unique across the entire registry",
      "every checkpoint ID is unique across the entire registry",
      "All reference arrays are deduplicated and every reference target exists",
      "Prerequisite edges are acyclic",
      "Every skill appears in exactly one stage",
      "skill.resourceIds and resource.skillIds are reciprocal",
      "primaryResourceId and alternativeResourceIds reference resources linked to that unit's skill",
      "alternativeResourceIds are unique and exclude primaryResourceId",
    ]) expect(policy).toContain(text);
  });

  it("requires annotation-backed evidence, honest core authority, and both free-alternative layers", async () => {
    const { body } = await captureLocalResearch();
    const policy = body.messages[0]!.content;
    for (const text of [
      "canonical public HTTPS URLs from provider annotations",
      "Canonical resource URLs are deduplicated",
      "Evidence IDs and skill-resource pairs are each unique",
      "Each evidence target exists and has reciprocal skill-resource links",
      "Every skill has valid evidence",
      "every core skill has valid evidence from an honestly classified primary or institutional source",
      "do not upgrade a source tier merely to pass validation",
      "purpose=primary and cost=paid or mixed",
      "purpose=alternative and cost=free",
      "For each unit whose primaryResourceId has cost=paid or mixed",
      "its own alternativeResourceIds include a cost=free resource linked to that unit's skill",
    ]) expect(policy).toContain(text);
  });

  it("applies one exact checkpoint and minutes rule to every unit kind", async () => {
    const { body } = await captureLocalResearch();
    const policy = body.messages[0]!.content;
    for (const text of [
      "For every unit kind",
      "estimatedMinutes equals the sum of step minutes",
      "60 minutes or less has no checkpoints",
      "more than 60 minutes has checkpoints",
      "Each checkpoint is 30 to 60 minutes",
      "complete contiguous source-order step sequence exactly once",
      "Each checkpoint's estimatedMinutes equals its step-minute sum",
      "checkpoint-minute sum equals the unit estimatedMinutes",
      "Do not force units below 60 minutes",
    ]) expect(policy).toContain(text);
    expect(policy).not.toContain("calibrate and reinforce are atomic with no checkpoints");
  });

  it("requires substantive unique criteria and a silent complete JSON response", async () => {
    const { body } = await captureLocalResearch();
    const policy = body.messages[0]!.content;
    for (const text of [
      "completionCriteria and rubric entries are each unique",
      "specific objectives, exercises, proof requirements, and scoring criteria",
      "Silently check every rule above before returning",
      "Return only one complete candidate JSON object",
      "Do not reveal chain-of-thought",
      "add self-check or other fields",
      "fabricate missing evidence",
      "rely on continuation",
    ]) expect(policy).toContain(text);
  });

  it("preserves the non-quality local request parameters", async () => {
    const { body } = await captureLocalResearch();
    expect(body).toMatchObject({
      model: "moonshotai/kimi-k3",
      stream: false,
      max_tokens: 32_768,
      max_tool_calls: 10,
      reasoning: { effort: "low" },
      provider: { require_parameters: true, data_collection: "deny", zdr: true },
      response_format: { type: "json_schema", json_schema: { strict: true } },
      tools: [{ type: "openrouter:web_search", parameters: {
        engine: "exa", mode: "fast", max_results: 5, max_uses: 10, max_total_results: 50, max_characters: 2000,
      } }],
    });
  });
});

describe("standard request immutability", () => {
  it("keeps standard Research and Repair request bodies byte-for-byte equal to the frozen baseline", async () => {
    const { bodies, fetch } = captureFetch();
    const globalFetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("real fetch denied"); });
    vi.stubGlobal("fetch", globalFetch);
    const provider = new OpenRouterResearchProvider({
      OPENROUTER_API_KEY: KEY,
      ARC_AI_MODEL_RESEARCH: "test/research-fixed",
      ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
    }, { fetch });

    await provider.research(REQUEST);
    await provider.repair({ ...REQUEST, originalContent: REPAIR_ORIGINAL_CONTENT, annotations: [] });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(bodies.map(sha256)).toEqual([STANDARD_RESEARCH_SHA256, STANDARD_REPAIR_SHA256]);
  });
});
