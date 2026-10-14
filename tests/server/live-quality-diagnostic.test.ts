// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fixtureResponse, runValidation } from "../../scripts/live-research/validation";
import * as diagnosticModule from "../../app/server/research/quality-diagnostic";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { researchCandidateSchema, researchPackageSchema, type ResearchCandidate } from "../../app/contracts/research";
import { validResearchCandidate } from "../fixtures/research/valid-candidate";

const accepted = {
  version: "quality-diagnostic-v1", stage: "semantic-validation",
  blueprintSchema: { outcome: "accepted", issues: [], truncated: false },
  registrySchema: { outcome: "accepted", issues: [], truncated: false },
  blueprintIssueCodes: [], registryIssueCodes: [], evidenceIssueCodes: [],
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

type Payload = { choices: { finish_reason: string; message: { content: string; annotations: unknown[] } }[] };
async function syntheticRun(change?: (payload: Payload) => void, failure?: "key" | "provider" | "transport") {
  const payload = await fixtureResponse().json() as Payload; change?.(payload);
  const globalFetch = vi.fn<typeof globalThis.fetch>(async () => { throw Error("synthetic-global-fetch-denied"); });
  vi.stubGlobal("fetch", globalFetch);
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    if (url === "https://openrouter.ai/api/v1/key") {
      expect(init).toMatchObject({ method: "GET", redirect: "error" });
      return failure === "key" ? Response.json({}, { status: 401 }) : Response.json({ data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, is_management_key: false, is_provisioning_key: false, byok_usage: 0, expires_at: null } });
    }
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    if (failure === "transport") throw Error("synthetic-transport-failure");
    return failure === "provider" ? Response.json({}, { status: 503 }) : Response.json(payload);
  });
  const summary = await runValidation({ executeOne: true, key: "synthetic-quality-key", fetch });
  expect(globalFetch).not.toHaveBeenCalled();
  expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    ["https://openrouter.ai/api/v1/key", "GET"], ...(failure === "key" ? [] : [["https://openrouter.ai/api/v1/chat/completions", "POST"]]),
  ]);
  expect(summary).toMatchObject({ realRequestCount: failure === "key" ? 1 : 2, repairRequestCount: 0, databaseDisposed: true });
  return summary;
}
function candidatePayload(payload: Payload, change: (candidate: ResearchCandidate) => void) {
  const candidate = researchCandidateSchema.parse(validResearchCandidate); change(candidate);
  payload.choices[0]!.message.content = JSON.stringify(candidate);
}

describe("local semantic quality summary", () => {
  it("reports actual default offline semantic acceptance and preserves the full lifecycle", async () => {
    const globalFetch = vi.fn(async () => { throw new Error("global-fetch-denied"); });
    vi.stubGlobal("fetch", globalFetch);
    const summary = await runValidation();
    expect(summary).toMatchObject({
      outcome: "passed", reason: null, runState: "ready", quality: { passed: true, issueCodes: [], issueCount: 0 },
      realRequestCount: 0, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true, freshAccountActivated: true,
      planningGenerated: true, databaseDisposed: true,
      usage: { costMicros: 100_000 }, reservation: { status: "settled", settledMicros: 100_000 },
    });
    expect(globalFetch).not.toHaveBeenCalled();
    expect(summary).toHaveProperty("researchQualityDiagnostic", accepted);
  });

  it("projects accepted semantic results to a bounded private object", async () => {
    const project = vi.spyOn(diagnosticModule, "projectResearchQualityDiagnostic");
    const summary = await syntheticRun((payload) => candidatePayload(payload, (candidate) => {
      candidate.role.summary = "CANARY-secret-role-text that must never enter finite quality diagnostics.";
    }));
    expect(summary).toMatchObject({ outcome: "passed", runState: "ready", researchQualityDiagnostic: accepted, auditCount: 1, quality: { passed: true }, ownerWrongReadRejected: true, secondResearchRejected: true, freshAccountActivated: true, planningGenerated: true });
    expect(project).toHaveBeenCalled();
    expect(new TextEncoder().encode(JSON.stringify(summary.researchQualityDiagnostic)).byteLength).toBeLessThanOrEqual(8192);
    expect(JSON.stringify(summary.researchQualityDiagnostic)).not.toMatch(/CANARY|synthetic-quality-key|data-modeling|https:|Data Product Manager|live-validation-owner/u);
    expect(Object.keys(summary.researchQualityDiagnostic!).sort()).toEqual(Object.keys(accepted).sort());
  });

  it("retains rejected semantic categories with existing quality, accounting and guards", async () => {
    const summary = await syntheticRun((payload) => candidatePayload(payload, (candidate) => {
      candidate.prerequisiteEdges.push({ skillId: "data-modeling", prerequisiteSkillId: "experimentation" });
    }));
    expect(summary).toMatchObject({ outcome: "incomplete", reason: "quality-needs-review", runState: "needs-review",
      quality: { passed: false, issueCodes: ["invalid-graph"], issueCount: 1 },
      researchQualityDiagnostic: { ...accepted, blueprintIssueCodes: ["prerequisite-cycle"] },
      usage: { costMicros: 100_000 }, reservation: { status: "settled", settledMicros: 100_000 },
      auditCount: 1, ownerWrongReadRejected: true, secondResearchRejected: true, freshAccountActivated: false, planningGenerated: false });
  });

  it.each(["key", "provider", "transport", "annotation", "candidate", "source"] as const)("keeps the diagnostic null for early %s failure", async (mode) => {
    const summary = await syntheticRun((payload) => {
      if (mode === "annotation") payload.choices[0]!.message.annotations = [{ type: "url_citation", url_citation: { url: "https://example.com", title: null } }];
      if (mode === "candidate") payload.choices[0]!.message.content = "{}";
      if (mode === "source") candidatePayload(payload, (candidate) => { candidate.resources[0]!.url = "http://127.0.0.1/private"; });
    }, ["key", "provider", "transport"].includes(mode) ? mode as "key" | "provider" | "transport" : undefined);
    expect(summary).toMatchObject({ outcome: "incomplete", researchQualityDiagnostic: null, freshAccountActivated: false, planningGenerated: false });
    expect(summary.runState).not.toBe("ready");
  });

  it.each(["receipt", "current", "saveValidation", "lease"] as const)("retains accepted stage observation after actual %s failure", async (mode) => {
    const record = D1AiRunSink.prototype.record;
    const getRun = D1ResearchRepository.prototype.getRun;
    let semanticCompleted = false;
    vi.spyOn(D1AiRunSink.prototype, "record").mockImplementation(async function (this: D1AiRunSink, command) {
      if (command.purpose === "role-research" && command.status === "accepted") {
        semanticCompleted = true;
        if (mode === "receipt") throw Error("synthetic-receipt-storage-fault");
      }
      return record.call(this, command);
    });
    if (mode === "saveValidation") vi.spyOn(D1ResearchRepository.prototype, "saveValidation").mockRejectedValue(Error("synthetic-save-storage-fault"));
    if (mode === "current" || mode === "lease") vi.spyOn(D1ResearchRepository.prototype, "getRun").mockImplementation(async function (this: D1ResearchRepository, ownerId, runId) {
      const run = await getRun.call(this, ownerId, runId);
      if (semanticCompleted && run?.state === "validating") {
        semanticCompleted = false;
        if (mode === "current") throw Error("synthetic-current-storage-fault");
        return { ...run, activeExpiresAt: 0 };
      }
      return run;
    });
    const summary = await syntheticRun();
    expect(summary).toMatchObject({ outcome: "incomplete", researchQualityDiagnostic: accepted, quality: { passed: false }, freshAccountActivated: false, planningGenerated: false });
    expect(summary.runState).not.toBe("ready");
    if (mode === "receipt") expect(summary).toMatchObject({ reason: "validation-incomplete", runState: null });
    else expect(summary).toMatchObject({ reason: "research-failed", runState: "failed", usage: { costMicros: 100_000 },
      reservation: mode === "lease" ? { status: "conservative-hold", settledMicros: 0 } : { status: "settled", settledMicros: 100_000 } });
  });

  it("retains semantic acceptance when the final package schema rejects", async () => {
    const error = new z.ZodError([{ code: "custom", path: [], message: "synthetic-package-rejection" }]);
    vi.spyOn(researchPackageSchema, "safeParse").mockReturnValue({ success: false, error: error as z.ZodError<z.infer<typeof researchPackageSchema>> });
    const summary = await syntheticRun();
    // The repository independently rejects the package write after the validator's semantic stage.
    expect(summary).toMatchObject({ outcome: "incomplete", reason: "research-failed", runState: "failed", quality: { passed: false, issueCodes: [] }, researchQualityDiagnostic: accepted, freshAccountActivated: false, planningGenerated: false });
  });

  it.each(["throw", "null", "malicious"] as const)("isolates local projector %s from business success", async (mode) => {
    let projections = 0;
    let projectedInput: unknown;
    if (mode !== "malicious") vi.spyOn(diagnosticModule, "projectResearchQualityDiagnostic").mockImplementation((diagnostic) => {
      // The builder's lexical call stays real; the imported Summary projection is intercepted here.
      projections++; projectedInput = structuredClone(diagnostic);
      if (mode === "throw") throw Error("CANARY-projector-exception");
      return null;
    });
    if (mode === "malicious") {
      vi.spyOn(diagnosticModule, "observeResearchQualityDiagnostic").mockImplementation((_input, observer) => {
        observer?.({ ...accepted, rawPayload: "CANARY-secret-provider-payload" } as unknown as diagnosticModule.ResearchQualityDiagnostic);
      });
    }
    const summary = await syntheticRun();
    if (mode !== "malicious") { expect(projections).toBe(1); expect(projectedInput).toEqual(accepted); }
    expect(summary).toMatchObject({ outcome: "passed", runState: "ready", researchQualityDiagnostic: null, quality: { passed: true }, usage: { costMicros: 100_000 }, reservation: { status: "settled", settledMicros: 100_000 }, ownerWrongReadRejected: true, secondResearchRejected: true, freshAccountActivated: true, planningGenerated: true });
    expect(JSON.stringify(summary)).not.toContain("CANARY");
  });
});
