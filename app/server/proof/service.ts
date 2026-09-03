import { z } from "zod";
import type { RoleBlueprint } from "../../contracts/intelligence";
import {
  createProofRequestSchema,
  proofLedgerMutationResultSchema,
  proofLedgerWorkspaceSchema,
  reviseProofRequestSchema,
  setProofVisibilityRequestSchema,
  withdrawProofRequestSchema,
  PROOF_LEDGER_SCHEMA_VERSION,
  type CreateProofRequest,
  type ProofLedgerMutationResult,
  type ProofLedgerWorkspace,
  type ProofReviewEvent,
  type ProofVersion,
  type ReviseProofRequest,
} from "../../contracts/proof-ledger";
import type { PlanningSourceContext, UnitRegistry } from "../../contracts/planning";
import type { PlanningRepository } from "../planning/repository";
import type { PlanningSourceResolver } from "../planning/source-resolver";
import { projectSkillEvidence } from "../../lib/proof/projection";
import type {
  ProofAssetMetadata,
  ProofOwnerGoal,
  ProofRepository,
} from "./repository";
import {
  ProofRepositoryConflictError,
  ProofRepositoryUnavailableError,
} from "./repository";
import { runDeterministicValidator } from "./validators";

const ownerSchema = z.string().trim().min(1).max(256);
type MutationRequest = CreateProofRequest | ReviseProofRequest;

export type ProofServiceErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";

export class ProofServiceError extends Error {
  constructor(readonly code: ProofServiceErrorCode, readonly issues: readonly string[] = []) {
    super(messageFor(code));
    this.name = "ProofServiceError";
  }
}

type ServiceOptions = {
  repository: ProofRepository;
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
  createId?: () => string;
  now?: () => Date;
  readJsonAsset?: (objectKey: string) => Promise<unknown>;
  planningSource?: {
    repository: Pick<PlanningRepository, "load">;
    resolver: Pick<PlanningSourceResolver, "resolveForReplay">;
  };
};

export class ProofService {
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly readJsonAsset: (objectKey: string) => Promise<unknown>;

  constructor(private readonly dependencies: ServiceOptions) {
    this.createId = dependencies.createId ?? (() => `proof-${crypto.randomUUID()}`);
    this.now = dependencies.now ?? (() => new Date());
    this.readJsonAsset = dependencies.readJsonAsset ?? (async () => { throw new Error("asset reader unavailable"); });
  }

  async getWorkspace(userId: string): Promise<ProofLedgerWorkspace | null> {
    const scope = await this.resolveScope(userId);
    await this.resolveAuthority(scope);
    const workspace = await this.repositoryRead(() => this.dependencies.repository.load(scope));
    return workspace ? this.parseWorkspace(workspace, scope) : null;
  }

  async create(userId: string, input: unknown): Promise<ProofLedgerMutationResult> {
    const request = parseRequest(createProofRequestSchema, input);
    const scope = await this.resolveScope(userId);
    const authority = await this.resolveAuthority(scope);
    const replay = await this.loadReplay(scope, request.mutationId);
    if (replay) return replay;
    const current = await this.repositoryRead(() => this.dependencies.repository.load(scope));
    const workspace = current ? this.parseWorkspace(current, scope) : null;
    if (request.baseRevision !== (workspace?.revision ?? 0)) throw new ProofServiceError("CONFLICT");
    const proofId = this.createId();
    return this.saveVersion(scope, request, workspace, proofId, null, authority);
  }

  async revise(userId: string, proofId: string, input: unknown): Promise<ProofLedgerMutationResult> {
    const request = parseRequest(reviseProofRequestSchema, input);
    const scope = await this.resolveScope(userId);
    const authority = await this.resolveAuthority(scope);
    const replay = await this.loadReplay(scope, request.mutationId);
    if (replay) return replay;
    const workspace = await this.requiredWorkspace(scope);
    if (request.baseRevision !== workspace.revision) throw new ProofServiceError("CONFLICT");
    const previous = latestVersion(workspace, proofId);
    return this.saveVersion(scope, request, workspace, proofId, previous, authority);
  }

  async withdraw(userId: string, proofId: string, input: unknown): Promise<ProofLedgerMutationResult> {
    const request = parseRequest(withdrawProofRequestSchema, input);
    const scope = await this.resolveScope(userId);
    const authority = await this.resolveAuthority(scope);
    const replay = await this.loadReplay(scope, request.mutationId);
    if (replay) return replay;
    const workspace = await this.requiredWorkspace(scope);
    if (request.baseRevision !== workspace.revision) throw new ProofServiceError("CONFLICT");
    const version = latestVersion(workspace, proofId);
    const terminal = terminalReview(workspace, version);
    const review: ProofReviewEvent = {
      id: this.createId(), proofId, versionId: version.id,
      sequence: nextSequence(workspace, proofId), mutationId: request.mutationId,
      kind: "withdrawn", stateAfter: "withdrawn", visibilityAfter: terminal.visibilityAfter,
      validatorKey: null, outcome: null, reasonCodes: [], occurredAt: this.now().toISOString(),
    };
    return this.persist(scope, request.mutationId, request.baseRevision, "withdrawn", {
      ...workspace,
      revision: workspace.revision + 1,
      reviews: [...workspace.reviews, review],
      projections: projections(authority.blueprint, workspace.versions, [...workspace.reviews, review]),
    });
  }

  async setVisibility(userId: string, proofId: string, input: unknown): Promise<ProofLedgerMutationResult> {
    const request = parseRequest(setProofVisibilityRequestSchema, input);
    const scope = await this.resolveScope(userId);
    const authority = await this.resolveAuthority(scope);
    const replay = await this.loadReplay(scope, request.mutationId);
    if (replay) return replay;
    const workspace = await this.requiredWorkspace(scope);
    if (request.baseRevision !== workspace.revision) throw new ProofServiceError("CONFLICT");
    const version = latestVersion(workspace, proofId);
    const terminal = terminalReview(workspace, version);
    const review: ProofReviewEvent = {
      id: this.createId(), proofId, versionId: version.id,
      sequence: nextSequence(workspace, proofId), mutationId: request.mutationId,
      kind: "visibility_changed", stateAfter: terminal.stateAfter, visibilityAfter: request.visibility,
      validatorKey: null, outcome: null, reasonCodes: [], occurredAt: this.now().toISOString(),
    };
    return this.persist(scope, request.mutationId, request.baseRevision, "updated", {
      ...workspace,
      revision: workspace.revision + 1,
      reviews: [...workspace.reviews, review],
      projections: projections(authority.blueprint, workspace.versions, [...workspace.reviews, review]),
    });
  }

  private async saveVersion(
    scope: ProofOwnerGoal,
    request: MutationRequest,
    workspace: ProofLedgerWorkspace | null,
    proofId: string,
    previous: ProofVersion | null,
    authority: PlanningSourceContext,
  ): Promise<ProofLedgerMutationResult> {
    const asset = await this.validateStructure(scope, proofId, request, authority);
    const occurredAt = this.now().toISOString();
    const version: ProofVersion = {
      id: this.createId(), proofId, versionNumber: (previous?.versionNumber ?? 0) + 1,
      schemaVersion: PROOF_LEDGER_SCHEMA_VERSION, dailyUnitId: request.dailyUnitId,
      title: request.title, kind: request.kind, summary: request.summary,
      artifactUrl: request.artifactUrl, assetId: request.assetId, skillIds: request.skillIds,
      completionCriteria: request.completionCriteria, visibility: request.visibility, createdAt: occurredAt,
      supersedesVersionId: previous?.id ?? null,
    };
    const startSequence = workspace ? nextSequence(workspace, proofId) : 1;
    const reviews: ProofReviewEvent[] = [];
    if (previous && workspace) {
      const terminal = terminalReview(workspace, previous);
      reviews.push({
        id: this.createId(), proofId, versionId: previous.id, sequence: startSequence,
        mutationId: request.mutationId, kind: "superseded", stateAfter: "superseded",
        visibilityAfter: terminal.visibilityAfter, validatorKey: null, outcome: null,
        reasonCodes: [], occurredAt,
      });
    }
    const transition = await this.reviewVersion(request, version, asset, startSequence + reviews.length, occurredAt);
    reviews.push(...transition.reviews);
    const versions = [...(workspace?.versions ?? []), version];
    const allReviews = [...(workspace?.reviews ?? []), ...reviews];
    return this.persist(scope, request.mutationId, request.baseRevision, transition.outcome, {
      id: workspace?.id ?? this.createId(), goalId: scope.goalId,
      schemaVersion: PROOF_LEDGER_SCHEMA_VERSION, revision: request.baseRevision + 1,
      versions, reviews: allReviews,
      projections: projections(authority.blueprint, versions, allReviews),
    });
  }

  private async validateStructure(
    scope: ProofOwnerGoal,
    proofId: string,
    request: MutationRequest,
    authority: PlanningSourceContext,
  ): Promise<ProofAssetMetadata | null> {
    const skillIds = new Set(authority.blueprint.skills.map(({ id }) => id));
    if (request.skillIds.some((id) => !skillIds.has(id))) invalid("skill");
    if (request.dailyUnitId !== null) {
      const unit = await this.repositoryRead(() =>
        this.dependencies.repository.getOwnedDailyUnit(scope, request.dailyUnitId!));
      if (!unit || !request.skillIds.includes(unit.skillId)) invalid("daily-unit");
    }
    if (request.intent === "save_draft") {
      if (request.validatorKey !== null) invalid("validator");
      return null;
    }
    const needsArtifact = request.kind !== "reflection";
    if (needsArtifact && (request.artifactUrl === null) === (request.assetId === null)) invalid("artifact");
    if (!needsArtifact && (request.artifactUrl !== null || request.assetId !== null)) invalid("artifact");
    let asset: ProofAssetMetadata | null = null;
    if (request.assetId !== null) {
      asset = await this.repositoryRead(() => this.dependencies.repository.getOwnedAsset(scope.ownerId, proofId));
      if (!asset || asset.id !== request.assetId || asset.proofId !== proofId || asset.userId !== scope.ownerId) {
        invalid("asset");
      }
    }
    if (["repository", "commit", "pull_request", "deployment", "api", "code"].includes(request.kind)
      && request.artifactUrl === null) invalid("artifact-kind");
    if (request.kind === "test_report" && asset?.contentType !== "application/json") invalid("artifact-kind");
    if (request.kind === "screenshot" && !asset?.contentType.startsWith("image/")) invalid("artifact-kind");
    return asset;
  }

  private async reviewVersion(
    request: MutationRequest,
    version: ProofVersion,
    asset: ProofAssetMetadata | null,
    sequence: number,
    occurredAt: string,
  ): Promise<{ outcome: "draft" | "demonstrated" | "verified" | "rejected"; reviews: ProofReviewEvent[] }> {
    if (request.intent === "save_draft") {
      return { outcome: "draft", reviews: [event(this.createId(), request, version, sequence,
        "drafted", "draft", null, null, [], occurredAt)] };
    }
    const reviews = [
      event(this.createId(), request, version, sequence, "submitted", "pending_review", null, null, [], occurredAt),
      event(this.createId(), request, version, sequence + 1, "structural_passed", "demonstrated", null,
        "passed", [], occurredAt),
    ];
    if (request.validatorKey === null) return { outcome: "demonstrated", reviews };
    const validation = await runDeterministicValidator(request.validatorKey, {
      version, asset, readJsonAsset: this.readJsonAsset,
    });
    if (validation.outcome === "passed") {
      reviews.push(event(this.createId(), request, version, sequence + 2, "validator_passed", "verified",
        request.validatorKey, "passed", validation.reasonCodes, occurredAt));
      return { outcome: "verified", reviews };
    }
    if (validation.outcome === "failed") {
      reviews.push(event(this.createId(), request, version, sequence + 2, "validator_failed", "rejected",
        request.validatorKey, "failed", validation.reasonCodes, occurredAt));
      return { outcome: "rejected", reviews };
    }
    reviews.push(event(this.createId(), request, version, sequence + 2, "validator_unavailable", "demonstrated",
      request.validatorKey, "unavailable", validation.reasonCodes, occurredAt));
    return { outcome: "demonstrated", reviews };
  }

  private async persist(
    scope: ProofOwnerGoal,
    mutationId: string,
    baseRevision: number,
    outcome: ProofLedgerMutationResult["outcome"],
    workspaceInput: ProofLedgerWorkspace,
  ) {
    let result: ProofLedgerMutationResult;
    try { result = proofLedgerMutationResultSchema.parse({ outcome, workspace: workspaceInput }); }
    catch { throw new ProofServiceError("UNAVAILABLE"); }
    try {
      const saved = await this.dependencies.repository.saveMutation({
        ...scope, mutationId, baseRevision, result,
      });
      return this.parseResult(saved, scope);
    } catch (error) {
      if (error instanceof ProofRepositoryConflictError) throw new ProofServiceError("CONFLICT");
      throw new ProofServiceError("UNAVAILABLE");
    }
  }

  private async requiredWorkspace(scope: ProofOwnerGoal) {
    const workspace = await this.repositoryRead(() => this.dependencies.repository.load(scope));
    if (!workspace) throw new ProofServiceError("NOT_FOUND");
    return this.parseWorkspace(workspace, scope);
  }

  private async resolveScope(userId: string): Promise<ProofOwnerGoal> {
    const owner = ownerSchema.safeParse(userId);
    if (!owner.success) throw new ProofServiceError("UNAVAILABLE");
    let scope: ProofOwnerGoal | null;
    try { scope = await this.dependencies.repository.findActiveGoal(owner.data); }
    catch { throw new ProofServiceError("UNAVAILABLE"); }
    if (!scope || scope.ownerId !== owner.data || !scope.goalId) throw new ProofServiceError("NOT_FOUND");
    return scope;
  }

  private async resolveAuthority(scope: ProofOwnerGoal): Promise<PlanningSourceContext> {
    if (!this.dependencies.planningSource) {
      return {
        reference: { source: "flagship", roleId: "ai-native-full-stack-engineer" },
        blueprint: this.dependencies.blueprint,
        registry: this.dependencies.registry,
      };
    }
    try {
      const stored = await this.dependencies.planningSource.repository.load(scope);
      if (!stored) return {
        reference: { source: "flagship", roleId: "ai-native-full-stack-engineer" },
        blueprint: this.dependencies.blueprint,
        registry: this.dependencies.registry,
      };
      if (!stored.sourceReference) throw new Error("missing planning source");
      return await this.dependencies.planningSource.resolver.resolveForReplay(scope.ownerId, stored.sourceReference);
    } catch {
      throw new ProofServiceError("UNAVAILABLE");
    }
  }

  private async loadReplay(scope: ProofOwnerGoal, mutationId: string) {
    const replay = await this.repositoryRead(() => this.dependencies.repository.findMutation({ ...scope, mutationId }));
    return replay ? this.parseResult(replay, scope) : null;
  }

  private parseWorkspace(input: unknown, scope: ProofOwnerGoal) {
    try {
      const workspace = proofLedgerWorkspaceSchema.parse(structuredClone(input));
      if (workspace.goalId !== scope.goalId) throw new ProofServiceError("NOT_FOUND");
      return workspace;
    } catch (error) {
      if (error instanceof ProofServiceError) throw error;
      throw new ProofServiceError("UNAVAILABLE");
    }
  }

  private parseResult(input: unknown, scope: ProofOwnerGoal) {
    try {
      const result = proofLedgerMutationResultSchema.parse(structuredClone(input));
      if (result.workspace.goalId !== scope.goalId) throw new ProofServiceError("NOT_FOUND");
      return result;
    } catch (error) {
      if (error instanceof ProofServiceError) throw error;
      throw new ProofServiceError("UNAVAILABLE");
    }
  }

  private async repositoryRead<T>(read: () => Promise<T>): Promise<T> {
    try { return await read(); }
    catch (error) {
      if (error instanceof ProofServiceError) throw error;
      if (error instanceof ProofRepositoryConflictError) throw new ProofServiceError("CONFLICT");
      if (error instanceof ProofRepositoryUnavailableError) throw new ProofServiceError("UNAVAILABLE");
      throw new ProofServiceError("UNAVAILABLE");
    }
  }
}

function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  try { return schema.parse(structuredClone(input)); }
  catch { throw new ProofServiceError("INVALID_INPUT", ["contract"]); }
}

function invalid(issue: string): never {
  throw new ProofServiceError("INVALID_INPUT", [issue]);
}

function latestVersion(workspace: ProofLedgerWorkspace, proofId: string) {
  const version = workspace.versions.filter((candidate) => candidate.proofId === proofId)
    .sort((left, right) => right.versionNumber - left.versionNumber)[0];
  if (!version) throw new ProofServiceError("NOT_FOUND");
  return version;
}

function terminalReview(workspace: ProofLedgerWorkspace, version: ProofVersion) {
  const review = workspace.reviews.filter(({ proofId, versionId }) =>
    proofId === version.proofId && versionId === version.id)
    .sort((left, right) => right.sequence - left.sequence)[0];
  if (!review) throw new ProofServiceError("NOT_FOUND");
  return review;
}

function nextSequence(workspace: ProofLedgerWorkspace, proofId: string) {
  return workspace.reviews.reduce((maximum, review) =>
    review.proofId === proofId ? Math.max(maximum, review.sequence) : maximum, 0) + 1;
}

function projections(
  blueprint: RoleBlueprint,
  versions: ProofVersion[],
  reviews: ProofReviewEvent[],
) {
  const input = { skillIds: blueprint.skills.map(({ id }) => id), completedSkillIds: new Set<string>(), versions, reviews };
  return (["internal", "public"] as const).flatMap((visibility) =>
    projectSkillEvidence({ ...input, visibility }));
}

function event(
  id: string,
  request: MutationRequest,
  version: ProofVersion,
  sequence: number,
  kind: ProofReviewEvent["kind"],
  stateAfter: ProofReviewEvent["stateAfter"],
  validatorKey: string | null,
  outcome: ProofReviewEvent["outcome"],
  reasonCodes: string[],
  occurredAt: string,
): ProofReviewEvent {
  return {
    id, proofId: version.proofId, versionId: version.id, sequence,
    mutationId: request.mutationId, kind, stateAfter, visibilityAfter: version.visibility,
    validatorKey, outcome, reasonCodes, occurredAt,
  };
}

function messageFor(code: ProofServiceErrorCode) {
  if (code === "INVALID_INPUT") return "Proof input is invalid.";
  if (code === "NOT_FOUND") return "Proof workspace was not found.";
  if (code === "CONFLICT") return "Proof state changed. Refresh and try again.";
  return "Proof is unavailable. The previous valid state is unchanged.";
}
