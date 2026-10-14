import { D1SiteImportRepository } from "../../app/server/research/d1-site-import-repository";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { summarizeBridgeProviderReceipt } from "../../app/server/research/executor/receipt";
import type { SiteExecutionIdentity, SiteExecutionRecord } from "../../app/server/research/site-execution-repository";
import { createSiteAdmissionFixture } from "./site-admission-fixture";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

export async function createSiteImportFixture(filename = ":memory:") {
  const admission = createSiteAdmissionFixture(filename);
  const created = await admission.createRemote();
  const reservations = await admission.reserveAdmission(created.execution);
  const admitted = await admission.executions.markAdmitted(admission.admissionCommand(created.execution, reservations));
  await admission.begin.begin({ ownerId: admitted.ownerId, runId: admitted.runId,
    requestId: admitted.requestId, jobId: admitted.jobId, requestHash: admitted.requestHash,
    newExecutionAllowed: true });
  const execution = await admission.executions.read(admitted.ownerId, admitted.runId);
  if (!execution) throw new Error("missing begun import fixture execution");
  const identity: SiteExecutionIdentity = { ownerId: execution.ownerId, runId: execution.runId,
    requestId: execution.requestId, jobId: execution.jobId, requestHash: execution.requestHash };
  const imports = new D1SiteImportRepository(admission.db as unknown as D1Database, admission.research, admission.executions);
  const audits = new D1AiRunSink(admission.db as unknown as D1Database);
  const receipt = errorReceipt(execution);
  return { ...admission, execution, identity, imports, audits, receipt,
    metadata: async () => summarizeBridgeProviderReceipt(receipt),
    newImports: () => new D1SiteImportRepository(admission.db as unknown as D1Database,
      admission.research, admission.executions) };
}

export function errorReceipt(execution: SiteExecutionRecord) {
  return { grant: { protocol: execution.job.protocol, jobId: execution.jobId,
    requestHash: execution.requestHash, beganAt: execution.beganAt, executionExpiresAt: execution.executionExpiresAt },
    producedAt: execution.beganAt! + 1_000, latencyMs: 123,
    outcome: { kind: "error", code: "timeout", retryable: true, charged: false,
      actualModel: null, usage: null } };
}

export function validReceipt(execution: SiteExecutionRecord, costMicros = 100_000) {
  return { grant: { protocol: execution.job.protocol, jobId: execution.jobId,
    requestHash: execution.requestHash, beganAt: execution.beganAt, executionExpiresAt: execution.executionExpiresAt },
    producedAt: execution.beganAt! + 1_000, latencyMs: 123,
    outcome: { kind: "response" as const, content: JSON.stringify(validResearchCandidate),
      annotations: validAnnotations, actualModel: "openrouter/actual", usage: {
        promptTokens: 100, completionTokens: 200, totalTokens: 300,
        costMicros, webSearchRequests: 0 } } };
}
