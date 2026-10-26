// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { researchCandidateSchema, researchQualityReportSchema, type ProviderCitationAnnotation } from "../../app/contracts/research";
import { validateResearchCandidate, type ResearchValidationContext } from "../../app/server/research/package-validator";
import { createKimiLocalValidationProvider, OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { RESEARCH_PROVIDER_VERSIONS } from "../../app/server/research/provider";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import observedResource from "../fixtures/research/r136-conditional-free-resource.json";

const context: ResearchValidationContext = {
  packageId: "research-package-access", blueprintVersion: "2026.10.1", registryVersion: "2026.10.1", templateVersion: "2026.10.1",
  ...RESEARCH_PROVIDER_VERSIONS, observedAt: "2026-10-24", expiresAt: "2026-11-24",
};
afterEach(() => vi.unstubAllGlobals());

function sample(observed = false) {
  const candidate = researchCandidateSchema.parse(validResearchCandidate);
  const original = candidate.resources[0]!;
  candidate.resources[0] = { ...observedResource, id: original.id, skillIds: original.skillIds } as typeof original;
  const annotations: ProviderCitationAnnotation[] = structuredClone(validAnnotations);
  annotations[0] = { type: "url_citation", title: observedResource.title, url: observedResource.url };
  if (!observed) {
    candidate.resources[0]!.url = "https://developers.google.com/machine-learning/problem-framing/access-fixture";
    candidate.resources[0]!.provider = "Google";
    annotations[0]!.url = candidate.resources[0]!.url;
  }
  return { candidate, annotations };
}
function validate(value = sample()) {
  return validateResearchCandidate(value.candidate, value.annotations, context);
}

describe("conditional free learning access", () => {
  it("holds the actual r136 promotional course for review without rewriting the candidate or fetching", () => {
    const value = sample(true);
    const before = structuredClone(value);
    const fetch = vi.fn(() => { throw new Error("No network permitted"); });
    vi.stubGlobal("fetch", fetch);
    const result = validate(value);
    expect(result.ready).toBe(false);
    expect(result.quality).toMatchObject({ passed: false, issueCodes: ["unverified-free-access", "unverified-source-authority"], skillCount: 3, sourceCount: 6, unitCount: 9 });
    expect(researchQualityReportSchema.safeParse(result.quality).success).toBe(true);
    if (!result.ready) expect(result.sanitizedCandidate).toEqual(before.candidate);
    expect(value).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "3天数据产品经理新人集训（限时免费）", "数据产品课程：限额免费", "前100名免费：数据产品训练营",
    "数据产品课程免费试学", "数据产品课程免费试听", "Data product course — Free trial",
    "Data product course — 7-day free trial", "Free for a limited time: data product course",
    "Data product course — free for 7 days", "数据产品课程 — 免费7天",
    "Data product course — free for the first 100 students",
    "Data product course — first 100 seats free", "Data product course — ＦＲＥＥ ＴＲＩＡＬ",
  ])("does not accept a conditional free course as generally free: %s", title => {
    const value = sample();
    value.candidate.resources[0]!.title = title;
    value.annotations[0]!.title = "Data product course";
    expect(validate(value).quality.issueCodes).toContain("unverified-free-access");
  });

  it.each(["Data product course — free for 7 days", "数据产品课程 — 免费7天", "Data product course — free for the first 100 students"])("checks numeric restrictions in the provider citation: %s", title => {
    const value = sample();
    value.candidate.resources[0]!.title = "Data product course";
    value.annotations[0]!.title = title;
    expect(validate(value).quality.issueCodes).toContain("unverified-free-access");
  });

  it("also checks provider titles when the generated title omits the restriction", () => {
    const value = sample();
    value.candidate.resources[0]!.title = "Data product course";
    expect(validate(value).quality.issueCodes).toContain("unverified-free-access");
  });

  it("does not let a benign duplicate citation hide a conditional offer", () => {
    const value = sample();
    value.candidate.resources[0]!.title = "Data product course";
    value.annotations.push({ ...value.annotations[0]!, url: value.annotations[0]!.url + "?utm_source=duplicate", title: "A data product course" });
    expect(validate(value).quality.issueCodes).toContain("unverified-free-access");
    value.annotations.reverse();
    expect(validate(value).quality.issueCodes).toContain("unverified-free-access");
  });

  it.each(["Introduction to data products", "Data product lecture notes — 2020", "免费数据产品课程", "Data product course: free lessons", "7-day free data product course", "Learn SQL for free in 7 days"])("keeps ordinary free teaching material eligible: %s", title => {
    const value = sample();
    value.candidate.resources[0]!.title = title;
    value.annotations[0]!.title = title;
    expect(validate(value).ready).toBe(true);
  });

  it.each(["paid", "mixed"] as const)("keeps honestly priced %s courses with a free alternative eligible", cost => {
    const value = sample();
    value.candidate.resources[0]!.cost = cost;
    expect(validate(value).ready).toBe(true);
  });

  it("does not classify an article about free trials as a course offer", () => {
    const value = sample();
    value.candidate.resources[0]!.format = "guide";
    value.candidate.resources[0]!.title = "How to design a product free trial";
    value.annotations[0]!.title = value.candidate.resources[0]!.title;
    expect(validate(value).ready).toBe(true);
  });

  it("checks free course alternatives as well as primary courses", () => {
    const value = sample();
    value.candidate.resources[0]!.purpose = "alternative";
    expect(validate(value).quality.issueCodes).toContain("unverified-free-access");
  });
});

describe.each(["standard", "kimi"] as const)("%s resource selection instructions", kind => {
  it("asks for current teaching access, honest pricing and publisher attribution without changing paid limits", async () => {
    const requests: Record<string, unknown>[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      requests.push(JSON.parse(init!.body as string));
      return Response.json({ id: "synthetic-resource-access", model: "test/research", choices: [{ finish_reason: "stop", message: { content: "{}", annotations: [] } }] });
    });
    const provider = kind === "kimi" ? createKimiLocalValidationProvider({ key: "synthetic-dummy-credential", fetch })
      : new OpenRouterResearchProvider({ OPENROUTER_API_KEY: "synthetic-dummy-credential", ARC_AI_MODEL_RESEARCH: "test/research", ARC_AI_MODEL_ECONOMY: "test/economy" }, { fetch });
    await provider.research({ role: "Data Product Manager", locale: "en-US" });
    expect(fetch).toHaveBeenCalledOnce();
    const messages = requests[0]!.messages as { content: string }[];
    const policy = messages[0]!.content;
    for (const requirement of ["direct teaching material", "enrollment promotions", "free trials", "current access", "publisher identity", "unofficial mirrors", "free open courses from leading universities in the United States", "Both free and paid company courses are eligible", "woshipm.com", "publisher provenance only", "ocw.mit.edu"]) {
      expect(policy).toContain(requirement);
    }
    expect(policy).toContain("Copy each resource URL exactly from an actual web-search result");
    expect(policy).toContain("Do not rewrite paths, add /info, replace a year, or change locale/query parameters");
    expect(RESEARCH_PROVIDER_VERSIONS).toMatchObject({ promptVersion: "research-prompt-v6", qualityVersion: "research-quality-v5" });
    expect(JSON.parse(messages[1]!.content).versions).toEqual(RESEARCH_PROVIDER_VERSIONS);
    expect(requests[0]!.max_tool_calls).toBe(10);
    expect(requests[0]!.max_tokens).toBe(kind === "kimi" ? 32768 : 12000);
  });
});
