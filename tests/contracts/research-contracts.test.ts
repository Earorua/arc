import { describe, expect, it } from "vitest";
import {
  researchCandidateSchema,
  providerCitationAnnotationSchema,
  providerUsageSchema,
  researchPackageSchema,
  researchQualityReportSchema,
  researchRequestSchema,
  researchRunPublicViewSchema,
  researchStateSchema,
} from "../../app/contracts/research";
import { validResearchCandidate } from "../fixtures/research/valid-candidate";
import { invalidResearchCandidates } from "../fixtures/research/invalid-candidates";

describe("research contracts", () => {
  it("accepts the bounded public request", () => {
    const request = {
      mutationId: "mutation-research-00000001",
      role: "数据产品经理",
      locale: "zh-CN" as const,
    };

    expect(researchRequestSchema.parse(request)).toEqual(request);
  });

  it("rejects injected request control fields", () => {
    expect(() => researchRequestSchema.parse({
      mutationId: "mutation-research-00000001",
      role: "数据产品经理",
      locale: "zh-CN",
      model: "attacker/model",
    })).toThrow();
  });

  it("accepts a complete provider-neutral research candidate", () => {
    expect(researchCandidateSchema.parse(validResearchCandidate)).toEqual(validResearchCandidate);
  });

  it("forbids provider-authored confidence", () => {
    expect(() => researchCandidateSchema.parse(invalidResearchCandidates.confidenceInjection)).toThrow();
  });

  it("keeps domain-policy adversarial fixtures structurally parseable for later quality gates", () => {
    expect(researchCandidateSchema.parse(invalidResearchCandidates.missingSkillSource)).toBeDefined();
    expect(researchCandidateSchema.parse(invalidResearchCandidates.dependencyCycle)).toBeDefined();
    expect(researchCandidateSchema.parse(invalidResearchCandidates.minuteMismatch)).toBeDefined();
    expect(researchCandidateSchema.parse(invalidResearchCandidates.paidOnlyPrimary)).toBeDefined();
    expect(researchCandidateSchema.parse(invalidResearchCandidates.htmlPayload)).toBeDefined();
    expect(() => researchCandidateSchema.parse(invalidResearchCandidates.oversizedText)).toThrow();
  });

  it("rejects unknown fields in nested candidate objects", () => {
    expect(() => researchCandidateSchema.parse({
      ...validResearchCandidate,
      unitTemplates: [{
        ...validResearchCandidate.unitTemplates[0],
        steps: [{ ...validResearchCandidate.unitTemplates[0].steps[0], toolChoice: "auto" }],
      }, ...validResearchCandidate.unitTemplates.slice(1)],
    })).toThrow();
  });

  it("accepts exact request boundaries after trimming and rejects values outside them", () => {
    expect(researchRequestSchema.parse({
      mutationId: `  ${"a".repeat(128)}  `,
      role: `  ${"数".repeat(160)}  `,
      locale: "zh-CN",
    })).toEqual({ mutationId: "a".repeat(128), role: "数".repeat(160), locale: "zh-CN" });
    expect(researchRequestSchema.parse({
      mutationId: "a-bcdefg",
      role: "BI",
      locale: "en-US",
    }).role).toBe("BI");
    expect(() => researchRequestSchema.parse({ mutationId: "abcdefg", role: "BI", locale: "en-US" })).toThrow();
    expect(() => researchRequestSchema.parse({ mutationId: "a-bcdefg", role: "B", locale: "en-US" })).toThrow();
  });

  it("keeps resource URL policy outside the candidate schema", () => {
    const candidate = {
      ...validResearchCandidate,
      resources: [{ ...validResearchCandidate.resources[0], url: "not-yet-audited" }, ...validResearchCandidate.resources.slice(1)],
    };
    expect(researchCandidateSchema.parse(candidate).resources[0]?.url).toBe("not-yet-audited");
  });

  it("accepts the complete state set and a sorted hard-gate report", () => {
    expect([
      "queued", "researching", "validating", "ready", "needs-review", "failed",
    ].map((state) => researchStateSchema.parse(state))).toHaveLength(6);
    expect(researchQualityReportSchema.parse({
      passed: false,
      issueCodes: ["invalid-graph", "missing-unit"],
      skillCount: 3,
      sourceCount: 6,
      unitCount: 3,
      observedAt: "2026-08-27",
    }).issueCodes).toEqual(["invalid-graph", "missing-unit"]);
    expect(() => researchQualityReportSchema.parse({
      passed: false,
      issueCodes: ["missing-unit", "invalid-graph"],
      skillCount: 3,
      sourceCount: 6,
      unitCount: 3,
      observedAt: "2026-08-27",
    })).toThrow();
  });

  it("accepts bounded provider citation annotations and usage", () => {
    expect(providerCitationAnnotationSchema.parse({
      type: "url_citation",
      url: "not-yet-audited",
      title: "Bounded citation title",
    }).url).toBe("not-yet-audited");
    expect(providerUsageSchema.parse({
      promptTokens: 1_200,
      completionTokens: 3_400,
      totalTokens: 4_600,
      costMicros: 410,
      webSearchRequests: 2,
    }).totalTokens).toBe(4_600);
  });

  it("composes canonical intelligence and unit-registry contracts in a research package", () => {
    const researchPackage = validResearchPackage();
    expect(researchPackageSchema.parse(researchPackage)).toEqual(researchPackage);
  });

  it("exposes a bounded Ready summary without provider or cost metadata", () => {
    const view = researchRunPublicViewSchema.parse({
      id: "research-run-1",
      state: "ready",
      role: "数据产品经理",
      locale: "zh-CN",
      retryable: false,
      packageId: "research-package-1",
      summary: "Leads evidence-backed data products from opportunity discovery through measurable delivery.",
      skillCount: 3,
      sourceCount: 6,
      observedAt: "2026-08-27",
      quality: { passed: true, issueCodes: [] },
    });

    expect(view).not.toHaveProperty("provider");
    expect(view).not.toHaveProperty("costMicros");
  });

  it("rejects private metadata and packages from every public run state", () => {
    expect(() => researchRunPublicViewSchema.parse({
      id: "research-run-1",
      state: "researching",
      role: "Data Product Manager",
      locale: "en-US",
      retryable: false,
      packageId: "research-package-1",
    })).toThrow();
    expect(() => researchRunPublicViewSchema.parse({
      id: "research-run-2",
      state: "failed",
      role: "Data Product Manager",
      locale: "en-US",
      retryable: true,
      failureCategory: "timeout",
      provider: "private-provider",
    })).toThrow();
  });
});

function validResearchPackage() {
  const resource = {
    id: "dbt-modeling-guide",
    title: "How we structure our dbt projects",
    url: "https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview",
    provider: "dbt Labs",
    language: "en" as const,
    cost: "free" as const,
    format: "documentation" as const,
    sourceTier: "primary" as const,
    purpose: "primary" as const,
    estimatedMinutes: 90,
    lastVerifiedAt: "2026-08-27",
    skillIds: ["data-modeling"],
  };
  const template = {
    id: "data-modeling-learn-01",
    version: "2026.08.1",
    skillId: "data-modeling",
    kind: "learn" as const,
    title: "Model a product decision boundary",
    objective: "Define the entities and measures needed for one product decision.",
    whyNow: "A stable model is the prerequisite for trustworthy product analytics.",
    primaryResourceId: resource.id,
    alternativeResourceIds: [],
    steps: [{ id: "draft-model", label: "Draft the decision model", minutes: 120 }],
    checkpoints: [{
      id: "model-review",
      label: "Review grain and metric definitions",
      stepIds: ["draft-model"],
      estimatedMinutes: 120,
    }],
    buildTask: "Create a one-page product measurement model.",
    completionCriteria: ["Every metric has a grain and owner."],
    proofRequirement: "Submit the model with an explanation of one trade-off.",
    rubric: ["Definitions are consistent."],
    estimatedMinutes: 120,
  };
  return {
    id: "research-package-1",
    blueprint: {
      id: "data-product-manager",
      name: "Data Product Manager",
      summary: "Leads evidence-backed data products from opportunity discovery through measurable delivery.",
      version: "2026.08.1",
      status: "ready" as const,
      updatedAt: "2026-08-27",
      languagePolicy: "english-first" as const,
      skills: [{
        id: "data-modeling",
        name: "Data modeling",
        category: "data" as const,
        importance: "core" as const,
        why: "Reliable product decisions begin with shared definitions and trustworthy analytical models.",
        confidence: 0.75,
        masteryCriteria: [
          "Define product entities and metrics with explicit grain and ownership.",
          "Review a dimensional model for ambiguity, lineage, and change risk.",
        ],
        prerequisiteIds: [],
        resourceIds: [resource.id],
      }],
      resources: [resource],
      phases: [{
        id: "measurement-foundations",
        name: "Measurement foundations",
        weeks: 3,
        outcome: "Create a governed product measurement model that supports trustworthy decisions.",
        skillIds: ["data-modeling"],
      }],
    },
    registry: {
      id: "data-product-manager-units",
      version: "2026.08.1",
      blueprintId: "data-product-manager",
      blueprintVersion: "2026.08.1",
      tracks: [{ skillId: "data-modeling", templates: [template] }],
    },
    sourceEvidence: [{
      canonicalUrl: resource.url,
      title: resource.title,
      hostname: "docs.getdbt.com",
      sourceTier: "primary" as const,
      observedAt: "2026-08-27",
      citationHash: "citation-hash-1",
    }],
    qualityReport: {
      passed: true,
      issueCodes: [],
      skillCount: 1,
      sourceCount: 1,
      unitCount: 1,
      observedAt: "2026-08-27",
    },
    promptVersion: "research-prompt-v1",
    inputSchemaVersion: "research-input-v1",
    outputSchemaVersion: "research-output-v1",
    qualityVersion: "research-quality-v1",
    modelConfigVersion: "research-model-config-v1",
    contentFingerprint: "sha256-content-fingerprint",
    observedAt: "2026-08-27",
    expiresAt: "2026-09-26",
  };
}
