import { z } from "zod";
import {
  createProofRequestSchema,
  proofLedgerMutationResultSchema,
  proofLedgerWorkspaceSchema,
  PROOF_LEDGER_SCHEMA_VERSION,
  reviseProofRequestSchema,
  setProofVisibilityRequestSchema,
  withdrawProofRequestSchema,
  type CreateProofRequest,
  type ProofLedgerMutationResult,
  type ProofLedgerWorkspace,
  type ProofReviewEvent,
  type ProofVersion,
  type ReviseProofRequest,
  type SetProofVisibilityRequest,
  type WithdrawProofRequest,
} from "../../contracts/proof-ledger";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { projectSkillEvidence } from "./projection";

export const PROOF_LEDGER_STORAGE_KEY = "arc-proof-ledger-v1";
export const PROOF_LEDGER_QUARANTINE_KEY = "arc-proof-ledger-v1:quarantine";
export const LOCAL_PROOF_ENVELOPE_MAX_BYTES = 4 * 1024 * 1024;

const idSchema = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const mutationResultEntrySchema = z.object({
  mutationId: idSchema,
  result: proofLedgerMutationResultSchema,
}).strict();

export const localProofEnvelopeSchema = z.object({
  schemaVersion: z.literal(PROOF_LEDGER_SCHEMA_VERSION),
  workspace: proofLedgerWorkspaceSchema.nullable(),
  mutationResults: z.array(mutationResultEntrySchema).max(64),
}).strict().superRefine((envelope, context) => {
  if (serializedBytes(envelope) > LOCAL_PROOF_ENVELOPE_MAX_BYTES) {
    context.addIssue({ code: "custom", message: "Local proof envelope exceeds the byte budget" });
  }
  const mutationIds = envelope.mutationResults.map(({ mutationId }) => mutationId);
  if (new Set(mutationIds).size !== mutationIds.length) {
    context.addIssue({
      code: "custom",
      path: ["mutationResults"],
      message: "Mutation result IDs must be unique",
    });
  }
});

export type LocalProofEnvelope = z.infer<typeof localProofEnvelopeSchema>;
export type LocalProofRepositoryErrorCode =
  | "INVALID_INPUT"
  | "CONFLICT"
  | "NOT_FOUND"
  | "PROOF_UNAVAILABLE";

export class LocalProofRepositoryError extends Error {
  constructor(readonly code: LocalProofRepositoryErrorCode) {
    super(messageFor(code));
    this.name = "LocalProofRepositoryError";
  }
}

export interface LocalProofRepository {
  load(): Promise<ProofLedgerWorkspace | null>;
  createProof(request: CreateProofRequest): Promise<ProofLedgerMutationResult>;
  reviseProof(proofId: string, request: ReviseProofRequest): Promise<ProofLedgerMutationResult>;
  withdrawProof(proofId: string, request: WithdrawProofRequest): Promise<ProofLedgerMutationResult>;
  setVisibility(proofId: string, request: SetProofVisibilityRequest): Promise<ProofLedgerMutationResult>;
}

export function createLocalProofRepository(options: {
  storage?: Storage;
  goalId?: string;
  createId?: () => string;
  now?: () => Date;
} = {}): LocalProofRepository {
  const storage = options.storage ?? resolveStorage();
  const goalId = idSchema.parse(options.goalId ?? "guest-goal");
  const createId = options.createId ?? (() => `proof-${crypto.randomUUID()}`);
  const now = options.now ?? (() => new Date());

  return {
    async load() {
      if (!storage) return null;
      const stored = readEnvelope(storage);
      if (stored.kind === "absent") return null;
      if (stored.kind === "invalid") {
        quarantine(storage, stored.raw);
        return null;
      }
      return stored.envelope.workspace ? cloneWorkspace(stored.envelope.workspace) : null;
    },

    async createProof(input) {
      const request = parseInput(createProofRequestSchema, input);
      validateLocalSubmission(request);
      const context = envelopeForWrite(storage);
      const replay = replayMutation(context.envelope, request.mutationId);
      if (replay) return replay;
      const currentRevision = context.envelope.workspace?.revision ?? 0;
      if (request.baseRevision !== currentRevision) throw new LocalProofRepositoryError("CONFLICT");

      const occurredAt = now().toISOString();
      const workspaceId = context.envelope.workspace?.id ?? parseGeneratedId(createId());
      const proofId = parseGeneratedId(createId());
      const versionId = parseGeneratedId(createId());
      const version = {
        id: versionId,
        proofId,
        versionNumber: 1,
        schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
        dailyUnitId: request.dailyUnitId,
        title: request.title,
        kind: request.kind,
        summary: request.summary,
        artifactUrl: request.artifactUrl,
        assetId: request.assetId,
        skillIds: request.skillIds,
        completionCriteria: request.completionCriteria,
        visibility: request.visibility,
        createdAt: occurredAt,
        supersedesVersionId: null,
      } as const;
      const transition = reviewsForRequest({
        request,
        proofId,
        versionId,
        startSequence: 1,
        createId,
        occurredAt,
      });
      const versions = [...(context.envelope.workspace?.versions ?? []), version];
      const allReviews = [...(context.envelope.workspace?.reviews ?? []), ...transition.reviews];
      const workspace = proofLedgerWorkspaceSchema.parse({
        id: workspaceId,
        goalId,
        schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
        revision: currentRevision + 1,
        versions,
        reviews: allReviews,
        projections: projectBothAudiences(versions, allReviews),
      });
      const result = proofLedgerMutationResultSchema.parse({ outcome: transition.outcome, workspace });
      persistResult(storage, context, request.mutationId, result);
      return cloneResult(result);
    },

    async reviseProof(proofIdInput, input) {
      const proofId = parseGeneratedId(proofIdInput);
      const request = parseInput(reviseProofRequestSchema, input);
      validateLocalSubmission(request);
      const context = envelopeForWrite(storage);
      const replay = replayMutation(context.envelope, request.mutationId);
      if (replay) return replay;
      const current = context.envelope.workspace;
      if (!current) throw new LocalProofRepositoryError("NOT_FOUND");
      if (request.baseRevision !== current.revision) throw new LocalProofRepositoryError("CONFLICT");
      const previous = latestVersion(current, proofId);
      const occurredAt = now().toISOString();
      const versionId = parseGeneratedId(createId());
      const superseded: ProofReviewEvent = {
        id: parseGeneratedId(createId()),
        proofId,
        versionId: previous.id,
        sequence: nextProofSequence(current, proofId),
        mutationId: request.mutationId,
        kind: "superseded",
        stateAfter: "superseded",
        visibilityAfter: terminalReview(current, proofId, previous.id)?.visibilityAfter
          ?? previous.visibility,
        validatorKey: null,
        outcome: null,
        reasonCodes: [],
        occurredAt,
      };
      const version: ProofVersion = {
        id: versionId,
        proofId,
        versionNumber: previous.versionNumber + 1,
        schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
        dailyUnitId: request.dailyUnitId,
        title: request.title,
        kind: request.kind,
        summary: request.summary,
        artifactUrl: request.artifactUrl,
        assetId: request.assetId,
        skillIds: request.skillIds,
        completionCriteria: request.completionCriteria,
        visibility: request.visibility,
        createdAt: occurredAt,
        supersedesVersionId: previous.id,
      };
      const transition = reviewsForRequest({
        request,
        proofId,
        versionId,
        startSequence: superseded.sequence + 1,
        createId,
        occurredAt,
      });
      const versions = [...current.versions, version];
      const reviews = [...current.reviews, superseded, ...transition.reviews];
      const workspace = proofLedgerWorkspaceSchema.parse({
        ...current,
        revision: current.revision + 1,
        versions,
        reviews,
        projections: projectBothAudiences(versions, reviews),
      });
      const result = proofLedgerMutationResultSchema.parse({
        outcome: transition.outcome,
        workspace,
      });
      persistResult(storage, context, request.mutationId, result);
      return cloneResult(result);
    },

    async withdrawProof(proofIdInput, input) {
      const proofId = parseGeneratedId(proofIdInput);
      const request = parseInput(withdrawProofRequestSchema, input);
      const context = envelopeForWrite(storage);
      const replay = replayMutation(context.envelope, request.mutationId);
      if (replay) return replay;
      const current = context.envelope.workspace;
      if (!current) throw new LocalProofRepositoryError("NOT_FOUND");
      if (request.baseRevision !== current.revision) throw new LocalProofRepositoryError("CONFLICT");
      const version = latestVersion(current, proofId);
      const terminal = terminalReview(current, proofId, version.id);
      if (!terminal) throw new LocalProofRepositoryError("NOT_FOUND");
      const reviews = [...current.reviews, {
        id: parseGeneratedId(createId()),
        proofId,
        versionId: version.id,
        sequence: nextProofSequence(current, proofId),
        mutationId: request.mutationId,
        kind: "withdrawn" as const,
        stateAfter: "withdrawn" as const,
        visibilityAfter: terminal.visibilityAfter,
        validatorKey: null,
        outcome: null,
        reasonCodes: [],
        occurredAt: now().toISOString(),
      }];
      const workspace = proofLedgerWorkspaceSchema.parse({
        ...current,
        revision: current.revision + 1,
        reviews,
        projections: projectBothAudiences(current.versions, reviews),
      });
      const result = proofLedgerMutationResultSchema.parse({ outcome: "withdrawn", workspace });
      persistResult(storage, context, request.mutationId, result);
      return cloneResult(result);
    },

    async setVisibility(proofIdInput, input) {
      const proofId = parseGeneratedId(proofIdInput);
      const request = parseInput(setProofVisibilityRequestSchema, input);
      const context = envelopeForWrite(storage);
      const replay = replayMutation(context.envelope, request.mutationId);
      if (replay) return replay;
      const current = context.envelope.workspace;
      if (!current) throw new LocalProofRepositoryError("NOT_FOUND");
      if (request.baseRevision !== current.revision) throw new LocalProofRepositoryError("CONFLICT");
      const version = latestVersion(current, proofId);
      const terminal = terminalReview(current, proofId, version.id);
      if (!terminal) throw new LocalProofRepositoryError("NOT_FOUND");
      const occurredAt = now().toISOString();
      const reviews = [...current.reviews, {
        id: parseGeneratedId(createId()),
        proofId,
        versionId: version.id,
        sequence: nextProofSequence(current, proofId),
        mutationId: request.mutationId,
        kind: "visibility_changed" as const,
        stateAfter: terminal.stateAfter,
        visibilityAfter: request.visibility,
        validatorKey: null,
        outcome: null,
        reasonCodes: [],
        occurredAt,
      }];
      const workspace = proofLedgerWorkspaceSchema.parse({
        ...current,
        revision: current.revision + 1,
        reviews,
        projections: projectBothAudiences(current.versions, reviews),
      });
      const result = proofLedgerMutationResultSchema.parse({ outcome: "updated", workspace });
      persistResult(storage, context, request.mutationId, result);
      return cloneResult(result);
    },
  };
}

type ProofMutationRequest = CreateProofRequest | ReviseProofRequest;

function validateLocalSubmission(request: ProofMutationRequest) {
  if (request.intent !== "submit") return;
  if (request.kind !== "reflection" && request.artifactUrl === null) {
    throw new LocalProofRepositoryError("INVALID_INPUT");
  }
}

function reviewsForRequest(input: {
  request: ProofMutationRequest;
  proofId: string;
  versionId: string;
  startSequence: number;
  createId: () => string;
  occurredAt: string;
}): { outcome: "draft" | "demonstrated"; reviews: ProofReviewEvent[] } {
  const { request, proofId, versionId, startSequence, createId, occurredAt } = input;
  if (request.intent === "save_draft") {
    return {
      outcome: "draft",
      reviews: [{
        id: parseGeneratedId(createId()),
        proofId,
        versionId,
        sequence: startSequence,
        mutationId: request.mutationId,
        kind: "drafted",
        stateAfter: "draft",
        visibilityAfter: request.visibility,
        validatorKey: null,
        outcome: null,
        reasonCodes: [],
        occurredAt,
      }],
    };
  }

  const reviews: ProofReviewEvent[] = [{
    id: parseGeneratedId(createId()),
    proofId,
    versionId,
    sequence: startSequence,
    mutationId: request.mutationId,
    kind: "submitted",
    stateAfter: "pending_review",
    visibilityAfter: request.visibility,
    validatorKey: null,
    outcome: null,
    reasonCodes: [],
    occurredAt,
  }, {
    id: parseGeneratedId(createId()),
    proofId,
    versionId,
    sequence: startSequence + 1,
    mutationId: request.mutationId,
    kind: "structural_passed",
    stateAfter: "demonstrated",
    visibilityAfter: request.visibility,
    validatorKey: null,
    outcome: "passed",
    reasonCodes: [],
    occurredAt,
  }];
  if (request.validatorKey !== null) {
    reviews.push({
      id: parseGeneratedId(createId()),
      proofId,
      versionId,
      sequence: startSequence + 2,
      mutationId: request.mutationId,
      kind: "validator_unavailable",
      stateAfter: "demonstrated",
      visibilityAfter: request.visibility,
      validatorKey: request.validatorKey,
      outcome: "unavailable",
      reasonCodes: ["validator-unavailable-locally"],
      occurredAt,
    });
  }
  return { outcome: "demonstrated", reviews };
}

function projectBothAudiences(
  versions: readonly ProofVersion[],
  reviews: readonly ProofReviewEvent[],
) {
  const skillIds = flagshipBlueprint.skills.map(({ id }) => id);
  return (["internal", "public"] as const).flatMap((visibility) => projectSkillEvidence({
    skillIds,
    completedSkillIds: new Set(),
    versions,
    reviews,
    visibility,
  }));
}

type StoredEnvelope =
  | { kind: "absent" }
  | { kind: "invalid"; raw: string }
  | { kind: "valid"; raw: string; envelope: LocalProofEnvelope };

function readEnvelope(storage: Storage): StoredEnvelope {
  const raw = storage.getItem(PROOF_LEDGER_STORAGE_KEY);
  if (raw === null) return { kind: "absent" };
  try {
    const parsed = localProofEnvelopeSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success
      ? { kind: "valid", raw, envelope: parsed.data }
      : { kind: "invalid", raw };
  } catch {
    return { kind: "invalid", raw };
  }
}

function envelopeForWrite(storage: Storage | undefined): {
  raw: string | null;
  envelope: LocalProofEnvelope;
} {
  if (!storage) throw new LocalProofRepositoryError("PROOF_UNAVAILABLE");
  const stored = readEnvelope(storage);
  if (stored.kind === "invalid") throw new LocalProofRepositoryError("PROOF_UNAVAILABLE");
  if (stored.kind === "valid") return { raw: stored.raw, envelope: stored.envelope };
  return {
    raw: null,
    envelope: {
      schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
      workspace: null,
      mutationResults: [],
    },
  };
}

function persistResult(
  storage: Storage | undefined,
  context: { raw: string | null; envelope: LocalProofEnvelope },
  mutationId: string,
  result: ProofLedgerMutationResult,
) {
  if (!storage) throw new LocalProofRepositoryError("PROOF_UNAVAILABLE");
  if (storage.getItem(PROOF_LEDGER_STORAGE_KEY) !== context.raw) {
    throw new LocalProofRepositoryError("CONFLICT");
  }
  const envelope = localProofEnvelopeSchema.parse({
    schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
    workspace: result.workspace,
    mutationResults: [...context.envelope.mutationResults, { mutationId, result }].slice(-64),
  });
  try { storage.setItem(PROOF_LEDGER_STORAGE_KEY, JSON.stringify(envelope)); }
  catch { throw new LocalProofRepositoryError("PROOF_UNAVAILABLE"); }
}

function replayMutation(
  envelope: LocalProofEnvelope,
  mutationId: string,
): ProofLedgerMutationResult | null {
  const replay = envelope.mutationResults.find((entry) => entry.mutationId === mutationId);
  return replay ? cloneResult(replay.result) : null;
}

function latestVersion(workspace: ProofLedgerWorkspace, proofId: string) {
  const versions = workspace.versions.filter((version) => version.proofId === proofId)
    .sort((left, right) => right.versionNumber - left.versionNumber);
  const version = versions[0];
  if (!version) throw new LocalProofRepositoryError("NOT_FOUND");
  return version;
}

function terminalReview(workspace: ProofLedgerWorkspace, proofId: string, versionId: string) {
  return workspace.reviews.filter((review) => review.proofId === proofId && review.versionId === versionId)
    .sort((left, right) => right.sequence - left.sequence)[0] ?? null;
}

function nextProofSequence(workspace: ProofLedgerWorkspace, proofId: string): number {
  return workspace.reviews.reduce(
    (maximum, review) => review.proofId === proofId ? Math.max(maximum, review.sequence) : maximum,
    0,
  ) + 1;
}

function quarantine(storage: Storage, raw: string) {
  try {
    storage.setItem(PROOF_LEDGER_QUARANTINE_KEY, raw);
    if (storage.getItem(PROOF_LEDGER_QUARANTINE_KEY) === raw) {
      storage.removeItem(PROOF_LEDGER_STORAGE_KEY);
    }
  } catch {
    // Leave the original bytes untouched when quarantine storage is unavailable.
  }
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch { throw new LocalProofRepositoryError("INVALID_INPUT"); }
}

function parseGeneratedId(value: string): string {
  try { return idSchema.parse(value); }
  catch { throw new LocalProofRepositoryError("PROOF_UNAVAILABLE"); }
}

function resolveStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function cloneWorkspace(workspace: ProofLedgerWorkspace): ProofLedgerWorkspace {
  return proofLedgerWorkspaceSchema.parse(JSON.parse(JSON.stringify(workspace)) as unknown);
}

function cloneResult(result: ProofLedgerMutationResult): ProofLedgerMutationResult {
  return proofLedgerMutationResultSchema.parse(JSON.parse(JSON.stringify(result)) as unknown);
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function messageFor(code: LocalProofRepositoryErrorCode): string {
  if (code === "INVALID_INPUT") return "Proof input is invalid.";
  if (code === "CONFLICT") return "Proof state changed. Refresh and try again.";
  if (code === "NOT_FOUND") return "Proof was not found.";
  return "Proof storage is unavailable.";
}
