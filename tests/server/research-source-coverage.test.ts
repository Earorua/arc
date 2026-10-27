// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { researchCandidateSchema } from "../../app/contracts/research";
import { auditResearchSources, SourcePolicyError } from "../../app/server/research/source-audit";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

describe("bounded source citation coverage", () => {
  it("counts duplicate and tracking-only canonical citations without losing the missing index", () => {
    const candidate = researchCandidateSchema.parse(validResearchCandidate);
    const annotations = structuredClone(validAnnotations).slice(1);
    annotations[0]!.url += "?utm_source=test#section";
    annotations.push(structuredClone(annotations[0]!));
    const observer = vi.fn();
    expect(() => auditResearchSources(candidate, annotations, "2026-10-25", observer))
      .toThrowError(new SourcePolicyError("unreferenced-url"));
    expect(observer).toHaveBeenCalledOnce();
    expect(observer.mock.calls[0]![0]).toEqual({ version: "source-coverage-v1", resourceCount: 6,
      annotationCount: 6, uniqueCitationCount: 5, matchedResourceCount: 5, missingResourceCount: 1,
      missingResourceIndexes: [0], truncated: false });
    const logged = JSON.stringify(observer.mock.calls);
    expect(logged).not.toContain("https://");
    for (const resource of candidate.resources) expect(logged).not.toContain(resource.title);
  });
  it("distinguishes absent citations and bounds positions while preserving the total", () => {
    const candidate = researchCandidateSchema.parse(validResearchCandidate);
    candidate.resources = Array.from({ length: 20 }, () => structuredClone(candidate.resources[0]!));
    const observer = vi.fn();
    expect(() => auditResearchSources(candidate, [], "2026-10-25", observer)).toThrowError(new SourcePolicyError("unreferenced-url"));
    expect(observer.mock.calls[0]![0]).toEqual({ version: "source-coverage-v1", resourceCount: 20,
      annotationCount: 0, uniqueCitationCount: 0, matchedResourceCount: 0, missingResourceCount: 20,
      missingResourceIndexes: Array.from({ length: 16 }, (_, i) => i), truncated: true });
  });
  it("does not let observation mutate the audit inputs or alter acceptance", () => {
    const candidate = researchCandidateSchema.parse(validResearchCandidate);
    const baseline = auditResearchSources(candidate, validAnnotations, "2026-10-25");
    const observer = vi.fn(() => { throw Error("observer failed"); });
    expect(auditResearchSources(candidate, validAnnotations, "2026-10-25", observer)).toEqual(baseline);
    expect(observer).toHaveBeenCalledOnce();
    const [diagnostic] = observer.mock.calls[0]! as unknown as [{ missingResourceIndexes: readonly number[] }];
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(Object.isFrozen(diagnostic.missingResourceIndexes)).toBe(true);
  });
  it("does not report parsed coverage for invalid or unsafe annotations", () => {
    const observer = vi.fn();
    const candidate = researchCandidateSchema.parse(validResearchCandidate);
    expect(() => auditResearchSources(candidate, [{ type: "url_citation", url: "http://127.0.0.1/", title: "private" }], "2026-10-25", observer)).toThrow();
    expect(observer).not.toHaveBeenCalled();
  });
});
