// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createMaterialsD1, seedUser } from "../helpers/materials-d1";
import { memoryBucket } from "../helpers/document-bucket";
import { createDocumentRuntime } from "../../app/server/documents/runtime";
import { createDocumentRoute } from "../../app/server/http/document-route-factories";
import {createMaterialAnalysisFixture} from "../helpers/material-analysis-e2e";
import {materialContextRequest} from "../helpers/material-planning";
import {learningContext,promptContext} from "../../app/server/agents/context";

const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture() {
  const db = createMaterialsD1(); databases.push(db); seedUser(db, "owner-a"); seedUser(db, "owner-b");
  const bucket = memoryBucket();
  const { objects } = bucket;
  const runtime = createDocumentRuntime({ DB: db as unknown as D1Database, DOCUMENT_ASSETS: bucket, ARC_DOCUMENTS_ENABLED: "true", ARC_DOCUMENT_ANALYSIS_ENABLED: "true", ARC_DOCUMENT_PLANNING_ENABLED: "true" });
  const deps = (id = "owner-a") => ({ requireUser: async () => ({ id }), configuredOrigin: () => "https://arc.test", createService: () => runtime,
    rateLimiter: { reserve: async () => ({ allowed: true }) } });
  return { db, objects, runtime, deps };
}
describe("offline material service integration", () => {
  it("runs HTTP AI analysis, review, confirmation, contextual generation and deletion with redacted history",async()=>{
    const f=await createMaterialAnalysisFixture();databases.push(f.db,f.executorDb);
    const saved=await f.http("createDocument",{kind:"jd",displayName:"Synthetic private JD",text:f.text,mutationId:"ai-save"});
    const consent=await f.http("createDocumentConsent",{textVersionId:saved.textVersionId,purpose:"analysis",providerPolicyId:"qualified-policy",policyVersion:"2026.11.1",mutationId:"ai-consent"});
    const job=await f.http("createDocumentJob",{textVersionId:saved.textVersionId,consentId:consent.consentId,mutationId:"ai-job"});
    expect(f.providerCalls()).toBe(0);await f.execute(job.jobId);expect(f.providerCalls()).toBe(1);
    expect(await f.http("readDocumentJob",{jobId:job.jobId})).toMatchObject({state:"succeeded",costState:"settled"});
    const review=(await f.http("readDocumentReviewDraft",{documentId:saved.documentId,textVersionId:saved.textVersionId})).draft!;expect(review.origin).toBe("ai");expect(review.items).toHaveLength(1);
    await expect(f.http("readDocumentReviewDraft",{documentId:saved.documentId,textVersionId:saved.textVersionId},"owner-b")).rejects.toThrow("404");
    const confirmation=await f.http("createDocumentConfirmation",{documentId:saved.documentId,documentVersionId:saved.documentVersionId,textVersionId:saved.textVersionId,items:review.items,reviewRevision:review.revision,expectedRevision:saved.revision,mutationId:"ai-confirm"});
    const source=materialContextRequest(),selection=await f.http("createMaterialSelection",{scope:source.scope,entries:[{slot:"jd",documentId:saved.documentId,documentVersionId:saved.documentVersionId,confirmationId:confirmation.confirmationId}],mutationId:"ai-selection"});
    const preview=await f.http("createMaterialContext",{...source,selectionRef:selection,mutationId:"ai-context"});expect(preview.preview.priorities.some(priority=>priority.tier===0)).toBe(true);
    const {selectionRef:unusedSelection,scope:unusedScope,mutationId:unusedMutation,...generation}=source;void unusedSelection;void unusedScope;void unusedMutation;
    const generated=await f.http("generatePlanning",{...generation,mutationId:"ai-generate",materials:{contextVersionId:preview.contextVersionId,previewToken:preview.previewToken,selectionRef:selection}});
    const workspace=generated.result.workspace;expect(workspace.goalId).toBe("goal-a");expect(f.db.database.prepare("SELECT count(*) n FROM goal_document_links").get()).toMatchObject({n:1});
    const context=learningContext({workspace,sourceContext:generated.sourceContext});expect(promptContext(context,{requestId:"00000000-0000-4000-8000-000000000001",goalId:workspace.goalId,baseVersionId:workspace.activePlanVersionId,revision:workspace.revision,page:"today",message:"What is next?",deep:false},true)).not.toContain("PRIVATE-MATERIAL-SENTINEL-7f91");
    expect(JSON.stringify(f.db.database.prepare("SELECT response_json FROM idempotency_records").all())).not.toContain("PRIVATE-MATERIAL-SENTINEL-7f91");
    const deletion=await f.http("deleteDocument",{documentId:saved.documentId,expectedRevision:confirmation.revision,mutationId:"ai-delete"});await f.runtime.maintenance();
    expect((await f.http("readDocumentDeletion",{deletionJobId:deletion.deletionJobId})).state).toBe("completed");expect(f.privateObjectCount()).toBe(0);
    const history=await f.http("readMaterialHistory",{goalId:workspace.goalId});expect(history.plans[0]?.sourceAvailability).toBe("unavailable");expect(JSON.stringify(history)).not.toContain("PRIVATE-MATERIAL-SENTINEL-7f91");expect((await f.runtime.planning.getWorkspace("owner-a"))?.id).toBe(workspace.id);
  });
  it("persists through HTTP, isolates owners, confirms manual fallback, and cleans deletion", async () => {
    const { runtime, deps, objects, db } = fixture();
    const post = new Request("https://arc.test/api/documents", { method: "POST", headers: { origin: "https://arc.test", "content-type": "application/json" }, body: JSON.stringify({ kind: "resume", displayName: "合成简历", text: "PRIVATE-MATERIAL-SENTINEL-7f91", mutationId: "create-a" }) });
    const response = await createDocumentRoute("createDocument", deps())(post); expect(response.status).toBe(201);
    const ref = await response.json() as { documentId: string; documentVersionId: string; textVersionId: string; revision: number };
    const request = new Request(`https://arc.test/api/documents/${ref.documentId}`);
    const denied = await createDocumentRoute("readDocument", deps("owner-b"))(request, { params: { documentId: ref.documentId } });
    expect(denied.status).toBe(404); expect(await denied.text()).not.toContain("PRIVATE-MATERIAL");
    const review = await runtime.invoke("owner-a", "saveDocumentReviewDraft", { documentId: ref.documentId, textVersionId: ref.textVersionId, extractionId: null, items: [{ id: "fact-a", kind: "skill-claim", text: "SQL guided practice", origin: "user", sourceRef: null, requirementLevel: null }], selfAssessmentHints: [], expectedRevision: 0, mutationId: "review-a" });
    const confirmation = await runtime.invoke("owner-a", "createDocumentConfirmation", { documentId: ref.documentId, documentVersionId: ref.documentVersionId, textVersionId: ref.textVersionId, expectedRevision: 0, reviewRevision: review.draft.revision, items: review.draft.items, mutationId: "confirm-a" });
    expect(confirmation.confirmationId).toBeTruthy();
    expect(db.database.prepare("SELECT count(*) n FROM document_jobs").get()).toMatchObject({ n: 0 });
    const deletion = await runtime.invoke("owner-a", "deleteDocument", { documentId: ref.documentId, expectedRevision: confirmation.revision, mutationId: "delete-a" });
    await runtime.maintenance();
    expect((await runtime.invoke("owner-a", "readDocumentDeletion", { deletionJobId: deletion.deletionJobId })).state).toBe("completed");
    expect(objects.size).toBe(0);
    await expect(runtime.invoke("owner-a", "readDocument", { documentId: ref.documentId })).rejects.toMatchObject({ code: "gone" });
  });
  it("keeps configured flags separate from real model qualification", async () => {
    const { runtime, db } = fixture();
    const capabilities = await runtime.invoke("owner-a", "readDocumentCapabilities", {});
    expect(capabilities).toMatchObject({ documentsEnabled: true, analysisEnabled: false, planningEnabled: true });
    await expect(runtime.invoke("owner-a", "createDocumentJob", { textVersionId: "text-missing", consentId: "consent-missing", mutationId: "job-missing" })).rejects.toMatchObject({ code: "unavailable" });
    expect(db.database.prepare("SELECT count(*) n FROM document_jobs").get()).toMatchObject({ n: 0 });
  });
});
