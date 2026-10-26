// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { researchCandidateSchema } from "../../app/contracts/research";
import { prepareSiteImport } from "../../app/server/research/site-import-validation";
import type { SiteExecutionRecord } from "../../app/server/research/site-execution-repository";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createSiteAdmissionFixture } from "../helpers/site-admission-fixture";

const marker = "PRIVATE_RESPONSE_MUST_NOT_BE_LOGGED";
const fixtures: ReturnType<typeof createSiteAdmissionFixture>[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const f of fixtures.splice(0)) f.db.database.close(); });
async function begun(): Promise<SiteExecutionRecord> {
  const f = createSiteAdmissionFixture(); fixtures.push(f);
  const created = await f.createRemote();
  const reservations = await f.reserveAdmission(created.execution);
  const admitted = await f.executions.markAdmitted(f.admissionCommand(created.execution, reservations));
  await f.begin.begin({ ownerId: admitted.ownerId, runId: admitted.runId, requestId: admitted.requestId,
    jobId: admitted.jobId, requestHash: admitted.requestHash, newExecutionAllowed: true });
  return (await f.executions.read(admitted.ownerId, admitted.runId))!;
}
function receipt(e: SiteExecutionRecord, content: string) {
  return { grant: { protocol: e.job.protocol, jobId: e.jobId, requestHash: e.requestHash,
    beganAt: e.beganAt, executionExpiresAt: e.executionExpiresAt }, producedAt: e.beganAt! + 1_000, latencyMs: 1_234,
    outcome: { kind: "response", content, annotations: validAnnotations, actualModel: "openrouter/actual",
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300, costMicros: 223_509, webSearchRequests: 3 } } };
}
function diagnostic(warn: ReturnType<typeof vi.spyOn>) {
  expect(warn).toHaveBeenCalledOnce(); const text = warn.mock.calls[0]![0] as string;
  expect(text).not.toContain(marker); expect(text).not.toContain("https://");
  expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(16_384);
  return JSON.parse(text);
}
describe("Site response rejection diagnostics", () => {
  it("records the syntax boundary without logging model content or changing billing", async () => {
    const e = await begun(), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = prepareSiteImport(e, receipt(e, `{${marker}`));
    expect(result.decision).toMatchObject({ kind: "failed", errorCode: "invalid-result" });
    expect(result.settlement).toEqual({ kind: "actual", actualMicros: 223_509 });
    expect(diagnostic(warn)).toMatchObject({ event: "arc.research.site-validation-rejected",
      candidate: { outcome: "rejected", reason: "json-syntax" }, quality: { issueCodes: ["invalid-schema"] } });
  });
  it("records schema paths and codes, excluding rejected field values", async () => {
    const e = await begun(), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = researchCandidateSchema.parse(validResearchCandidate);
    Object.assign(input.resources[0]!, { format: marker });
    const result = prepareSiteImport(e, receipt(e, JSON.stringify(input)));
    expect(result.decision.kind).toBe("failed");
    expect(diagnostic(warn)).toMatchObject({ candidate: { reason: "schema-rejected",
      issues: [{ path: "resources[].format", code: "invalid-value" }] } });
  });
  it("records semantic registry failures after the candidate schema succeeds", async () => {
    const e = await begun(), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = researchCandidateSchema.parse(validResearchCandidate);
    input.unitTemplates[0]!.steps[0]!.label = marker;
    input.unitTemplates[0]!.steps[0]!.minutes += 1;
    const result = prepareSiteImport(e, receipt(e, JSON.stringify(input)));
    expect(result.decision.kind).toBe("needs-review");
    const log = diagnostic(warn);
    expect(log.candidate.outcome).toBe("accepted");
    expect(log.semantic.registryIssueCodes).toContain("minute-mismatch");
  });
  it("keeps accepted JSON and fenced JSON quiet", async () => {
    const e = await begun(), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const content = JSON.stringify(validResearchCandidate);
    for (const value of [content, `\`\`\`json\n${content}\n\`\`\``]) {
      expect(prepareSiteImport(e, receipt(e, value)).decision.kind).toBe("ready");
    }
    expect(warn).not.toHaveBeenCalled();
  });
  it("identifies missing citation positions without exposing content or changing settlement", async () => {
    const e = await begun(), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = receipt(e, JSON.stringify(validResearchCandidate));
    raw.outcome.annotations = validAnnotations.slice(1);
    const result = prepareSiteImport(e, raw);
    expect(result.decision).toMatchObject({ kind: "needs-review", quality: { issueCodes: ["unreferenced-url"] } });
    expect(result.settlement).toEqual({ kind: "actual", actualMicros: 223_509 });
    expect(diagnostic(warn).sources).toEqual({ version: "source-coverage-v1", resourceCount: 6,
      annotationCount: 5, uniqueCitationCount: 5, matchedResourceCount: 5, missingResourceCount: 1,
      missingResourceIndexes: [0], truncated: false });
  });
  it("does not let a throwing diagnostic change the decision or settlement", async () => {
    const e = await begun(), warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = receipt(e, `{${marker}`), baseline = prepareSiteImport(e, raw);
    warn.mockImplementation(() => { throw new Error(marker); });
    expect(prepareSiteImport(e, raw)).toEqual(baseline);
  });
});
