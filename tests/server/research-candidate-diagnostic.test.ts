// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { candidateFromContent } from "../../app/server/research/provider";
import * as diagnosticModule from "../../app/server/research/result-diagnostic";
import { buildResearchCandidateDiagnostic, projectValidationCandidateDiagnostic,
  type ResearchCandidateDiagnostic } from "../../app/server/research/result-diagnostic";
import { validResearchCandidate } from "../fixtures/research/valid-candidate";

function capture(content: string) {
  const diagnostics: ResearchCandidateDiagnostic[] = [];
  const result = candidateFromContent(content, (diagnostic) => diagnostics.push(diagnostic));
  return { diagnostics, result };
}

describe("research candidate diagnostics", () => {
  it("reports a bounded schema rejection for a missing required field", () => {
    const candidate = structuredClone(validResearchCandidate) as Record<string, unknown>;
    delete candidate.evidence;
    const observer = vi.fn();
    const parse = candidateFromContent as unknown as
      (content: string, onDiagnostic?: (diagnostic: unknown) => unknown) => unknown;

    expect(parse(JSON.stringify(candidate), observer)).toBeNull();
    expect(observer).toHaveBeenCalledOnce();
    expect(observer).toHaveBeenCalledWith({
      outcome: "rejected",
      reason: "schema-rejected",
      issues: [{ path: "evidence", code: "invalid-type" }],
      truncated: false,
    });
  });

  it.each([
    ["content-limit", "x".repeat(196_609)],
    ["json-syntax", "{"],
    ["node-limit", JSON.stringify(Array.from({ length: 4_096 }, () => [0, 0, 0, 0, 0, 0]))],
    ["depth-limit", JSON.stringify([[[[[[[[[[[[[0]]]]]]]]]]]]])],
    ["string-limit", JSON.stringify("x".repeat(8_193))],
    ["array-limit", JSON.stringify(Array(4_097).fill(0))],
    ["object-limit", JSON.stringify(Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`k${index}`, 0])))],
  ] as const)("reports the %s parser bound without schema details", (reason, content) => {
    expect(capture(content)).toEqual({
      result: null,
      diagnostics: [{ outcome: "rejected", reason, issues: [], truncated: false }],
    });
  });

  it("reports acceptance without changing the parsed candidate", () => {
    const content = JSON.stringify(validResearchCandidate);
    const { result, diagnostics } = capture(content);
    expect(result).toEqual(validResearchCandidate);
    expect(diagnostics).toEqual([{ outcome: "accepted", reason: null, issues: [], truncated: false }]);
  });

  it.each([
    ["missing field", (candidate: Record<string, unknown>) => { delete candidate.evidence; },
      [{ path: "evidence", code: "invalid-type" }]],
    ["numeric string", (candidate: Record<string, unknown>) => {
      ((candidate.stages as Array<Record<string, unknown>>)[0]!).weeks = "3";
    }, [{ path: "stages[].weeks", code: "invalid-type" }]],
    ["enum", (candidate: Record<string, unknown>) => {
      ((candidate.skills as Array<Record<string, unknown>>)[0]!).importance = "secret";
    }, [{ path: "skills[].importance", code: "invalid-value" }]],
    ["length", (candidate: Record<string, unknown>) => {
      ((candidate.role as Record<string, unknown>)).summary = "short";
    }, [{ path: "role.summary", code: "too-small" }]],
    ["maximum length", (candidate: Record<string, unknown>) => {
      ((candidate.role as Record<string, unknown>)).summary = "x".repeat(501);
    }, [{ path: "role.summary", code: "too-big" }]],
    ["format", (candidate: Record<string, unknown>) => {
      ((candidate.role as Record<string, unknown>)).id = "CANARY_INVALID_ID";
    }, [{ path: "role.id", code: "invalid-format" }]],
    ["nested unknown key", (candidate: Record<string, unknown>) => {
      ((candidate.unitTemplates as Array<Record<string, unknown>>)[0]!).privateBody = "CANARY-private-body";
    }, [{ path: "unitTemplates[]", code: "unrecognized-keys" }]],
  ] as const)("projects %s failures through trusted schema paths", (_name, mutate, issues) => {
    const candidate = structuredClone(validResearchCandidate) as unknown as Record<string, unknown>;
    mutate(candidate);
    const diagnostic = capture(JSON.stringify(candidate)).diagnostics[0];
    expect(diagnostic).toEqual({ outcome: "rejected", reason: "schema-rejected", issues, truncated: false });
    expect(JSON.stringify(diagnostic)).not.toContain("CANARY");
  });

  it("projects wildcard paths for deeply nested array fields", () => {
    const candidate = structuredClone(validResearchCandidate) as unknown as Record<string, unknown>;
    const unit = (candidate.unitTemplates as Array<Record<string, unknown>>)[0]!;
    ((unit.steps as Array<Record<string, unknown>>)[0]!).minutes = "60";
    expect(capture(JSON.stringify(candidate)).diagnostics[0]?.issues).toEqual([
      { path: "unitTemplates[].steps[].minutes", code: "invalid-type" },
    ]);
  });

  it("keeps trim and astral string boundary rejections unchanged", () => {
    for (const name of ["A ", "😀".repeat(61)]) {
      const candidate = structuredClone(validResearchCandidate) as unknown as Record<string, unknown>;
      (candidate.role as Record<string, unknown>).name = name;
      expect(capture(JSON.stringify(candidate))).toMatchObject({ result: null,
        diagnostics: [{ reason: "schema-rejected" }] });
    }
  });

  it("maps unknown paths and issue codes to bounded fallback values", () => {
    const issues = [
      { code: "future_code", path: ["skills", 0, "privateBody", "secret"] },
      { code: "invalid_type", path: ["notInSchema", "secret"] },
      { code: "invalid_type", path: ["skills", 0, "name"] },
      { code: "invalid_type", path: ["skills", 0, "name"] },
    ] as never;
    expect(buildResearchCandidateDiagnostic("schema-rejected", issues)).toEqual({
      outcome: "rejected",
      reason: "schema-rejected",
      issues: [
        { path: "$", code: "invalid-type" },
        { path: "skills[]", code: "other" },
        { path: "skills[].name", code: "invalid-type" },
      ],
      truncated: false,
    });
  });

  it("does not accept folded path segments or prototype issue codes", () => {
    const diagnostic = buildResearchCandidateDiagnostic("schema-rejected", [
      { code: "constructor", path: ["role.name"] },
      { code: "toString", path: ["unitTemplates[].steps[].minutes"] },
    ] as never);
    expect(diagnostic).toEqual({
      outcome: "rejected",
      reason: "schema-rejected",
      issues: [{ path: "$", code: "other" }],
      truncated: false,
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "stops at the nearest trusted parent for a non-JSON array index %s",
    (index) => {
      expect(buildResearchCandidateDiagnostic("schema-rejected", [
        { code: "invalid_type", path: ["skills", index, "name"] },
      ] as never).issues).toEqual([{ path: "skills", code: "invalid-type" }]);
    },
  );

  it("sorts, deduplicates, and caps schema issues at sixteen", () => {
    const paths = ["role", "role.id", "role.name", "role.summary", "skills", "skills[]", "skills[].id",
      "skills[].name", "skills[].category", "skills[].importance", "skills[].why", "skills[].masteryCriteria",
      "skills[].masteryCriteria[]", "skills[].resourceIds", "skills[].resourceIds[]", "prerequisiteEdges",
      "prerequisiteEdges[]", "prerequisiteEdges[].skillId"];
    const issues = paths.flatMap((path) => [
      { code: "invalid_type", path: path.replaceAll("[]", ".0").split(".").map((part) => /^\d+$/u.test(part) ? Number(part) : part) },
      { code: "invalid_type", path: path.replaceAll("[]", ".0").split(".").map((part) => /^\d+$/u.test(part) ? Number(part) : part) },
    ]) as never;
    const diagnostic = buildResearchCandidateDiagnostic("schema-rejected", issues);
    expect(diagnostic.issues).toHaveLength(16);
    expect(diagnostic.truncated).toBe(true);
    expect(diagnostic.issues).toEqual([...diagnostic.issues].sort((left, right) =>
      left.path.localeCompare(right.path) || left.code.localeCompare(right.code)));
  });

  it("strictly projects diagnostics into fresh bounded values", () => {
    const input = { outcome: "rejected", reason: "schema-rejected",
      issues: [{ path: "evidence", code: "invalid-type" }], truncated: false };
    const first = projectValidationCandidateDiagnostic(input)!;
    const second = projectValidationCandidateDiagnostic(input)!;
    expect(first).toEqual(input);
    expect(first).not.toBe(input);
    expect(first.issues).not.toBe(input.issues);
    expect(first.issues[0]).not.toBe(input.issues[0]);
    first.issues[0]!.path = "$";
    expect(second.issues[0]!.path).toBe("evidence");
  });

  it.each([
    { outcome: "accepted", reason: "schema-rejected", issues: [], truncated: false },
    { outcome: "rejected", reason: null, issues: [], truncated: false },
    { outcome: "rejected", reason: "json-syntax", issues: [{ path: "$", code: "other" }], truncated: false },
    { outcome: "rejected", reason: "json-syntax", issues: [], truncated: true },
    { outcome: "rejected", reason: "schema-rejected", issues: [], truncated: true },
    { outcome: "rejected", reason: "schema-rejected", issues: [{ path: "secret", code: "invalid-type" }], truncated: false },
    { outcome: "rejected", reason: "schema-rejected", issues: [{ path: "$", code: "future-code" }], truncated: false },
  ])("rejects inconsistent or untrusted projected diagnostics", (input) => {
    expect(projectValidationCandidateDiagnostic(input)).toBeNull();
  });

  it("rejects unsorted, duplicate, and over-cap projected issue arrays before hostile element access", () => {
    const base = { outcome: "rejected", reason: "schema-rejected", truncated: false } as const;
    expect(projectValidationCandidateDiagnostic({ ...base, issues: [
      { path: "evidence", code: "invalid-type" }, { path: "$", code: "invalid-type" },
    ] })).toBeNull();
    expect(projectValidationCandidateDiagnostic({ ...base, issues: [
      { path: "$", code: "invalid-type" }, { path: "$", code: "invalid-type" },
    ] })).toBeNull();

    const overCap = Array(17).fill(null);
    Object.defineProperty(overCap, "0", { get: () => { throw new Error("CANARY-secret"); } });
    expect(projectValidationCandidateDiagnostic({ ...base, issues: overCap })).toBeNull();
  });

  it("returns null for hostile projection accessors", () => {
    const input = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(input, "issues", { enumerable: true, get: () => { throw new Error("CANARY-secret"); } });
    expect(projectValidationCandidateDiagnostic(input)).toBeNull();
  });

  it("isolates throwing and rejected observers from accepted and rejected results", async () => {
    const content = JSON.stringify(validResearchCandidate);
    expect(candidateFromContent(content, () => { throw new Error("observer"); })).toEqual(validResearchCandidate);
    expect(candidateFromContent("{", () => Promise.reject(new Error("observer")))).toBeNull();
    await Promise.resolve();
  });

  it("keeps parsing behavior when no observer is provided", () => {
    const build = vi.spyOn(diagnosticModule, "buildResearchCandidateDiagnostic");
    try {
      expect(candidateFromContent(JSON.stringify(validResearchCandidate))).toEqual(validResearchCandidate);
      expect(candidateFromContent("{")).toBeNull();
      expect(build).not.toHaveBeenCalled();
    } finally { build.mockRestore(); }
  });

  it("isolates diagnostic construction failures from parsing outcomes", () => {
    const build = vi.spyOn(diagnosticModule, "buildResearchCandidateDiagnostic").mockImplementation(() => {
      throw new Error("CANARY-construction");
    });
    const observer = vi.fn();
    try {
      expect(candidateFromContent(JSON.stringify(validResearchCandidate), observer)).toEqual(validResearchCandidate);
      expect(candidateFromContent("{", observer)).toBeNull();
      expect(observer).not.toHaveBeenCalled();
    } finally { build.mockRestore(); }
  });
});
