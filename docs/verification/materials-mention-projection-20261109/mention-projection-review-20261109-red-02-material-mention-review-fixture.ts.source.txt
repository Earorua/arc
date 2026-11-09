import { documentEndpointContracts, type DocumentEndpoint, type DocumentEndpointResponse } from "../../app/contracts/documents-api";
import type { DocumentCandidate } from "../../app/contracts/documents";
import { createDocumentsClient } from "../../app/lib/documents-client";
import { D1DocumentRepository } from "../../app/server/documents/d1-repository";
import { KIMI_SOURCE_MENTIONS_POLICY_ID } from "../../app/server/documents/policy";
import { ReviewService } from "../../app/server/documents/review-service";
import { createDocumentRuntime } from "../../app/server/documents/runtime";
import { DocumentStorage } from "../../app/server/documents/storage";
import { createDocumentRoute } from "../../app/server/http/document-route-factories";
import { memoryBucket } from "./document-bucket";
import { createMaterialsD1, materialsClock, seedUser } from "./materials-d1";
import { materialSourceResolver } from "./material-planning";

/** Real review HTTP/client/runtime persistence; only local, inert analysis delivery is seeded. No provider execution. */
export function createMaterialMentionReviewFixture() {
  const db = createMaterialsD1(), bucket = memoryBucket();
  seedUser(db, "owner-a"); seedUser(db, "owner-b");
  let serial = 0;
  const id = () => `mention-fixture-${++serial}`;
  const environment = { DB: db as unknown as D1Database, DOCUMENT_ASSETS: bucket,
    ARC_DOCUMENTS_ENABLED: "true", ARC_DOCUMENT_ANALYSIS_ENABLED: "false", ARC_DOCUMENT_PLANNING_ENABLED: "true" };
  const freshRuntime = () => createDocumentRuntime(environment, { now: materialsClock, createId: id, sourceResolver: materialSourceResolver() });
  let runtime = freshRuntime();
  const trace: { endpoint: DocumentEndpoint; status: number; body?: unknown }[] = [];
  const clientFor = (ownerId = "owner-a") => createDocumentsClient({ fetch: async (input, init) => {
    const url = new URL(String(input), "https://arc.test"), requested = url.pathname.split("/");
    const endpoints = (Object.keys(documentEndpointContracts) as DocumentEndpoint[])
      .sort((left, right) => Number(documentEndpointContracts[left].path.includes("[")) - Number(documentEndpointContracts[right].path.includes("[")));
    for (const endpoint of endpoints) {
      const contract = documentEndpointContracts[endpoint], parts = contract.path.split("/");
      if (contract.method !== (init?.method ?? "GET") || parts.length !== requested.length) continue;
      const params: Record<string, string> = {};
      if (!parts.every((part, index) => {
        if (!part.startsWith("[")) return part === requested[index];
        params[part.slice(1, -1)] = decodeURIComponent(requested[index]!);
        return true;
      })) continue;
      const headers = new Headers(init?.headers);
      if (contract.method !== "GET") headers.set("origin", "https://arc.test");
      const response = await createDocumentRoute(endpoint, { requireUser: async () => ({ id: ownerId }),
        configuredOrigin: () => "https://arc.test", createService: () => runtime,
        rateLimiter: { reserve: async () => ({ allowed: true }) },
      })(new Request(url, { ...init, headers }), { params });
      trace.push({ endpoint, status: response.status, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
      return response;
    }
    throw new Error(`Unmatched fixture route: ${init?.method} ${url.pathname}`);
  } });
  const review = new ReviewService(new D1DocumentRepository(db as unknown as D1Database, materialsClock, id), new DocumentStorage(bucket));
  return {
    db, bucket, trace, client: clientFor(), clientFor,
    restart() { runtime = freshRuntime(); },
    async deliver(doc: DocumentEndpointResponse<"createDocument">, items: DocumentCandidate[], providerPolicyId = KIMI_SOURCE_MENTIONS_POLICY_ID) {
      const consentId = id(), jobId = id();
      db.database.prepare("INSERT INTO document_processing_consents VALUES(?,?,?,?,?,'analysis','2026.11.1',?,0,0,NULL)")
        .run("owner-a", consentId, doc.textVersionId, doc.documentId, doc.documentVersionId, providerPolicyId);
      db.database.prepare("INSERT INTO document_jobs(owner_id,id,text_version_id,document_id,document_version_id,consent_id,generation,document_revision,revision,state,dispatch_state,execution_slot,queued_at,queue_expires_at,provider_policy_id,price_version,policy_version,reservation_id,updated_at) VALUES(?,?,?,?,?,?,0,?,0,'running','settled',NULL,0,1,?,'2026.11.1','2026.11.1',?,0)")
        .run("owner-a", jobId, doc.textVersionId, doc.documentId, doc.documentVersionId, consentId, doc.revision, providerPolicyId, id());
      return review.acceptAiExtraction("owner-a", { ...doc, jobId, generation: 0, documentRevision: doc.revision, consentId,
        candidate: { schemaVersion: "2026.11.1", items } });
    },
    dispose() { db.close(); },
  };
}
