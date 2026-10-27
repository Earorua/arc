import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { buildResearchQualityDiagnostic, projectResearchQualityDiagnostic, observeResearchQualityDiagnostic, type ResearchQualityDiagnosticInput } from "../../app/server/research/quality-diagnostic";

const input = (): ResearchQualityDiagnosticInput => ({ blueprintSchema: { success: true, issues: [] }, registrySchema: { success: true, issues: [] }, blueprintIssueCodes: [], registryIssueCodes: [], evidenceIssueCodes: [] });
const issue = (path: PropertyKey[], code = "custom") => ({ code, path, message: "SECRET-canary", input: "SECRET-canary" }) as unknown as z.core.$ZodIssue;
const blueprintPaths: [PropertyKey[], string][] = [[[], "root"], [["name"], "root"], [["skills"], "skill"], [["skills", 0, "masteryCriteria", 1], "skill"], [["resources", 1, "skillIds", 0], "resource"], [["phases", 0, "outcome"], "stage"]];
const templatePath = ["tracks", 0, "templates", 0];
const registryPaths: [PropertyKey[], string][] = [[[], "root"], [["blueprintVersion"], "root"], [["tracks", 0, "skillId"], "track"], [templatePath, "template"], [[...templatePath, "alternativeResourceIds", 0], "alternative-resource-ids"], [[...templatePath, "steps", 0, "minutes"], "step"], [[...templatePath, "checkpoints", 0, "estimatedMinutes"], "checkpoint"], [[...templatePath, "checkpoints", 0, "stepIds", 0], "checkpoint-step-ids"], [[...templatePath, "completionCriteria", 0], "completion-criteria"], [[...templatePath, "rubric", 0], "rubric"]];

describe("finite quality diagnostic", () => {
  it("builds fresh accepted own-data DTOs", () => {
    const value = buildResearchQualityDiagnostic(input())!;
    expect(value).toEqual({ version: "quality-diagnostic-v1", stage: "semantic-validation", blueprintSchema: { outcome: "accepted", issues: [], truncated: false }, registrySchema: { outcome: "accepted", issues: [], truncated: false }, blueprintIssueCodes: [], registryIssueCodes: [], evidenceIssueCodes: [] });
    const projected = projectResearchQualityDiagnostic(value)!;
    expect(projected).toEqual(value);
    expect(projected).not.toBe(value);
    expect(projected.blueprintSchema.issues).not.toBe(value.blueprintSchema.issues);
    expect(projected.evidenceIssueCodes).not.toBe(value.evidenceIssueCodes);
  });
  it.each(blueprintPaths)("maps blueprint path %j to %s", (path, scope) => {
    expect(buildResearchQualityDiagnostic({ ...input(), blueprintSchema: { success: false, issues: [issue(path)] } })?.blueprintSchema.issues).toEqual([{ scope, code: "other" }]);
  });
  it.each(registryPaths)("maps registry path %j to %s", (path, scope) => {
    expect(buildResearchQualityDiagnostic({ ...input(), registrySchema: { success: false, issues: [issue(path)] } })?.registrySchema.issues).toEqual([{ scope, code: "other" }]);
  });
  it.each(["invalid_type", "invalid_value", "invalid_format", "too_small", "too_big", "unrecognized_keys", "custom", "SECRET-canary"])("maps finite Zod code %s", code => {
    const result = buildResearchQualityDiagnostic({ ...input(), blueprintSchema: { success: false, issues: [issue([], code)] } })!;
    expect(result.blueprintSchema.issues).toEqual([{ scope: "root", code: ["custom", "SECRET-canary"].includes(code) ? "other" : code.replaceAll("_", "-") }]);
    expect(JSON.stringify(result)).not.toContain("SECRET-canary");
  });
  it.each(["SECRET-canary", "0", -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, Symbol("SECRET-canary")])("rejects untrusted array index %s", index => {
    for (const [key, path] of [["blueprintSchema", ["skills", index, "id"]], ["registrySchema", ["tracks", 0, "templates", index, "id"]]] as const) {
      expect(buildResearchQualityDiagnostic({ ...input(), [key]: { success: false, issues: [issue([...path])] } })?.[key].issues).toEqual([{ scope: "unknown", code: "other" }]);
    }
  });
  it.each([["skills", 0, "SECRET-canary"], ["resources", 0, "url", "host"], ["phases", 0, "skillIds", 0, "id"], ["tracks", 0, "templates", 0, "checkpoints", 0, "SECRET-canary"], ["tracks", 0, "templates", 0, "steps", "SECRET-canary"], ["__proto__"], ["toJSON"]])("never retains unknown path %j", (...path) => {
    for (const key of ["blueprintSchema", "registrySchema"] as const) {
      const result = buildResearchQualityDiagnostic({ ...input(), [key]: { success: false, issues: [issue(path)] } })!;
      expect(result[key].issues).toEqual([{ scope: "unknown", code: "other" }]);
      expect(JSON.stringify(result)).not.toContain("SECRET-canary");
    }
  });
  it.each([16, 17, 35])("uniques and sorts before capping %s schema pairs", count => {
    const all = [[], ["skills"], ["resources"], ["phases"], ["SECRET-canary"]].flatMap(path => ["invalid_type", "invalid_value", "invalid_format", "too_small", "too_big", "unrecognized_keys", "custom"].map(code => issue(path, code))).slice(0, count);
    const result = buildResearchQualityDiagnostic({ ...input(), blueprintSchema: { success: false, issues: [...all].reverse().concat(all) } })!;
    expect(result.blueprintSchema.issues).toHaveLength(Math.min(count, 16));
    expect(result.blueprintSchema.truncated).toBe(count > 16);
    const pairs = result.blueprintSchema.issues.map(({ scope, code }) => `${scope}/${code}`);
    expect(pairs).toEqual([...new Set(pairs)].sort());
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(8192);
    expect(projectResearchQualityDiagnostic(result)).toEqual(result);
  });
  it("deduplicates and sorts code allowlists", () => {
    const result = buildResearchQualityDiagnostic({ ...input(), blueprintIssueCodes: ["unplanned-skill", "duplicate-skill", "unplanned-skill"], registryIssueCodes: ["missing-kind", "duplicate-step", "missing-kind"], evidenceIssueCodes: ["missing-core-authority", "duplicate-evidence-id", "missing-core-authority"] });
    expect(result).toMatchObject({ blueprintIssueCodes: ["duplicate-skill", "unplanned-skill"], registryIssueCodes: ["duplicate-step", "missing-kind"], evidenceIssueCodes: ["duplicate-evidence-id", "missing-core-authority"] });
  });
  it("preserves all 13 blueprint, 10 registry and 9 evidence codes as finite sorted lists", () => {
    // Includes duplicate-track and registry-version-mismatch, which the current
    // candidate-to-registry construction cannot produce by itself.
    const blueprintIssueCodes = ["duplicate-skill", "duplicate-resource", "duplicate-phase", "duplicate-reference", "missing-prerequisite", "missing-resource", "resource-backlink-mismatch", "missing-resource-skill", "resource-forward-link-mismatch", "missing-phase-skill", "unplanned-skill", "prerequisite-cycle", "free-alternative-required"] as const;
    const registryIssueCodes = ["duplicate-track", "duplicate-template", "duplicate-step", "duplicate-checkpoint", "missing-skill", "missing-resource", "missing-kind", "minute-mismatch", "invalid-checkpoint", "registry-version-mismatch"] as const;
    const evidenceIssueCodes = ["duplicate-resource-url", "duplicate-stage-skill", "duplicate-evidence-id", "duplicate-evidence-pair", "missing-edge-endpoint", "invalid-evidence-link", "missing-skill-evidence", "missing-core-authority", "missing-free-alternative"] as const;
    const result = buildResearchQualityDiagnostic({ ...input(), blueprintIssueCodes: [...blueprintIssueCodes, ...blueprintIssueCodes], registryIssueCodes: [...registryIssueCodes, ...registryIssueCodes], evidenceIssueCodes: [...evidenceIssueCodes, ...evidenceIssueCodes] })!;
    expect(result.blueprintIssueCodes).toEqual([...blueprintIssueCodes].sort());
    expect(result.registryIssueCodes).toEqual([...registryIssueCodes].sort());
    expect(result.evidenceIssueCodes).toEqual([...evidenceIssueCodes].sort());
    expect([result.blueprintIssueCodes.length, result.registryIssueCodes.length, result.evidenceIssueCodes.length]).toEqual([13, 10, 9]);
    expect(projectResearchQualityDiagnostic(result)).toEqual(result);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(8192);
    for (const field of ["blueprintIssueCodes", "registryIssueCodes", "evidenceIssueCodes"] as const) {
      expect(projectResearchQualityDiagnostic({ ...result, [field]: ["SECRET-canary"] })).toBeNull();
    }
  });
  it("drops unknown enum inputs and builder exceptions", () => {
    expect(buildResearchQualityDiagnostic({ ...input(), evidenceIssueCodes: ["SECRET-canary"] } as unknown as ResearchQualityDiagnosticInput)).toBeNull();
    expect(buildResearchQualityDiagnostic(new Proxy(input(), { get() { throw Error("SECRET-canary"); } }))).toBeNull();
  });
  it.each([null, undefined, [], "SECRET-canary", Object.create(null)])("rejects non DTO %s", value => expect(projectResearchQualityDiagnostic(value)).toBeNull());
  it("rejects hostile descriptors and prototypes at every depth without running accessors", () => {
    const paths = [[], ["blueprintSchema"], ["registrySchema"], ["blueprintSchema", "issues", 0], ["registrySchema", "issues", 0]];
    const make = () => buildResearchQualityDiagnostic({ ...input(), blueprintSchema: { success: false, issues: [issue([])] }, registrySchema: { success: false, issues: [issue([])] } })!;
    for (const path of paths) for (const attack of ["getter", "toJSON", "symbol", "extra", "prototype", "hidden"]) {
      const value = make();
      const target = path.reduce((v, key) => (v as Record<PropertyKey, unknown>)[key], value as unknown) as object;
      const trap = vi.fn(() => { throw Error("SECRET-canary"); });
      if (attack === "prototype") Object.setPrototypeOf(target, { toJSON: trap });
      else if (attack === "symbol") Object.defineProperty(target, Symbol("SECRET-canary"), { value: true });
      else if (attack === "getter") Object.defineProperty(target, Object.keys(target)[0]!, { get: trap });
      else Object.defineProperty(target, attack, { value: attack === "toJSON" ? trap : "SECRET-canary", enumerable: attack !== "hidden" });
      expect(projectResearchQualityDiagnostic(value), `${path}/${attack}`).toBeNull();
      expect(trap).not.toHaveBeenCalled();
    }
  });
  it("rejects hostile arrays, sparse arrays, incorrect indices and array subclasses", () => {
    for (const field of ["blueprintIssueCodes", "registryIssueCodes", "evidenceIssueCodes", "issues"] as const) for (const attack of ["prototype", "extra", "symbol", "getter", "sparse", "wrong-index", "hidden-index", "subclass"]) {
      const value = buildResearchQualityDiagnostic({ ...input(), blueprintSchema: { success: false, issues: [issue([])] } })!;
      const parent = field === "issues" ? value.blueprintSchema : value;
      const arr: unknown[] = field === "issues" ? value.blueprintSchema.issues : value[field];
      const trap = vi.fn(() => { throw Error("SECRET-canary"); });
      if (attack === "prototype") Object.setPrototypeOf(arr, { toJSON: trap });
      if (attack === "extra") Object.defineProperty(arr, "toJSON", { value: trap });
      if (attack === "symbol") Object.defineProperty(arr, Symbol("SECRET-canary"), { value: true });
      if (attack === "getter") Object.defineProperty(arr, "0", { get: trap, enumerable: true });
      if (attack === "sparse") arr.length += 1;
      if (attack === "wrong-index") Object.defineProperty(arr, "01", { value: "SECRET-canary" });
      if (attack === "hidden-index") Object.defineProperty(arr, "0", { value: "other", enumerable: false });
      if (attack === "subclass") (parent as unknown as Record<string, unknown>)[field] = new (class extends Array {})();
      expect(projectResearchQualityDiagnostic(value), `${field}/${attack}`).toBeNull();
      expect(trap).not.toHaveBeenCalled();
    }
  });
  it("rejects inconsistent shapes, order, duplicates, capacity and revoked proxies", () => {
    const valid = buildResearchQualityDiagnostic(input())!;
    const invalid = [ { ...valid, version: "other" }, { ...valid, stage: "other" }, { ...valid, evidenceIssueCodes: ["invalid-graph"] }, { ...valid, evidenceIssueCodes: ["missing-core-authority", "duplicate-evidence-id"] }, { ...valid, evidenceIssueCodes: ["duplicate-evidence-id", "duplicate-evidence-id"] }, { ...valid, evidenceIssueCodes: Array(10).fill("duplicate-evidence-id") }, { ...valid, blueprintSchema: { outcome: "accepted", issues: [{ scope: "root", code: "other" }], truncated: false } }, { ...valid, blueprintSchema: { outcome: "accepted", issues: [], truncated: true } }, { ...valid, blueprintSchema: { outcome: "rejected", issues: [], truncated: false } }, { ...valid, registrySchema: { outcome: "rejected", issues: [{ scope: "skill", code: "other" }], truncated: false } }, { ...valid, blueprintSchema: { outcome: "rejected", issues: [{ scope: "root", code: "custom" }], truncated: false } }, { ...valid, blueprintSchema: { outcome: "rejected", issues: [{ scope: "root", code: "other" }], truncated: true } } ];
    for (const value of invalid) expect(projectResearchQualityDiagnostic(value)).toBeNull();
    const proxy = Proxy.revocable(valid, {}); proxy.revoke();
    expect(projectResearchQualityDiagnostic(proxy.proxy)).toBeNull();
  });
  it("stays dormant without observer and isolates pending, throwing and rejecting observers", async () => {
    const access = vi.fn(() => { throw Error("unexpected traversal"); });
    observeResearchQualityDiagnostic(new Proxy(input(), { get: access }));
    expect(access).not.toHaveBeenCalled();
    expect(() => observeResearchQualityDiagnostic(input(), () => { throw Error("SECRET-canary"); })).not.toThrow();
    expect(observeResearchQualityDiagnostic(input(), () => new Promise(() => {}))).toBeUndefined();
    observeResearchQualityDiagnostic(input(), () => Promise.reject(Error("SECRET-canary")));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});
