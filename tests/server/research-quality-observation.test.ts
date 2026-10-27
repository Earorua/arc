import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { roleBlueprintSchema } from "../../app/contracts/intelligence";
import { unitRegistrySchema } from "../../app/contracts/planning";
import { researchCandidateSchema, researchPackageSchema, type ResearchCandidate, type ResearchIssueCode } from "../../app/contracts/research";
import * as blueprintValidator from "../../app/lib/intelligence-validation";
import * as registryValidator from "../../app/lib/planning/registry-validation";
import * as diagnosticModule from "../../app/server/research/quality-diagnostic";
import type { ResearchQualityDiagnostic, ResearchQualityDiagnosticObserver } from "../../app/server/research/quality-diagnostic";
import { validateResearchCandidate, ResearchValidationContextError, type ResearchValidationContext } from "../../app/server/research/package-validator";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const context: ResearchValidationContext = {
  packageId: "research-package-1", blueprintVersion: "2026.08.1", registryVersion: "2026.08.2", templateVersion: "2026.08.3",
  promptVersion: "research-prompt-v1", inputSchemaVersion: "research-input-v1", outputSchemaVersion: "research-output-v1",
  qualityVersion: "research-quality-v1", modelConfigVersion: "research-model-config-v1", observedAt: "2026-08-27", expiresAt: "2026-09-26",
};
const fresh = () => researchCandidateSchema.parse(validResearchCandidate);
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw Error("Offline synthetic tests only"); })));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function check(candidate: ResearchCandidate, expected: ResearchIssueCode[]) {
  const original = structuredClone(candidate);
  expect(researchCandidateSchema.safeParse(candidate).success).toBe(true);
  const baseline = validateResearchCandidate(candidate, validAnnotations, context);
  const seen: ResearchQualityDiagnostic[] = [];
  const observed = validateResearchCandidate(candidate, validAnnotations, context, { onQualityDiagnostic: value => seen.push(value) });
  expect(observed).toEqual(baseline);
  expect(candidate).toEqual(original);
  expect(observed.ready).toBe(expected.length === 0);
  expect(observed.quality.issueCodes).toEqual(expected);
  expect(observed.quality.passed).toBe(expected.length === 0);
  expect(seen).toHaveLength(1);
  expect(globalThis.fetch).not.toHaveBeenCalled();
  return seen[0]!;
}
function setMinutes(unit: ResearchCandidate["unitTemplates"][number], minutes: number[], checkpoints: boolean) {
  unit.steps = minutes.map((value, index) => ({ id: `${unit.id}-step-${index}`, label: "Apply and review the authored exercise", minutes: value }));
  unit.estimatedMinutes = minutes.reduce((sum, value) => sum + value, 0);
  unit.checkpoints = checkpoints ? unit.steps.map((step, index) => ({ id: `${unit.id}-checkpoint-${index}`, label: "Review the exercise evidence", stepIds: [step.id], estimatedMinutes: step.minutes })) : [];
}

describe("semantic quality observation", () => {
  it("observes the real golden validation once without changing its Ready package", () => {
    const seen: unknown[] = [];
    const baseline = validateResearchCandidate(validResearchCandidate, validAnnotations, context);
    const observed = validateResearchCandidate(validResearchCandidate, validAnnotations, context, { onQualityDiagnostic: (value: unknown) => seen.push(value) });
    expect(baseline.ready).toBe(true);
    expect(baseline.quality).toEqual({ passed: true, issueCodes: [], skillCount: 3, sourceCount: 6, unitCount: 9, observedAt: context.observedAt });
    expect(observed).toEqual(baseline);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ version: "quality-diagnostic-v1", stage: "semantic-validation",
      blueprintSchema: { outcome: "accepted", issues: [], truncated: false },
      registrySchema: { outcome: "accepted", issues: [], truncated: false },
      blueprintIssueCodes: [], registryIssueCodes: [], evidenceIssueCodes: [],
    });
  });

  const investigation: { name: string; mutate: (value: ResearchCandidate) => void; expected: ResearchIssueCode[]; diagnostic: Partial<ResearchQualityDiagnostic> }[] = [
    { name: "golden", mutate: () => {}, expected: [], diagnostic: { blueprintIssueCodes: [], registryIssueCodes: [], evidenceIssueCodes: [] } },
    { name: "resource-forward-link-mismatch", mutate: v => { v.resources[0]!.skillIds.push(v.skills[1]!.id); }, expected: ["invalid-graph"], diagnostic: { blueprintIssueCodes: ["resource-forward-link-mismatch"] } },
    { name: "skill-in-two-stages", mutate: v => { v.stages[1]!.skillIds.push(v.skills[0]!.id); }, expected: ["invalid-graph"], diagnostic: { evidenceIssueCodes: ["duplicate-stage-skill"] } },
    { name: "duplicate-evidence-pair", mutate: v => { v.evidence.push({ ...v.evidence[0]!, id: "extra-evidence-pair" }); }, expected: ["invalid-graph"], diagnostic: { evidenceIssueCodes: ["duplicate-evidence-pair"] } },
    { name: "authority-resource-not-valid-evidence", mutate: v => { v.resources[0]!.sourceTier = "practitioner"; v.resources[1]!.sourceTier = "institutional"; v.evidence = v.evidence.filter(e => e.resourceId !== v.resources[1]!.id); }, expected: ["missing-core-authority"], diagnostic: { evidenceIssueCodes: ["missing-core-authority"] } },
    { name: "step-id-reused-across-templates", mutate: v => { const old = v.unitTemplates[1]!.steps[0]!.id; const next = v.unitTemplates[0]!.steps[0]!.id; v.unitTemplates[1]!.steps[0]!.id = next; v.unitTemplates[1]!.checkpoints.forEach(c => { c.stepIds = c.stepIds.map(id => id === old ? next : id); }); }, expected: ["invalid-registry"], diagnostic: { registryIssueCodes: ["duplicate-step"] } },
    { name: "long-unit-missing-checkpoints", mutate: v => { v.unitTemplates[0]!.checkpoints = []; }, expected: ["invalid-registry"], diagnostic: { registryIssueCodes: ["invalid-checkpoint"] } },
    { name: "short-unit-has-checkpoint", mutate: v => setMinutes(v.unitTemplates[0]!, [30], true), expected: ["invalid-registry"], diagnostic: { registryIssueCodes: ["invalid-checkpoint"] } },
    { name: "checkpoint-outside-30-to-60-with-matching-totals", mutate: v => setMinutes(v.unitTemplates[0]!, [20, 70], true), expected: ["invalid-registry"], diagnostic: { registryIssueCodes: ["invalid-checkpoint"] } },
    { name: "primary-resource-repeated-as-alternative", mutate: v => { v.unitTemplates[0]!.alternativeResourceIds.push(v.unitTemplates[0]!.primaryResourceId); }, expected: ["invalid-registry"], diagnostic: { registrySchema: { outcome: "rejected", issues: [{ scope: "alternative-resource-ids", code: "other" }], truncated: false }, registryIssueCodes: [] } },
  ];
  it.each(investigation)("preserves investigated outcome: $name", ({ mutate, expected, diagnostic }) => {
    const candidate = fresh(); mutate(candidate);
    expect(check(candidate, expected)).toMatchObject(diagnostic);
  });

  it("observes all four simultaneous duplicates without the dormant OR masking later categories", () => {
    const value = fresh();
    value.resources[1]!.url = value.resources[0]!.url;
    value.resources[1]!.provider = value.resources[0]!.provider;
    value.stages[1]!.skillIds.push(value.skills[0]!.id);
    value.evidence.push({ ...value.evidence[0]! });
    expect(check(value, ["invalid-graph"]).evidenceIssueCodes).toEqual(["duplicate-evidence-id", "duplicate-evidence-pair", "duplicate-resource-url", "duplicate-stage-skill"]);
  });
  it("observes missing endpoints, invalid evidence, missing coverage and authority independently", () => {
    const value = fresh();
    value.prerequisiteEdges.push({ skillId: "missing-skill-canary", prerequisiteSkillId: value.skills[0]!.id });
    value.evidence = value.evidence.filter(e => e.skillId !== value.skills[0]!.id);
    value.evidence.push({ id: "missing-evidence-canary", skillId: value.skills[0]!.id, resourceId: "missing-resource-canary" });
    const diagnostic = check(value, ["invalid-graph", "missing-core-authority", "missing-skill-source"]);
    expect(diagnostic.evidenceIssueCodes).toEqual(["invalid-evidence-link", "missing-core-authority", "missing-edge-endpoint", "missing-skill-evidence"]);
    expect(JSON.stringify(diagnostic)).not.toContain("canary");
  });
  it("observes the two independent existing free-alternative gates", () => {
    const blueprintOnly = fresh();
    blueprintOnly.resources[0]!.cost = "paid";
    blueprintOnly.resources[1]!.purpose = "reference";
    expect(check(blueprintOnly, ["missing-free-alternative"])).toMatchObject({ blueprintIssueCodes: ["free-alternative-required"], evidenceIssueCodes: [] });
    const templateOnly = fresh();
    templateOnly.resources[0]!.cost = "mixed";
    templateOnly.unitTemplates[0]!.alternativeResourceIds = [];
    expect(check(templateOnly, ["missing-free-alternative"])).toMatchObject({ blueprintIssueCodes: [], evidenceIssueCodes: ["missing-free-alternative"] });
  });

  const graphCases: { code: blueprintValidator.IntelligenceIssueCode; mutate: (value: ResearchCandidate) => void; expected: ResearchIssueCode[] }[] = [
    { code: "duplicate-skill", mutate: v => { v.skills.push({ ...v.skills[0]! }); }, expected: ["invalid-graph"] },
    { code: "duplicate-resource", mutate: v => { v.resources.push({ ...v.resources[0]! }); }, expected: ["invalid-graph"] },
    { code: "duplicate-phase", mutate: v => { v.stages[1]!.id = v.stages[0]!.id; }, expected: ["invalid-graph"] },
    { code: "duplicate-reference", mutate: v => { v.skills[0]!.resourceIds.push(v.skills[0]!.resourceIds[0]!); }, expected: ["invalid-graph"] },
    { code: "missing-prerequisite", mutate: v => { v.prerequisiteEdges.push({ skillId: v.skills[0]!.id, prerequisiteSkillId: "absent" }); }, expected: ["invalid-graph"] },
    { code: "missing-resource", mutate: v => { v.skills[0]!.resourceIds.push("absent"); }, expected: ["invalid-graph"] },
    { code: "resource-backlink-mismatch", mutate: v => { v.skills[0]!.resourceIds.push(v.resources[2]!.id); }, expected: ["invalid-graph"] },
    { code: "missing-resource-skill", mutate: v => { v.resources[0]!.skillIds.push("absent"); }, expected: ["invalid-graph"] },
    { code: "missing-phase-skill", mutate: v => { v.stages[0]!.skillIds.push("absent"); }, expected: ["invalid-graph"] },
    { code: "unplanned-skill", mutate: v => { v.stages = v.stages.filter(s => !s.skillIds.includes(v.skills[0]!.id)); }, expected: ["invalid-graph"] },
    { code: "prerequisite-cycle", mutate: v => { v.prerequisiteEdges.push({ skillId: v.skills[0]!.id, prerequisiteSkillId: v.skills[2]!.id }); }, expected: ["invalid-graph"] },
  ];
  it.each(graphCases)("keeps blueprint rejection $code", ({ code, mutate, expected }) => {
    const value = fresh(); mutate(value);
    expect(check(value, expected).blueprintIssueCodes).toContain(code);
  });

  const registryCases: { code: registryValidator.RegistryIssueCode; mutate: (value: ResearchCandidate) => void; expected: ResearchIssueCode[] }[] = [
    { code: "duplicate-template", mutate: v => { v.unitTemplates.push({ ...v.unitTemplates[0]! }); }, expected: ["invalid-registry"] },
    { code: "duplicate-checkpoint", mutate: v => { v.unitTemplates[1]!.checkpoints[0]!.id = v.unitTemplates[0]!.checkpoints[0]!.id; }, expected: ["invalid-registry"] },
    { code: "missing-skill", mutate: v => { v.unitTemplates[0]!.skillId = "absent"; }, expected: ["invalid-registry", "missing-unit"] },
    { code: "missing-resource", mutate: v => { v.unitTemplates[0]!.primaryResourceId = "absent"; }, expected: ["invalid-registry"] },
    { code: "missing-kind", mutate: v => { v.unitTemplates = v.unitTemplates.filter(t => !(t.skillId === v.skills[0]!.id && t.kind === "calibrate")); }, expected: ["invalid-registry", "missing-unit"] },
    { code: "minute-mismatch", mutate: v => { v.unitTemplates[3]!.estimatedMinutes = 59; }, expected: ["invalid-registry", "minute-mismatch"] },
  ];
  it.each(registryCases)("keeps registry rejection $code", ({ code, mutate, expected }) => {
    const value = fresh(); mutate(value);
    expect(check(value, expected).registryIssueCodes).toContain(code);
  });
  it.each(["learn", "calibrate", "reinforce"] as const)("keeps %s 60/61-minute and legal long checkpoint boundaries", kind => {
    for (const [minutes, checkpoints, expected] of [[[60], false, []], [[60], true, ["invalid-registry"]], [[61], false, ["invalid-registry"]], [[30, 31], true, []], [[60, 60], true, []]] as const) {
      const value = fresh();
      setMinutes(value.unitTemplates.find(t => t.kind === kind)!, [...minutes], checkpoints);
      const diagnostic = check(value, [...expected]);
      expect(diagnostic.registryIssueCodes).toEqual(expected.length ? ["invalid-checkpoint"] : []);
    }
  });
  it.each(["under-30", "over-60", "reversed", "omitted", "repeated", "missing-step", "checkpoint-minute", "template-minute"])("retains exact coverage/minute rejection: %s", fault => {
    const value = fresh(); const unit = value.unitTemplates[0]!;
    setMinutes(unit, [30, 31], true);
    if (fault === "under-30") setMinutes(unit, [29, 32], true);
    if (fault === "over-60") setMinutes(unit, [30, 61], true);
    if (fault === "reversed") unit.checkpoints.reverse();
    if (fault === "omitted") unit.checkpoints.pop();
    if (fault === "repeated") unit.checkpoints[1]!.stepIds = [...unit.checkpoints[0]!.stepIds];
    if (fault === "missing-step") unit.checkpoints[1]!.stepIds = ["missing-step-canary"];
    if (fault === "checkpoint-minute") unit.checkpoints[1]!.estimatedMinutes += 1;
    if (fault === "template-minute") unit.estimatedMinutes += 1;
    expect(check(value, fault === "template-minute" ? ["invalid-registry", "minute-mismatch"] : ["invalid-registry"]).registryIssueCodes).toContain("invalid-checkpoint");
  });
  it.each(["alternativeResourceIds", "completionCriteria", "rubric"] as const)("observes real registry superRefine %s", field => {
    const value = fresh(); const unit = value.unitTemplates[0]!; unit[field].push(unit[field][0]!);
    const scope = { alternativeResourceIds: "alternative-resource-ids", completionCriteria: "completion-criteria", rubric: "rubric" }[field];
    expect(check(value, ["invalid-registry"]).registrySchema).toEqual({ outcome: "rejected", issues: [{ scope, code: "other" }], truncated: false });
  });
  it("observes actual checkpoint stepIds refinement and the track template capacity", () => {
    const repeated = fresh(); repeated.unitTemplates[0]!.checkpoints[0]!.stepIds.push(repeated.unitTemplates[0]!.checkpoints[0]!.stepIds[0]!);
    expect(check(repeated, ["invalid-registry"]).registrySchema.issues).toContainEqual({ scope: "checkpoint-step-ids", code: "other" });
    const capacity = fresh();
    for (let i = 0; i < 6; i++) {
      const unit = structuredClone(capacity.unitTemplates[0]!); unit.id = `extra-learn-${i}`; setMinutes(unit, [60], false); capacity.unitTemplates.push(unit);
    }
    expect(check(capacity, ["invalid-registry"]).registrySchema.issues).toEqual([{ scope: "template", code: "too-big" }]);
  });
  it("reuses both existing schemas and validators once, without diagnostic traversal when disabled", () => {
    const spies = [vi.spyOn(roleBlueprintSchema, "safeParse"), vi.spyOn(unitRegistrySchema, "safeParse"), vi.spyOn(blueprintValidator, "validateRoleBlueprint"), vi.spyOn(registryValidator, "validateUnitRegistry")];
    const observe = vi.spyOn(diagnosticModule, "observeResearchQualityDiagnostic");
    expect(validateResearchCandidate(fresh(), validAnnotations, context).ready).toBe(true);
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(observe).not.toHaveBeenCalled();
    validateResearchCandidate(fresh(), validAnnotations, context, { onQualityDiagnostic: () => {} });
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledTimes(1);
  });
  it.each(["blueprint-schema", "registry-schema", "blueprint-validator", "registry-validator"])("preserves original business exception: %s", stage => {
    const error = Error("Synthetic business exception"); const observer = vi.fn();
    const fail = () => { throw error; };
    if (stage === "blueprint-schema") vi.spyOn(roleBlueprintSchema, "safeParse").mockImplementation(fail);
    if (stage === "registry-schema") vi.spyOn(unitRegistrySchema, "safeParse").mockImplementation(fail);
    if (stage === "blueprint-validator") vi.spyOn(blueprintValidator, "validateRoleBlueprint").mockImplementation(fail);
    if (stage === "registry-validator") vi.spyOn(registryValidator, "validateUnitRegistry").mockImplementation(fail);
    expect(() => validateResearchCandidate(fresh(), validAnnotations, context)).toThrow(error);
    expect(() => validateResearchCandidate(fresh(), validAnnotations, context, { onQualityDiagnostic: observer })).toThrow(error);
    expect(observer).not.toHaveBeenCalled();
  });
  it("projects an existing schema rejection without revalidating and observes before package rejection", () => {
    const error = new z.ZodError([{ code: "custom", path: ["skills", 0, "why"], message: "SECRET-canary" }]);
    const spy = vi.spyOn(roleBlueprintSchema, "safeParse").mockReturnValue({ success: false, error: error as z.ZodError<z.infer<typeof roleBlueprintSchema>> });
    const observer = vi.fn();
    const result = validateResearchCandidate(fresh(), validAnnotations, context, { onQualityDiagnostic: observer });
    expect(result.quality.issueCodes).toEqual(["invalid-schema"]);
    expect(observer.mock.calls[0]![0].blueprintSchema).toEqual({ outcome: "rejected", issues: [{ scope: "skill", code: "other" }], truncated: false });
    expect(spy).toHaveBeenCalledTimes(1); spy.mockRestore(); observer.mockClear();
    vi.spyOn(researchPackageSchema, "safeParse").mockReturnValue({ success: false, error: error as z.ZodError<z.infer<typeof researchPackageSchema>> });
    const late = validateResearchCandidate(fresh(), validAnnotations, context, { onQualityDiagnostic: observer });
    expect(late).toMatchObject({ ready: false, sanitizedCandidate: null, quality: { issueCodes: ["invalid-schema"] } });
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0]![0]).toMatchObject({ blueprintSchema: { outcome: "accepted" }, registrySchema: { outcome: "accepted" }, blueprintIssueCodes: [], registryIssueCodes: [], evidenceIssueCodes: [] });
  });
  it("emits zero observations for context, candidate and source early failures", () => {
    const observer = vi.fn();
    expect(() => validateResearchCandidate(fresh(), validAnnotations, { ...context, expiresAt: context.observedAt }, { onQualityDiagnostic: observer })).toThrow(ResearchValidationContextError);
    expect(validateResearchCandidate({}, validAnnotations, context, { onQualityDiagnostic: observer }).quality.issueCodes).toEqual(["invalid-schema"]);
    expect(validateResearchCandidate(fresh(), [], context, { onQualityDiagnostic: observer }).quality.issueCodes).toEqual(["unreferenced-url"]);
    const unsafe = fresh(); unsafe.resources[0]!.url = "http://localhost/secret";
    expect(validateResearchCandidate(unsafe, validAnnotations, context, { onQualityDiagnostic: observer }).quality.issueCodes).toEqual(["unsafe-url"]);
    expect(observer).not.toHaveBeenCalled();
  });
  it.each(["throws", "rejects", "pending", "mutates"])("preserves complete results for observer that %s", async behavior => {
    for (const invalid of [false, true]) {
      const value = fresh(); if (invalid) value.evidence.push({ ...value.evidence[0]! });
      const baseline = validateResearchCandidate(value, validAnnotations, context);
      const before = structuredClone(value);
      const observer: ResearchQualityDiagnosticObserver = diagnostic => {
        if (behavior === "throws") throw Error("SECRET-canary");
        if (behavior === "rejects") return Promise.reject(Error("SECRET-canary"));
        if (behavior === "pending") return new Promise(() => {});
        diagnostic.blueprintSchema.issues.push({ scope: "unknown", code: "other" });
        diagnostic.evidenceIssueCodes.length = 0;
        Object.assign(diagnostic, { version: "SECRET-canary" });
      };
      const observed = validateResearchCandidate(value, validAnnotations, context, { onQualityDiagnostic: observer });
      expect(observed).toEqual(baseline);
      expect(observed.ready).toBe(!invalid);
      expect(observed.quality.issueCodes).toEqual(invalid ? ["invalid-graph"] : []);
      expect(value).toEqual(before);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  it("drops diagnostic setup failure while preserving business result", () => {
    const baseline = validateResearchCandidate(fresh(), validAnnotations, context);
    vi.spyOn(diagnosticModule, "observeResearchQualityDiagnostic").mockImplementation(() => { throw Error("Synthetic diagnostic failure"); });
    expect(validateResearchCandidate(fresh(), validAnnotations, context, { onQualityDiagnostic: () => {} })).toEqual(baseline);
  });
});
