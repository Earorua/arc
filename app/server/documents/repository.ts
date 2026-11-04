import type {
  Document, DocumentConfirmation, DocumentReviewDraft, DocumentVersion,
  MaterialReferenceContext, MaterialScope, MaterialSelection, MaterialSelectionRef,
} from "../../contracts/documents";
import type { DocumentEndpointRequest, DocumentMutationIdentity } from "../../contracts/documents-api";
import type { ContextInputSnapshot } from "../../contracts/material-planning";
import type { PlanningSourceReference } from "../../contracts/planning";
import type { SavePlanningEventCommand, SavePlanningGenerationCommand } from "../planning/repository";

/** Phase-0 contract only: no storage adapter, binding, HTTP route or migration. */
export type DocumentOwner = Readonly<{ ownerId: string }>;
export type DocumentVersionKey = DocumentOwner & Readonly<{
  documentId: string; documentVersionId: string; textVersionId: string;
}>;
export type DocumentMutationCommand<T> = DocumentOwner & Readonly<{
  mutation: DocumentMutationIdentity;
  request: T;
}>;

/** Private records are never serialized into public planning events or mutation receipts. */
export type PrivateDocumentVersion = Readonly<{
  document: Document;
  version: DocumentVersion;
  reference: MaterialReferenceContext;
}>;
export type MaterialContextRecord = DocumentOwner & Readonly<{
  id: string;
  snapshot: ContextInputSnapshot;
  fingerprint: string;
  state: "active" | "revoked";
  expiresAt: string;
}>;
export type DocumentMutationReceipt<TIdentity = DocumentMutationIdentity> = Readonly<{
  identity: TIdentity;
  resultIds: readonly string[];
  revision: number;
}>;

/** Expected values, not caller-provided authorization flags. Re-read inside the commit batch. */
export type MaterialCommitFence = DocumentOwner & Readonly<{
  selectionRef: MaterialSelectionRef;
  contextVersionId: string;
  contextFingerprint: string;
  scope: MaterialScope;
  dependencies: ContextInputSnapshot["dependencies"];
  sourceReference: PlanningSourceReference;
  sourceFingerprint: string;
  sourceExpiresAt: string | null;
  inputsFingerprint: string;
  checkedAt: string;
}>;
export type MaterialProposalSidecar = DocumentOwner & Readonly<{
  goalId: string;
  workspaceId: string;
  candidateId: string;
  activeBasePlanId: string;
  inputRevision: number;
  proposalRevision: number;
  contextVersionId: string;
  contextFingerprint: string;
}>;
// Existing accept route keeps a distinct receipt namespace; no new public endpoint is added.
export type MaterialAcceptMutationIdentity = Omit<DocumentMutationIdentity, "endpoint"> & Readonly<{
  endpoint: "POST /api/planning/replans/accept";
}>;
export type MaterialPlanningMutationIdentity = DocumentMutationIdentity | MaterialAcceptMutationIdentity;

/**
 * Existing planning writes and these private links must share ONE application-D1 batch.
 * A failed final guard rolls back the result, goal activation, binding, usage and receipt.
 * Implement this boundary in the planning adapter in phase 1, never as a second save call.
 */
export type MaterialPlanningCommit =
  | Readonly<{ kind: "generation"; planning: SavePlanningGenerationCommand; fence: MaterialCommitFence; mutation: DocumentMutationIdentity }>
  | Readonly<{ kind: "proposal"; planning: SavePlanningEventCommand; fence: MaterialCommitFence; sidecar: MaterialProposalSidecar; mutation: DocumentMutationIdentity }>
  | Readonly<{ kind: "accept"; planning: SavePlanningEventCommand; fence: MaterialCommitFence; sidecar: MaterialProposalSidecar; mutation: MaterialAcceptMutationIdentity }>;

export interface MaterialPlanningCommitRepository {
  commit(command: MaterialPlanningCommit): Promise<DocumentMutationReceipt<MaterialPlanningMutationIdentity>>;
  // Re-read dependencies even for an existing receipt; revoked material cannot be replayed.
  findActiveMutation(identity: MaterialPlanningMutationIdentity): Promise<DocumentMutationReceipt<MaterialPlanningMutationIdentity> | null>;
}

export type DocumentStorageIntent = DocumentVersionKey & Readonly<{
  id: string; objectKey: string; expectedGeneration: number; expectedRevision: number;
  bytes: number; codePoints: number; textDigest: string;
}>;
export type DocumentDeletionRecord = DocumentOwner & Readonly<{
  id: string; documentId: string; generation: number;
  state: "revoked" | "cleaning" | "failed" | "completed";
  pendingOperationIds: readonly string[];
  errorCode: "cleanup-failed" | "storage-unavailable" | null;
}>;

/** All owner IDs come from the session or authenticated internal service, not request JSON. */
export interface DocumentRepository {
  findVersion(key: DocumentVersionKey): Promise<PrivateDocumentVersion | null>;
  findReviewDraft(key: DocumentVersionKey): Promise<DocumentReviewDraft | null>;
  saveReviewDraft(command: DocumentMutationCommand<DocumentEndpointRequest<"saveDocumentReviewDraft">>): Promise<DocumentReviewDraft>;
  appendConfirmation(command: DocumentMutationCommand<DocumentEndpointRequest<"createDocumentConfirmation">>): Promise<DocumentConfirmation>;
  findSelection(key: DocumentOwner & Readonly<{ selectionId: string }>): Promise<MaterialSelection | null>;
  createSelection(command: DocumentMutationCommand<DocumentEndpointRequest<"createMaterialSelection">>): Promise<MaterialSelection>;
  updateSelection(command: DocumentMutationCommand<DocumentEndpointRequest<"updateMaterialSelection">>): Promise<MaterialSelection>;
  findContext(key: DocumentOwner & Readonly<{ contextVersionId: string }>): Promise<MaterialContextRecord | null>;

  // Register intent/quota before R2 write. Activation CAS failure queues object reclamation.
  reserveStorageIntent(command: DocumentMutationCommand<DocumentStorageIntent>): Promise<void>;
  activateStoredVersion(key: DocumentOwner & Readonly<{ intentId: string; expectedGeneration: number; expectedRevision: number }>): Promise<DocumentMutationReceipt>;
  queueStorageReclamation(key: DocumentOwner & Readonly<{ intentId: string }>): Promise<void>;

  // Atomically bump generation, revoke consent/context/confirmation and record cleanup first.
  revokeAndQueueDeletion(command: DocumentMutationCommand<DocumentEndpointRequest<"deleteDocument">>): Promise<DocumentDeletionRecord>;
  findDeletion(key: DocumentOwner & Readonly<{ deletionJobId: string }>): Promise<DocumentDeletionRecord | null>;
  // A phase-1 reconciler proves terminated writers AND absent objects; lease expiry is insufficient.
  reconcileDeletion(key: DocumentOwner & Readonly<{ deletionJobId: string; generation: number }>): Promise<DocumentDeletionRecord>;
}
