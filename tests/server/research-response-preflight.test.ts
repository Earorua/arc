// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import * as annotationModule from "../../app/server/research/annotation-diagnostic";
import * as providerModule from "../../app/server/research/provider";
import * as resultDiagnosticModule from "../../app/server/research/result-diagnostic";
import { buildResponsePreflightDiagnostic, projectResponsePreflightDiagnostic,
  type ResearchResponsePreflightDiagnostic } from "../../app/server/research/response-preflight-diagnostic";
import { validResearchCandidate } from "../fixtures/research/valid-candidate";

const validContent = JSON.stringify(validResearchCandidate);
const validAnnotations = [{ type: "url_citation", url_citation: { url: "https://example.com", title: "Example" } }];

describe("response preflight diagnostic", () => {
  it.each([
    ["valid candidate", validContent, { outcome: "accepted", reason: null }],
    ["syntax failure", "{", { outcome: "rejected", reason: "json-syntax" }],
    ["schema failure", JSON.stringify({}), { outcome: "rejected", reason: "schema-rejected" }],
    ["string limit", JSON.stringify({ body: "x".repeat(8_193) }), { outcome: "rejected", reason: "string-limit" }],
    ["array limit", JSON.stringify(Array.from({ length: 4_097 }, () => 0)), { outcome: "rejected", reason: "array-limit" }],
    ["object limit", JSON.stringify(Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`k${i}`, i]))), { outcome: "rejected", reason: "object-limit" }],
    ["depth limit", JSON.stringify(Array.from({ length: 14 }).reduce<unknown>((value) => [value], 0)), { outcome: "rejected", reason: "depth-limit" }],
    ["node limit", JSON.stringify(Array.from({ length: 4_096 }, () => [0, 0, 0, 0, 0, 0])), { outcome: "rejected", reason: "node-limit" }],
    ["content limit", "x".repeat(196_609), { outcome: "rejected", reason: "content-limit" }],
  ] as const)("captures the existing bounded parser outcome for %s", (_name, content, expected) => {
    expect(buildResponsePreflightDiagnostic(content, validAnnotations)?.candidateSchema).toMatchObject(expected);
  });

  it("uses the same complete fence normalization as Site import in v2", () => {
    const fenced = `\`\`\`json\n${validContent}\n\`\`\``;
    expect(buildResponsePreflightDiagnostic(fenced, validAnnotations))
      .toMatchObject({ version: "response-preflight-v2", candidateSchema: { outcome: "accepted", reason: null } });
  });

  it.each([`\`\`\`json\n{\n\`\`\``, `Explanation\n${validContent}`, `${validContent}\nMore text`, "{\"incomplete\":"])(
    "does not invent or extract a candidate from malformed content", (content) => {
      expect(buildResponsePreflightDiagnostic(content, validAnnotations)?.candidateSchema)
        .toMatchObject({ outcome: "rejected", reason: "json-syntax" });
    },
  );

  it("applies the raw content limit before removing whitespace or a fence", () => {
    const content = " ".repeat(196_609) + validContent;
    expect(buildResponsePreflightDiagnostic(content, validAnnotations)?.candidateSchema)
      .toMatchObject({ outcome: "rejected", reason: "content-limit" });
  });

  it("combines annotation and candidate results without retaining candidate content", () => {
    const diagnostic = buildResponsePreflightDiagnostic(validContent, [
      { type: "url_citation", url_citation: { url: "https://example.com", title: null, privateBody: "body-canary" } },
    ]);
    expect(diagnostic).toEqual({ version: "response-preflight-v2", stage: "complete-content-preflight",
      annotations: { state: "incompatible", container: "array", count: 1, recognizedCount: 1, ignoredCount: 0,
        issues: [{ index: 0, code: "title-null" }], truncated: false },
      candidateSchema: { outcome: "accepted", reason: null, issues: [], truncated: false } });
    expect(JSON.stringify(diagnostic)).not.toMatch(/example\.com|body-canary|Data Product Manager/u);
  });

  it("isolates annotation builder and candidate parser failures", () => {
    vi.spyOn(annotationModule, "buildAnnotationDiagnostic").mockImplementationOnce(() => { throw new Error("annotation"); });
    expect(buildResponsePreflightDiagnostic(validContent, validAnnotations)).toMatchObject({
      annotations: null, candidateSchema: { outcome: "accepted" },
    });
    vi.spyOn(providerModule, "candidateFromContent").mockImplementationOnce(() => { throw new Error("candidate"); });
    expect(buildResponsePreflightDiagnostic(validContent, validAnnotations)).toMatchObject({
      annotations: { state: "compatible" }, candidateSchema: null,
    });
  });

  it("isolates candidate projector failures", () => {
    vi.spyOn(resultDiagnosticModule, "projectValidationCandidateDiagnostic")
      .mockImplementationOnce(() => { throw new Error("projector"); });
    expect(buildResponsePreflightDiagnostic(validContent, validAnnotations)).toMatchObject({
      annotations: { state: "compatible" }, candidateSchema: null,
    });
  });
});

describe("response preflight projector", () => {
  const diagnostic: ResearchResponsePreflightDiagnostic = {
    version: "response-preflight-v1", stage: "complete-content-preflight",
    annotations: { state: "compatible", container: "array", count: 0, recognizedCount: 0,
      ignoredCount: 0, issues: [], truncated: false },
    candidateSchema: { outcome: "accepted", reason: null, issues: [], truncated: false },
  };

  it("retains the version distinction between historical raw v1 and normalized v2 diagnostics", () => {
    expect(projectResponsePreflightDiagnostic(diagnostic)).toEqual(diagnostic);
    const normalized = { ...diagnostic, version: "response-preflight-v2" };
    expect(projectResponsePreflightDiagnostic(normalized)).toEqual(normalized);
  });

  it("returns fresh strict metadata and rejects unknown or malformed fields", () => {
    const first = projectResponsePreflightDiagnostic(diagnostic)!;
    const second = projectResponsePreflightDiagnostic(diagnostic)!;
    expect(first).toEqual(diagnostic);
    expect(first).not.toBe(diagnostic);
    expect(first).not.toBe(second);
    expect(first.annotations).not.toBe(diagnostic.annotations);
    expect(first.candidateSchema).not.toBe(diagnostic.candidateSchema);
    expect(projectResponsePreflightDiagnostic({ ...diagnostic, version: "other" })).toBeNull();
    expect(projectResponsePreflightDiagnostic({ ...diagnostic, stage: "other" })).toBeNull();
    expect(projectResponsePreflightDiagnostic({ ...diagnostic, unknown: "body-canary" })).toBeNull();
    expect(projectResponsePreflightDiagnostic({ ...diagnostic, annotations: {} })).toBeNull();
    expect(projectResponsePreflightDiagnostic({ ...diagnostic, candidateSchema: {} })).toBeNull();
  });

  it("rejects accessors, toJSON hooks and unsafe objects without invoking them", () => {
    const getter = vi.fn(() => "response-preflight-v1");
    const input = Object.defineProperty({ ...diagnostic }, "version", { enumerable: true, get: getter });
    expect(projectResponsePreflightDiagnostic(input)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    const toJSON = vi.fn(() => diagnostic);
    expect(projectResponsePreflightDiagnostic({ ...diagnostic, toJSON })).toBeNull();
    expect(toJSON).not.toHaveBeenCalled();
    expect(projectResponsePreflightDiagnostic(Object.assign(Object.create(null), diagnostic))).toBeNull();
    const issues: unknown[] = [];
    Object.assign(issues, { privateBody: "canary" });
    expect(projectResponsePreflightDiagnostic({ ...diagnostic,
      candidateSchema: { outcome: "accepted", reason: null, issues, truncated: false } })).toBeNull();
  });

  it("allows independently unavailable subdiagnostics", () => {
    expect(projectResponsePreflightDiagnostic({ ...diagnostic, annotations: null, candidateSchema: null }))
      .toEqual({ ...diagnostic, annotations: null, candidateSchema: null });
  });

  it("enforces the 8192 UTF-8 byte serialized maximum", () => {
    const projector = vi.spyOn(resultDiagnosticModule, "projectValidationCandidateDiagnostic").mockReturnValue({
      outcome: "rejected", reason: "schema-rejected",
      issues: [{ path: "x".repeat(8_192), code: "other" }], truncated: false,
    });
    expect(projectResponsePreflightDiagnostic(diagnostic)).toBeNull();
    projector.mockRestore();
    expect(new TextEncoder().encode(JSON.stringify(diagnostic)).byteLength).toBeLessThanOrEqual(8_192);
  });
});
