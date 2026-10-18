// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildAnnotationDiagnostic, projectAnnotationDiagnostic,
  type AnnotationDiagnostic } from "../../app/server/research/annotation-diagnostic";

const issue = (index: number | null, code: string) => ({ index, code });
const nested = (url: unknown, titleMarker: unknown = undefined) => ({
  type: "url_citation",
  url_citation: titleMarker === undefined ? { url } : { url, title: titleMarker },
});

describe("annotation preflight diagnostic", () => {
  it.each([
    [undefined, "missing"], [null, "null"],
  ] as const)("treats the %s container as the compatible empty adapter input", (input, container) => {
    expect(buildAnnotationDiagnostic(input)).toEqual({ state: "compatible", container, count: 0,
      recognizedCount: 0, ignoredCount: 0, issues: [], truncated: false });
  });

  it("classifies a non-array container without inspecting its fields", () => {
    const getter = vi.fn(() => "secret");
    const input = Object.defineProperty({}, "canary", { enumerable: true, get: getter });
    expect(buildAnnotationDiagnostic(input)).toEqual({ state: "incompatible", container: "other", count: null,
      recognizedCount: null, ignoredCount: null, issues: [issue(null, "container-not-array")], truncated: false });
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    ["flat citation", { type: "url_citation", url: "https://example.com", title: "Example" }, "flat-citation-unsupported"],
    ["missing nested citation", { type: "url_citation" }, "citation-object-missing"],
    ["null nested citation", { type: "url_citation", url_citation: null }, "citation-object-invalid"],
    ["blank URL", nested(" ", "Title"), "url-blank"],
    ["overlong URL", nested("x".repeat(2_049), "Title"), "url-too-long"],
    ["null title", nested("https://example.com", null), "title-null"],
    ["blank title", nested("https://example.com", " "), "title-blank"],
    ["overlong title", nested("https://example.com", "x".repeat(501)), "title-too-long"],
    ["private fallback URL", nested("https://127.0.0.1/private"), "fallback-url-policy"],
  ] as const)("classifies %s", (_name, input, code) => {
    expect(buildAnnotationDiagnostic([input])).toMatchObject({ state: "incompatible", container: "array", count: 1,
      recognizedCount: 1, ignoredCount: 0, issues: [issue(0, code)], truncated: false });
  });

  it.each([
    ["missing URL", { type: "url_citation", url_citation: { title: "Title" } }, "url-missing"],
    ["null URL", nested(null, "Title"), "url-null"],
    ["non-string URL", nested(42, "Title"), "url-not-string"],
    ["non-string title", nested("https://example.com", 42), "title-not-string"],
  ] as const)("classifies %s", (_name, input, code) => {
    expect(buildAnnotationDiagnostic([input])?.issues).toEqual([issue(0, code)]);
  });

  it("matches trimmed min/max and UTF-16 string length semantics", () => {
    expect(buildAnnotationDiagnostic([nested(`  ${"x".repeat(2_048)}  `, `  ${"😀".repeat(250)}  `)]))
      .toMatchObject({ state: "compatible", issues: [] });
    expect(buildAnnotationDiagnostic([nested(`${"x".repeat(2_049)}`, "Title")])?.issues)
      .toEqual([issue(0, "url-too-long")]);
    expect(buildAnnotationDiagnostic([nested("https://example.com", "😀".repeat(251))])?.issues)
      .toEqual([issue(0, "title-too-long")]);
  });

  it("accepts missing and valid titles while retaining later URL security authority for supplied titles", () => {
    expect(buildAnnotationDiagnostic([nested("https://example.com/path")])?.state).toBe("compatible");
    expect(buildAnnotationDiagnostic([nested("https://127.0.0.1/private", "Private reference")])?.state).toBe("compatible");
    expect(buildAnnotationDiagnostic([nested(" https://example.com/path ", " Valid title ")])?.state).toBe("compatible");
  });

  it("counts empty, ignored and 256-entry arrays and does not inspect entry 257", () => {
    expect(buildAnnotationDiagnostic([])).toMatchObject({ count: 0, recognizedCount: 0, ignoredCount: 0 });
    expect(buildAnnotationDiagnostic([null, 7, { type: "other" }])).toMatchObject({ state: "compatible",
      count: 3, recognizedCount: 0, ignoredCount: 3 });
    const boundary = [nested("https://example.com"), ...Array.from({ length: 255 }, () => ({ type: "other" }))];
    expect(buildAnnotationDiagnostic(boundary)).toMatchObject({ state: "compatible", count: 256,
      recognizedCount: 1, ignoredCount: 255 });
    const getter = vi.fn(() => nested("https://example.com"));
    const over = [...boundary, undefined];
    Object.defineProperty(over, "256", { enumerable: true, configurable: true, get: getter });
    expect(buildAnnotationDiagnostic(over)).toEqual({ state: "incompatible", container: "array", count: 257,
      recognizedCount: null, ignoredCount: null, issues: [issue(null, "annotation-count-limit")], truncated: false });
    expect(getter).not.toHaveBeenCalled();
  });

  it("collects independent fields, sorts, deduplicates and reports truncation only for extra unique issues", () => {
    const twoFields = buildAnnotationDiagnostic([nested(null, null)]);
    expect(twoFields?.issues).toEqual([issue(0, "url-null"), issue(0, "title-null")]);
    const many = Array.from({ length: 9 }, () => nested(null, null));
    expect(buildAnnotationDiagnostic(many)).toMatchObject({
      issues: Array.from({ length: 8 }, (_, index) => [issue(index, "url-null"), issue(index, "title-null")]).flat(),
      truncated: true,
    });
  });

  it("never reads URL, title, foreign fields, accessors or coercion hooks", () => {
    const getter = vi.fn(() => "sensitive");
    const toJSON = vi.fn(() => ({ sensitive: true }));
    const annotation = { type: "url_citation", url_citation: { url: "https://example.com", title: "Title", toJSON },
      privateBody: "body-canary" };
    Object.defineProperty(annotation, "foreign", { enumerable: true, get: getter });
    const diagnostic = buildAnnotationDiagnostic([annotation]);
    expect(JSON.stringify(diagnostic)).not.toMatch(/example\.com|Title|body-canary|sensitive/u);
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });
});

describe("annotation diagnostic projector", () => {
  const compatible: AnnotationDiagnostic = { state: "compatible", container: "array", count: 0,
    recognizedCount: 0, ignoredCount: 0, issues: [], truncated: false };

  it("returns fresh metadata and rejects unknown keys or inconsistent state/counts/issues", () => {
    const first = projectAnnotationDiagnostic(compatible)!;
    const second = projectAnnotationDiagnostic(compatible)!;
    expect(first).toEqual(compatible);
    expect(first).not.toBe(compatible);
    expect(first).not.toBe(second);
    expect(first.issues).not.toBe(compatible.issues);
    expect(projectAnnotationDiagnostic({ ...compatible, unknown: "canary" })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...compatible, state: "incompatible" })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...compatible, recognizedCount: 1 })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...compatible, issues: [issue(0, "title-null")] })).toBeNull();
  });

  it("rejects malformed enums, ordering, duplicates, indexes, issue caps and truncation", () => {
    const base = { ...compatible, state: "incompatible", count: 1, recognizedCount: 1, ignoredCount: 0 };
    expect(projectAnnotationDiagnostic({ ...base, issues: [issue(0, "unknown")] })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...base, issues: [issue(0, "title-null"), issue(0, "url-null")] })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...base, issues: [issue(0, "title-null"), issue(0, "title-null")] })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...base, issues: [issue(1, "title-null")] })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...base, recognizedCount: 0, ignoredCount: 1,
      issues: [issue(0, "title-null")] })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...base, count: 2, recognizedCount: 1, ignoredCount: 1,
      issues: [issue(0, "title-null"), issue(1, "title-null")] })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...base, issues: Array.from({ length: 17 }, () => issue(0, "title-null")) })).toBeNull();
    expect(projectAnnotationDiagnostic({ ...base, issues: [issue(0, "title-null")], truncated: true })).toBeNull();
  });

  it.each([
    ["two URL categories", [issue(0, "url-null"), issue(0, "url-blank")]],
    ["structural and child categories", [issue(0, "citation-object-missing"), issue(0, "url-missing")]],
    ["two title categories", [issue(0, "title-null"), issue(0, "title-blank")]],
    ["fallback and another category", [issue(0, "url-null"), issue(0, "fallback-url-policy")]],
  ])("rejects contradictory per-index metadata: %s", (_name, issues) => {
    expect(projectAnnotationDiagnostic({ state: "incompatible", container: "array", count: 1,
      recognizedCount: 1, ignoredCount: 0, issues, truncated: false })).toBeNull();
  });

  it("rejects truncated metadata when eight two-field entries exhaust all possible issues", () => {
    const issues = Array.from({ length: 8 }, (_, index) => [issue(index, "url-null"), issue(index, "title-null")]).flat();
    expect(projectAnnotationDiagnostic({ state: "incompatible", container: "array", count: 8,
      recognizedCount: 8, ignoredCount: 0, issues, truncated: true })).toBeNull();
  });

  it("accepts a truncated prefix when an ending URL can have a title or a later recognized index can have an issue", () => {
    const firstSevenPairs = Array.from({ length: 7 }, (_, index) =>
      [issue(index, "url-null"), issue(index, "title-null")]).flat();
    const endingUrlPrefix = [...firstSevenPairs, issue(7, "fallback-url-policy"), issue(8, "url-null")];
    expect(projectAnnotationDiagnostic({ state: "incompatible", container: "array", count: 9,
      recognizedCount: 9, ignoredCount: 0, issues: endingUrlPrefix, truncated: true })).not.toBeNull();

    const exhaustedEight = Array.from({ length: 8 }, (_, index) =>
      [issue(index, "url-null"), issue(index, "title-null")]).flat();
    expect(projectAnnotationDiagnostic({ state: "incompatible", container: "array", count: 9,
      recognizedCount: 9, ignoredCount: 0, issues: exhaustedEight, truncated: true })).not.toBeNull();
  });

  it("rejects getters, toJSON hooks and unsafe objects without invoking them", () => {
    const getter = vi.fn(() => "compatible");
    const input = Object.defineProperty({ ...compatible }, "state", { enumerable: true, get: getter });
    expect(projectAnnotationDiagnostic(input)).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    const toJSON = vi.fn(() => compatible);
    expect(projectAnnotationDiagnostic({ ...compatible, toJSON })).toBeNull();
    expect(toJSON).not.toHaveBeenCalled();
    expect(projectAnnotationDiagnostic(Object.assign(Object.create(null), compatible))).toBeNull();
  });

  it("rejects an accessor issue index without invoking it", () => {
    const getter = vi.fn(() => issue(0, "title-null"));
    const issues: unknown[] = [undefined];
    Object.defineProperty(issues, "0", { enumerable: true, configurable: true, get: getter });
    expect(projectAnnotationDiagnostic({ ...compatible, state: "incompatible", count: 1,
      recognizedCount: 1, ignoredCount: 0, issues })).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects foreign issue-array keys", () => {
    const issues: unknown[] = [];
    Object.assign(issues, { privateBody: "canary" });
    expect(projectAnnotationDiagnostic({ ...compatible, issues })).toBeNull();
  });
});
