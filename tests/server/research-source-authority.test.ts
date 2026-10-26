// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { researchCandidateSchema, type ProviderCitationAnnotation } from "../../app/contracts/research";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { RESEARCH_PROVIDER_VERSIONS } from "../../app/server/research/provider";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const context = { packageId: "authority-regression", blueprintVersion: "2026.10.1", registryVersion: "2026.10.1", templateVersion: "2026.10.1", ...RESEARCH_PROVIDER_VERSIONS, observedAt: "2026-10-24", expiresAt: "2026-11-24" };
function sample(url: string, provider: string, format = "course", cost = "free") {
  const candidate = researchCandidateSchema.parse(validResearchCandidate);
  Object.assign(candidate.resources[0]!, { url, provider, format, cost, title: "Verified learning material", sourceTier: "institutional" });
  const annotations: ProviderCitationAnnotation[] = structuredClone(validAnnotations);
  annotations[0] = { type: "url_citation", url, title: "Verified learning material" };
  return { candidate, annotations };
}
function check(value: ReturnType<typeof sample>) {
  return validateResearchCandidate(value.candidate, value.annotations, context);
}

describe("learning publisher authority", () => {
  it.each([
    ["https://www.woshipm.com/online/3569229.html", "人人都是产品经理"],
    ["https://www.woshipm.com/online/3569229.html", "MIT"],
    ["https://unknown-academy.com/course/data", "Stanford University"],
    ["https://ocw.mit.edu.evil.com/courses/data", "MIT"],
    ["https://student.mit.edu/course/data", "MIT"],
    ["https://learn.microsoft.com/en-us/answers/questions/123/course", "Microsoft"],
    ["https://learn.microsoft.com/en-us/training-evil/modules/course", "Microsoft"],
    ["https://developers.google.com/community/article", "Google"],
    ["https://www.coursera.org/learn/unknown-course", "Google"],
    ["https://ocw.mit.edu/courses/example/", "Stanford University"],
    ["https://edu.alibabacloud.com/course/353/info", "Google"],
    ["https://edu.alibabacloud.com.evil.com/course/353/info", "Alibaba Cloud"],
    ["https://community.alibabacloud.com/course/353/info", "Alibaba Cloud"],
    ["https://edu.alibabacloud.com/course/353/info-enrollment", "Alibaba Cloud"],
    ["https://edu.alibabacloud.com/course/767/enroll", "Alibaba Cloud"],
    ["https://edu.alibabacloud.com/course/767-info", "Alibaba Cloud"],
    ["https://edu.alibabacloud.com/promotion/free-training", "Alibaba Cloud"],
  ])("does not accept an asserted authority label for %s", (url, provider) => {
    const result = check(sample(url, provider));
    expect(result.ready).toBe(false);
    expect(result.quality.issueCodes).toContain("unverified-source-authority");
  });

  it.each([
    ["https://ocw.mit.edu/courses/15-060-data-models-and-decisions-fall-2014/", "MIT OpenCourseWare"],
    ["https://cs50.harvard.edu/x/", "Harvard University"],
    ["https://see.stanford.edu/Course/CS229", "Stanford University"],
    ["https://oyc.yale.edu/economics/econ-252-11", "Yale University"],
    ["https://developers.google.com/machine-learning/crash-course", "Google"],
    ["https://learn.microsoft.com/en-us/training/modules/get-started-with-power-bi/1-introduction", "Microsoft Learn"],
    ["https://edu.alibabacloud.com/course/767", "Alibaba Cloud"],
    ["https://edu.alibabacloud.com/course/860/", "Alibaba Cloud Academy"],
  ])("permits an official teaching entry %s", (url, provider) => {
    expect(check(sample(url, provider)).ready).toBe(true);
  });

  it.each(["paid", "mixed"])("permits honest %s company training with a free alternative", cost => {
    expect(check(sample("https://www.skills.google/course_templates/552", "Google Cloud", "course", cost)).ready).toBe(true);
  });

  it.each(["free", "paid", "mixed"])("permits verified Chinese company %s courses as a fallback", cost => {
    expect(check(sample("https://edu.alibabacloud.com/course/353/info", "Alibaba Cloud Academy", "course", cost)).ready).toBe(true);
  });

  it("does not treat an official reference publisher as a course provider", () => {
    expect(check(sample("https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview", "dbt Labs")).quality.issueCodes).toContain("unverified-source-authority");
  });

  it("still requires the exact cited course URL, not a different catalog-shaped route", () => {
    const value = sample("https://edu.alibabacloud.com/course/767/info", "Alibaba Cloud");
    value.annotations[0]!.url = "https://edu.alibabacloud.com/course/767";
    expect(check(value).quality.issueCodes).toContain("unreferenced-url");
  });

  it("checks alternative resources too and reports no URLs or titles in diagnostics", () => {
    const value = sample("https://ocw.mit.edu/courses/15-060-data-models-and-decisions-fall-2014/", "MIT");
    value.candidate.resources[1]!.url = "https://www.woshipm.com/online/3569229.html";
    value.annotations[1]!.url = value.candidate.resources[1]!.url;
    const observer = vi.fn();
    const before = JSON.stringify(value);
    const result = validateResearchCandidate(value.candidate, value.annotations, context, { onQualityDiagnostic: observer });
    expect(result.ready).toBe(false);
    expect(observer.mock.calls[0]?.[0].evidenceIssueCodes).toContain("unverified-source-authority");
    expect(JSON.stringify(observer.mock.calls)).not.toContain("woshipm");
    expect(JSON.stringify(value)).toBe(before);
  });
});
