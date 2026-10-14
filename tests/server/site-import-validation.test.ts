// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { researchCandidateSchema } from "../../app/contracts/research";
import { deterministicId } from "../../app/lib/planning/fingerprint";
import { classifySiteValidation, hashSiteImportDecision, parseSiteImportDecision, prepareSiteImport, serializeSiteImportDecision } from "../../app/server/research/site-import-validation";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import type { SiteExecutionRecord } from "../../app/server/research/site-execution-repository";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createSiteAdmissionFixture } from "../helpers/site-admission-fixture";

const fixtures: ReturnType<typeof createSiteAdmissionFixture>[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.db.database.close(); });

async function begun(): Promise<SiteExecutionRecord> {
  const fixture = createSiteAdmissionFixture();
  fixtures.push(fixture);
  const created = await fixture.createRemote();
  const reservations = await fixture.reserveAdmission(created.execution);
  const admitted = await fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations));
  await fixture.begin.begin({ ownerId: admitted.ownerId, runId: admitted.runId, requestId: admitted.requestId,
    jobId: admitted.jobId, requestHash: admitted.requestHash, newExecutionAllowed: true });
  const execution = await fixture.executions.read(admitted.ownerId, admitted.runId);
  if (!execution) throw new Error("begun execution missing");
  return execution;
}

function receipt(execution: SiteExecutionRecord) {
  return { grant: { protocol: execution.job.protocol, jobId: execution.jobId, requestHash: execution.requestHash,
    beganAt: execution.beganAt, executionExpiresAt: execution.executionExpiresAt },
    producedAt: execution.beganAt! + 1_000, latencyMs: 1_234,
    outcome: { kind: "response", content: JSON.stringify(validResearchCandidate), annotations: validAnnotations,
      actualModel: "openrouter/actual", usage: { promptTokens: 100, completionTokens: 200,
        totalTokens: 300, costMicros: 12_345, webSearchRequests: 0 } } };
}

function fanoutCandidate() {
  const candidate = researchCandidateSchema.parse(validResearchCandidate);
  const resource = candidate.resources[0]!;
  const base = candidate.unitTemplates[0]!;
  candidate.skills = Array.from({ length: 64 }, (_, index) => ({ ...candidate.skills[0]!,
    id: `fanout-skill-${index}`, resourceIds: [resource.id] }));
  candidate.prerequisiteEdges = candidate.skills.flatMap((skill, index) => candidate.skills.slice(0, index)
    .map((prerequisite) => ({ skillId: skill.id, prerequisiteSkillId: prerequisite.id })));
  candidate.resources = [{ ...resource, skillIds: candidate.skills.map((skill) => skill.id) }];
  candidate.stages = [{ ...candidate.stages[0]!, skillIds: candidate.skills.map((skill) => skill.id) }];
  candidate.unitTemplates = candidate.skills.flatMap((skill) => (["learn", "calibrate", "reinforce"] as const)
    .map((kind) => ({ ...base, id: `${skill.id}-${kind}`, skillId: skill.id, kind,
      primaryResourceId: resource.id, alternativeResourceIds: [],
      steps: [{ id: `${skill.id}-${kind}-step`, label: "Practice the skill", minutes: 60 }],
      checkpoints: [], estimatedMinutes: 60 })));
  candidate.evidence = candidate.skills.map((skill) => ({ id: `${skill.id}-evidence`,
    skillId: skill.id, resourceId: resource.id }));
  return candidate;
}

describe("pure site import validation", () => {
  it("accepts only locally validated candidate with the original grant, context and usage", async () => {
    const execution = await begun();
    const result = prepareSiteImport(execution, receipt(execution));
    expect(result.decision.kind).toBe("ready");
    if (result.decision.kind !== "ready") return;
    expect(result.decision.package.id).toBe(execution.validationContext.packageId);
    expect(result.decision.package.observedAt).toBe(execution.validationContext.observedAt);
    expect(result.decision.package.blueprint.version).toBe(execution.validationContext.blueprintVersion);
    expect(result.audit).toMatchObject({ userId: execution.ownerId, purpose: "role-research", provider: "openrouter",
      requestId: deterministicId("research-attempt", [execution.ownerId, execution.runId, execution.requestId, "role-research"]),
      status: "accepted", errorCode: null, latencyMs: 1_234, model: "openrouter/actual",
      usage: { costMicros: 12_345 } });
    expect(result.settlement).toEqual({ kind: "actual", actualMicros: 12_345 });
  });

  it("uses the stored context across midnight and accepts an exact fenced candidate", async () => {
    const execution = await begun();
    const raw = receipt(execution);
    raw.producedAt = execution.beganAt! + 86_400_000;
    raw.outcome.content = `\n\`\`\`json\n${JSON.stringify(validResearchCandidate)}\n\`\`\`\n`;
    const result = prepareSiteImport(execution, raw);
    expect(result.decision.kind).toBe("ready");
    if (result.decision.kind === "ready") expect(result.decision.package.observedAt).toBe(execution.validationContext.observedAt);
    expect(() => prepareSiteImport({ ...execution, validationContext: { ...execution.validationContext,
      packageId: "research-package-forged" } }, raw)).toThrowError("RESEARCH_UNAVAILABLE");
    expect(() => prepareSiteImport(execution, { ...raw, grant: { ...raw.grant, requestHash: "f".repeat(64) } }))
      .toThrowError("RESEARCH_UNAVAILABLE");
  });

  it("classifies invalid syntax, unsafe source, and a safe failed-quality candidate without retaining raw content", async () => {
    const execution = await begun();
    const base = receipt(execution);
    const invalid = prepareSiteImport(execution, { ...base, outcome: { ...base.outcome, content: "{secret:sk-private}" } });
    expect(invalid.decision).toMatchObject({ kind: "failed", errorCode: "invalid-result", retryable: true });
    expect(invalid.audit).toMatchObject({ status: "rejected", errorCode: "invalid-result", charged: true });
    const unsafe = researchCandidateSchema.parse(validResearchCandidate);
    unsafe.resources[0]!.url = "https://127.0.0.1/private";
    const unsafeResult = prepareSiteImport(execution, { ...base, outcome: { ...base.outcome, content: JSON.stringify(unsafe) } });
    expect(unsafeResult.decision).toMatchObject({ kind: "failed", errorCode: "invalid-result" });
    const safe = prepareSiteImport(execution, { ...base, outcome: { ...base.outcome, annotations: [] } });
    expect(safe.decision).toMatchObject({ kind: "needs-review", quality: { passed: false } });
    expect(JSON.stringify(safe.decision)).not.toContain("annotations");
    expect(Object.keys(safe.decision)).toEqual(["kind", "quality", "candidate"]);
  });

  it.each([
    ["timeout", "timeout"], ["rate", "rate-limited"], ["balance", "allowance-reached"],
    ["filtered", "content-rejected"], ["invalid-transport", "invalid-result"],
    ["missing-key", "service-unavailable"], ["unavailable", "service-unavailable"],
  ] as const)("maps provider %s to %s with its original billing evidence", async (code, category) => {
    const execution = await begun();
    const base = receipt(execution);
    const outcome = { kind: "error", code, retryable: false, charged: "unknown", actualModel: null,
      usage: { ...base.outcome.usage, costMicros: 6_000_000 } };
    const result = prepareSiteImport(execution, { ...base, outcome });
    expect(result.decision).toEqual({ kind: "failed", quality: null, errorCode: code,
      failureCategory: category, retryable: false });
    expect(result.audit).toMatchObject({ status: "failed", errorCode: code, charged: "unknown",
      usage: { costMicros: 6_000_000 } });
    expect(result.settlement).toEqual({ kind: "actual", actualMicros: 6_000_000 });
  });

  it("rejects uncharged nonzero usage before creating audit evidence", async () => {
    const execution = await begun();
    const base = receipt(execution);
    expect(() => prepareSiteImport(execution, { ...base, outcome: { kind: "error", code: "timeout", retryable: true,
      charged: false, actualModel: null, usage: base.outcome.usage } })).toThrowError("RESEARCH_UNAVAILABLE");
  });

  it("preserves zero actual cost, unknown usage, and uncharged failures distinctly", async () => {
    const execution = await begun();
    const base = receipt(execution);
    const zero = prepareSiteImport(execution, { ...base, outcome: { ...base.outcome,
      usage: { ...base.outcome.usage, costMicros: 0 } } });
    expect(zero.settlement).toEqual({ kind: "actual", actualMicros: 0 });
    const unknown = prepareSiteImport(execution, { ...base, outcome: { ...base.outcome, usage: null } });
    expect(unknown.settlement).toEqual({ kind: "unknown" });
    expect(unknown.audit.usage).toBeNull();
    const uncharged = prepareSiteImport(execution, { ...base, outcome: { kind: "error", code: "timeout",
      retryable: true, charged: false, actualModel: null, usage: null } });
    expect(uncharged.settlement).toEqual({ kind: "not-charged" });
    expect(uncharged.audit).toMatchObject({ charged: false, usage: null });
    const freeUsage = { ...base.outcome.usage, costMicros: 0 };
    const free = prepareSiteImport(execution, { ...base, outcome: { kind: "error", code: "timeout",
      retryable: true, charged: false, actualModel: null, usage: freeUsage } });
    expect(free.settlement).toEqual({ kind: "not-charged" });
    expect(free.audit.usage).toEqual(freeUsage);
  });

  it("serializes and hashes owned decisions while rejecting mutated package identity and accessors", async () => {
    const execution = await begun();
    const ready = prepareSiteImport(execution, receipt(execution)).decision;
    const encoded = serializeSiteImportDecision(ready, execution.validationContext);
    expect(parseSiteImportDecision(JSON.parse(encoded), execution.validationContext)).toEqual(ready);
    expect(await hashSiteImportDecision(ready, execution.validationContext)).toMatch(/^[0-9a-f]{64}$/u);
    if (ready.kind !== "ready") return;
    expect(() => parseSiteImportDecision({ ...ready, package: { ...ready.package, id: "research-package-other" } },
      execution.validationContext)).toThrowError("RESEARCH_UNAVAILABLE");
    const accessor = Object.defineProperty({ ...ready }, "quality", { enumerable: true, get: () => ready.quality });
    expect(() => parseSiteImportDecision(accessor, execution.validationContext)).toThrowError("RESEARCH_UNAVAILABLE");
    expect(() => parseSiteImportDecision({ ...ready, quality: { ...ready.quality, sourceCount: 99 } },
      execution.validationContext)).toThrowError("RESEARCH_UNAVAILABLE");
    const interrupted = { kind: "failed", quality: null, errorCode: "interrupted", failureCategory: "timeout", retryable: true };
    expect(parseSiteImportDecision(interrupted, execution.validationContext)).toEqual(interrupted);
    for (const changed of [{ failureCategory: "service-unavailable" }, { retryable: false },
      { quality: { passed: false, issueCodes: ["invalid-schema"], skillCount: 0, sourceCount: 0,
        unitCount: 0, observedAt: execution.validationContext.observedAt } }]) {
      expect(() => parseSiteImportDecision({ ...interrupted, ...changed }, execution.validationContext))
        .toThrowError("RESEARCH_UNAVAILABLE");
    }
  });

  it("requires failed quality for a locally invalid response decision", async () => {
    const execution = await begun();
    const base = receipt(execution);
    const failed = prepareSiteImport(execution, { ...base, outcome: { ...base.outcome,
      content: "{invalid}" } }).decision;
    expect(failed).toMatchObject({ kind: "failed", errorCode: "invalid-result", quality: { passed: false } });
    expect(parseSiteImportDecision(failed, execution.validationContext)).toEqual(failed);
    expect(serializeSiteImportDecision(failed, execution.validationContext)).toContain("invalid-result");
    expect(await hashSiteImportDecision(failed, execution.validationContext)).toMatch(/^[0-9a-f]{64}$/u);
    const omitted = { ...failed, quality: null };
    expect(() => parseSiteImportDecision(omitted, execution.validationContext)).toThrowError("RESEARCH_UNAVAILABLE");
    expect(() => serializeSiteImportDecision(omitted, execution.validationContext)).toThrowError("RESEARCH_UNAVAILABLE");
    await expect(hashSiteImportDecision(omitted, execution.validationContext)).rejects.toThrowError("RESEARCH_UNAVAILABLE");
  });

  it("drops oversized safe review candidates and refuses UTF-8 oversized ready packages", async () => {
    const execution = await begun();
    const baseline = prepareSiteImport(execution, receipt(execution)).decision;
    if (baseline.kind !== "ready") throw new Error("baseline must be ready");
    const candidate = researchCandidateSchema.parse(validResearchCandidate);
    const example = candidate.unitTemplates[0]!;
    candidate.unitTemplates = Array.from({ length: 512 }, (_, index) => ({ ...example,
      id: `oversized-unit-${index}`, buildTask: "a".repeat(800), proofRequirement: "b".repeat(800),
      objective: "c".repeat(500), whyNow: "d".repeat(500),
      rubric: Array(6).fill("e".repeat(500)), completionCriteria: Array(8).fill("f".repeat(500)) }));
    expect(new TextEncoder().encode(JSON.stringify(candidate)).byteLength).toBeGreaterThan(1_048_576);
    const review = classifySiteValidation({ ready: false, quality: { passed: false, issueCodes: ["invalid-registry"],
      skillCount: 3, sourceCount: 6, unitCount: 512, observedAt: execution.validationContext.observedAt },
    sanitizedCandidate: candidate }, execution.validationContext);
    expect(review).toMatchObject({ kind: "needs-review", candidate: null });
    let getterInvoked = false;
    const unsafePackage = Object.defineProperty({ ...baseline.package }, "blueprint", { enumerable: true,
      get: () => { getterInvoked = true; throw new Error("getter invoked"); } });
    expect(() => classifySiteValidation({ ready: true, package: unsafePackage, quality: baseline.quality },
      execution.validationContext)).toThrowError("RESEARCH_UNAVAILABLE");
    expect(getterInvoked).toBe(false);
    const malformedCandidate = researchCandidateSchema.parse(validResearchCandidate);
    malformedCandidate.resources[0]!.url = "https://127.0.0.1/private";
    expect(classifySiteValidation({ ready: false, quality: { passed: false, issueCodes: ["invalid-schema"],
      skillCount: 0, sourceCount: 0, unitCount: 0, observedAt: execution.validationContext.observedAt },
    sanitizedCandidate: malformedCandidate }, execution.validationContext)).toMatchObject({
      kind: "failed", errorCode: "invalid-result", quality: { passed: false }, retryable: true,
    });
    const fanout = fanoutCandidate();
    for (const template of fanout.unitTemplates) {
      template.objective = "学".repeat(500);
      template.buildTask = "学".repeat(800);
      template.proofRequirement = "学".repeat(800);
      template.completionCriteria = Array.from({ length: 8 }, (_, index) => "学".repeat(499) + index);
    }
    const oversized = validateResearchCandidate(fanout, validAnnotations, execution.validationContext);
    expect(oversized.ready).toBe(true);
    if (!oversized.ready) return;
    expect(JSON.stringify(oversized.package).length).toBeLessThan(1_900_000);
    expect(new TextEncoder().encode(JSON.stringify(oversized.package)).byteLength).toBeGreaterThan(1_900_000);
    expect(classifySiteValidation(oversized, execution.validationContext)).toEqual({ kind: "failed",
      quality: null, errorCode: "result-too-large", failureCategory: "invalid-result", retryable: false });
  });

  it("does not invoke caller accessors or retain later caller mutations", async () => {
    const execution = await begun();
    const raw = receipt(execution);
    let touched = false;
    const malicious = Object.defineProperty({ ...execution }, "validationContext", { enumerable: true,
      get: () => { touched = true; return execution.validationContext; } });
    expect(() => prepareSiteImport(malicious, raw)).toThrowError("RESEARCH_UNAVAILABLE");
    expect(touched).toBe(false);
    const prepared = prepareSiteImport(execution, raw);
    raw.outcome.content = "{mutated}";
    expect(prepared.decision.kind).toBe("ready");
  });
});
