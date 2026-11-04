import { env } from "cloudflare:workers";
import { detachAdoptedMaterial } from "./detach-adopted-material";
import { documentEndpointContracts, type DocumentEndpoint, type DocumentEndpointRequest, type DocumentEndpointResponse } from "../../contracts/documents-api";
import { documentCapabilitiesSchema, type DocumentCapabilities } from "../../contracts/document-capabilities";
import { documentRuntimePolicy } from "./runtime-policy";
import { createDocumentServices, DocumentService } from "./service";
import { D1DocumentRepository, DocumentServiceError } from "./d1-repository";
import { DocumentStorage, type DocumentBucket } from "./storage";
import { ReviewService } from "./review-service";
import { DeletionService } from "./deletion-service";
import { DocumentConsentService } from "./consent-service";
import { DocumentJobService } from "./job-service";
import { createDocumentSiteHandler, D1DocumentNonceStore, DocumentExecutorBridge, type DocumentServiceBinding } from "./executor-bridge";

import { MaterialContextService } from "./context-builder";
import { PlanningSourceResolver } from "../planning/source-resolver";
import { D1PlanningRepository } from "../planning/d1-planning-repository";
import { PlanningService } from "../planning/service";
import { BuiltinIntelligenceRepository } from "../intelligence/builtin-repository";
import { IntelligenceService } from "../intelligence/service";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { D1PlanningReplayPackageReader, D1ResearchRepository } from "../research/d1-repository";
import { requireArcUser } from "../auth/session";
import { D1RateLimiter } from "../http/rate-limit";
import type { DocumentRouteDependencies } from "../http/document-route-factories";

export type DocumentEnvironment = Readonly<Record<string, unknown>> & {
  DB?: D1Database; DOCUMENT_ASSETS?: DocumentBucket; DOCUMENT_EXECUTOR?: DocumentServiceBinding;
  ARC_DOCUMENT_BRIDGE_SECRET?: string; ARC_DOCUMENT_PROVIDER_QUALIFICATION?: string; BETTER_AUTH_URL?: string;
};
type EndpointHandlers = { [K in DocumentEndpoint]: (ownerId: string, input: DocumentEndpointRequest<K>) => Promise<DocumentEndpointResponse<K>> };
export { documentRuntimePolicy } from "./runtime-policy";
export function createDocumentSourceResolver(db: D1Database) {
  return new PlanningSourceResolver({ intelligence: new IntelligenceService(new BuiltinIntelligenceRepository()), flagshipRegistry: flagshipUnitRegistry,
    researchRepository: new D1ResearchRepository(db), replayPackageReader: new D1PlanningReplayPackageReader(db) });
}
export function createDocumentRuntime(environment: DocumentEnvironment, options: { now?: () => Date; createId?: () => string; sourceResolver?: PlanningSourceResolver } = {}) {
  const { DB: db, DOCUMENT_ASSETS: bucket } = environment;
  if (!db || !bucket) throw new DocumentServiceError("unavailable");
  const now = options.now ?? (() => new Date()); const state = documentRuntimePolicy(environment); const { policy } = state;
  const repo = new D1DocumentRepository(db, now, options.createId); const storage = new DocumentStorage(bucket); const review = new ReviewService(repo, storage);
  const bridge = environment.DOCUMENT_EXECUTOR && environment.ARC_DOCUMENT_BRIDGE_SECRET ? new DocumentExecutorBridge({ binding: environment.DOCUMENT_EXECUTOR, secret: environment.ARC_DOCUMENT_BRIDGE_SECRET, now: () => now().getTime() }) : undefined;
  const analysisAvailable=()=>state.analysisAvailable(()=>now().getTime(),bridge);
  const jobs = new DocumentJobService({ ...state, analysisAvailable, db, now: () => now().getTime(), bridge,
    loadInput: async job => {
      const stored = await repo.version(job.owner_id, job.document_id, job.document_version_id, job.text_version_id);
      return { textVersionId: stored.version.textVersionId, text: await storage.read(stored.objectKey), segments: stored.segments,
        kind: stored.document.kind, providerPolicyId: job.provider_policy_id, outputSchemaVersion: "2026.11.1" };
    }, activateResult: (ownerId, result) => review.acceptAiExtraction(ownerId, result),
  });
  const consent = new DocumentConsentService({ db, policy, analysisAvailable, now: () => now().getTime(), onRevoke: async (ownerId,consentId) => { await jobs.notifyConsentCancellation(ownerId,consentId); } });
  const services = createDocumentServices({ db, bucket, clock: now, id: options.createId, deletionPort: jobs });
  const deletion = new DeletionService(repo, storage, jobs); const documents = new DocumentService(repo, storage);
  const sourceResolver = options.sourceResolver ?? createDocumentSourceResolver(db); const planningRepository = new D1PlanningRepository(db, { sourceResolver, allowMaterialAcceptance: policy.planningEnabled });
  const contexts = new MaterialContextService({ db, sourceResolver, planningRepository, now, createId: options.createId });
  const planning = new PlanningService({ repository: planningRepository, sourceResolver, ...(policy.planningEnabled ? { materials: contexts } : {}) });
  const handlers: EndpointHandlers = {
    listDocuments: (ownerId, input) => services.listDocuments({ ownerId }, input),
    createDocument: (ownerId, input) => services.createDocument({ ownerId }, input),
    readDocument: (ownerId, input) => services.readDocument({ ownerId }, input),
    createDocumentVersion: (ownerId, input) => services.createDocumentVersion({ ownerId }, input),
    readDocumentReviewDraft: (ownerId, input) => services.readDocumentReviewDraft({ ownerId }, input),
    saveDocumentReviewDraft: (ownerId, input) => services.saveDocumentReviewDraft({ ownerId }, input),
    createDocumentConfirmation: (ownerId, input) => services.createDocumentConfirmation({ ownerId }, input),
    createMaterialSelection: (ownerId, input) => services.createMaterialSelection({ ownerId }, input),
    readMaterialSelection: (ownerId, input) => services.readMaterialSelection({ ownerId }, input),
    readAdoptedMaterials: (ownerId, input) => services.readAdoptedMaterials({ ownerId }, input),
    detachAdoptedMaterial: (ownerId, input) => detachAdoptedMaterial(repo, planning, ownerId, input),
    updateMaterialSelection: (ownerId, input) => services.updateMaterialSelection({ ownerId }, input),
    createDocumentConsent: (ownerId, input) => consent.create(ownerId, input),
    revokeDocumentConsent: (ownerId, input) => consent.revoke(ownerId, input),
    createDocumentJob: (ownerId, input) => jobs.create(ownerId, input),
    readDocumentJob: (ownerId, input) => jobs.read(ownerId, input),
    cancelDocumentJob: (ownerId, input) => jobs.cancel(ownerId, input),
    createMaterialContext: (ownerId, input) => contexts.create(ownerId, input),
    readMaterialContext: (ownerId, input) => contexts.read(ownerId, input.contextVersionId),
    generatePlanning: (ownerId, input) => planning.generateResponse(ownerId, input),
    materialReplan: (ownerId, input) => planning.proposeMaterialReplanResponse(ownerId, input),
    readMaterialHistory: (ownerId, input) => contexts.history(ownerId, input.goalId),
    readMaterialGenerationReceipt: (ownerId, input) => contexts.generationReceipt(ownerId, input),
    deleteDocument: (ownerId, input) => services.deleteDocument({ ownerId }, input),
    readDocumentDeletion: (ownerId, input) => services.readDocumentDeletion({ ownerId }, input),
    readDocumentMutation: (ownerId, input) => services.readDocumentMutation({ ownerId }, input),
    readDocumentExtraction: (ownerId, input) => services.readDocumentExtraction({ ownerId }, input),
    adoptDocumentExtraction: (ownerId, input) => services.adoptDocumentExtraction({ ownerId }, input),
    readDocumentCapabilities: async ownerId => {
      const existing = await repo.one("SELECT 1 FROM documents WHERE owner_id=? AND lifecycle<>'deleted' LIMIT 1", ownerId);
      const analysisEnabled = await analysisAvailable();
      const analysis = analysisEnabled ? policy.analysis : null;
      const kimiNotice = analysis?.endpoint === "https://openrouter.ai/api/v1/chat/completions"
        && analysis.model === "moonshotai/kimi-k3.1-pro" && analysis.routingPolicy.providerOrder[0] === "moonshotai/mxfp4";
      return documentCapabilitiesSchema.parse({ documentsEnabled: policy.documentsEnabled, analysisEnabled, planningEnabled: policy.planningEnabled,
        hasDocuments: Boolean(existing), providerLabel: analysis?.provider ?? null, providerPolicyId: analysis?.providerPolicyId ?? null,
        policyVersion: analysis?.routingPolicy.policyVersion ?? null, ...(kimiNotice ? { privacyNotice: "kimi-k31-pro-zdr" } : {}), reason: analysisEnabled ? "ready" : state.unavailableReason });
    },
  };
  return {
    jobs, contexts, planning,
    async invoke<K extends DocumentEndpoint>(ownerId: string, endpoint: K, raw: DocumentEndpointRequest<K>): Promise<DocumentEndpointResponse<K>> {
      const input = documentEndpointContracts[endpoint].request.parse(raw) as DocumentEndpointRequest<K>;
      const newDocumentWrites: DocumentEndpoint[] = ["createDocument", "createDocumentVersion", "createMaterialSelection", "updateMaterialSelection"];
      if ((!policy.documentsEnabled && newDocumentWrites.includes(endpoint)) || (!policy.planningEnabled && ["createMaterialContext", "materialReplan"].includes(endpoint))) throw new DocumentServiceError("unavailable");
      const handler = handlers[endpoint] as (owner: string, args: DocumentEndpointRequest<K>) => Promise<DocumentEndpointResponse<K>>;
      return handler(ownerId, input);
    },
    async maintenance() { await jobs.maintenance(10); await documents.reclaimStorage(10); await deletion.maintain(10); },
    privateHandler: createDocumentSiteHandler(jobs, { secret: environment.ARC_DOCUMENT_BRIDGE_SECRET ?? "", nonceStore: new D1DocumentNonceStore(db), now: () => now().getTime() }),
  };
}
const disabledCapabilities: DocumentCapabilities = { documentsEnabled: false, analysisEnabled: false, planningEnabled: false, hasDocuments: false, providerLabel: null, providerPolicyId: null, policyVersion: null, reason: "disabled" };
export const productionDocumentRouteDependencies: DocumentRouteDependencies = {
  requireUser: requireArcUser,
  configuredOrigin: () => typeof env.BETTER_AUTH_URL === "string" ? env.BETTER_AUTH_URL : null,
  createService: () => ({ invoke: async (ownerId, endpoint, input) => {
    const bindings = env as unknown as DocumentEnvironment;
    if (endpoint === "readDocumentCapabilities" && (!bindings.DB || !bindings.DOCUMENT_ASSETS)) return disabledCapabilities;
    try { return await createDocumentRuntime(bindings).invoke(ownerId, endpoint, input); }
    catch (error) { if (endpoint === "readDocumentCapabilities") return disabledCapabilities; throw error; }
  } }),
  rateLimiter: { reserve: input => { if (!env.DB) throw new DocumentServiceError("unavailable"); return new D1RateLimiter(env.DB as D1Database).reserve(input); } },
};
