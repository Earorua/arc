import { z } from "zod";
import { researchRequestSchema, type ResearchRunPublicView } from "../../contracts/research";
import { canonicalJson, fingerprint } from "../../lib/planning/fingerprint";
import type { ResearchGateContext } from "./orchestrator";
import type { ResearchProductionConfiguration } from "./production-policy";
import type { ResearchLocalViewReader } from "./remote-public-reader";
import type { ResearchRepository, RemoteResearchCreationRepository, RemoteCreationResult } from "./repository";
import { ResearchRepositoryError } from "./repository";
import type { ResearchService } from "./service";
import type { SiteAdmissionCoordinator } from "./site-admission";
import type { SiteBridgeRepository } from "./site-bridge-repository";
import type { ExecutorBridgeClient } from "./executor/executor-client";
import { matchAcceptedProof, type AcceptedProof } from "./executor/bridge-contract";
import { BridgeTransportError } from "./executor/http-transport";
import { PublicOperationScope, PublicOperationTimeout } from "./public-operation-scope";
import { readBoundedResearchJson } from "./source-audit";
import type { SiteExecutionIdentity } from "./site-execution-repository";

export type RemoteResearchWriteRepositories = {
  research: ResearchRepository & RemoteResearchCreationRepository;
  admission: Pick<SiteAdmissionCoordinator, "admitNew">;
  bridge: Pick<SiteBridgeRepository, "recordAcceptance" | "readAcceptance">;
};
export type RemoteResearchServiceDependencies = {
  /** All storage and response nonce capabilities must use createGuardedD1 with this guard. */
  createWriteRepositories: (guard: () => void) => RemoteResearchWriteRepositories;
  createExecutor: (guard: () => void) => ExecutorBridgeClient | null;
  reader: ResearchLocalViewReader & Pick<ResearchService, "get" | "recover">;
  configuration: ResearchProductionConfiguration;
  newCallsAllowed: () => boolean;
  monoNow: () => number;
  createRequestId?: () => string;
};

const text = z.string().min(1).max(160)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));
const unavailable = () => new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
const conflict = () => new ResearchRepositoryError("CONFLICT");

function identity(execution: SiteExecutionIdentity): SiteExecutionIdentity {
  return Object.freeze({ ownerId: execution.ownerId, runId: execution.runId, requestId: execution.requestId,
    jobId: execution.jobId, requestHash: execution.requestHash });
}

/** Public writes own creation/admission and one short submit; independent outbox work owns resubmission. */
export class RemoteResearchService implements ResearchService {
  constructor(private readonly dependencies: RemoteResearchServiceDependencies) {}

  start(ownerId: string, input: unknown, context: ResearchGateContext): Promise<ResearchRunPublicView> {
    return this.write(ownerId, context, async (work, repositories) => {
      const request = researchRequestSchema.parse(readBoundedResearchJson(input));
      text.parse(ownerId);
      const rawRole = text.min(2).parse(request.role.normalize("NFKC").trim().replace(/\s+/gu, " "));
      const normalizedRoleKey = rawRole.toLowerCase();
      return work.run(() => repositories().research.createRemoteOrReplay({ ownerId, rawRole, normalizedRoleKey,
        locale: request.locale, mutationId: request.mutationId, requestId: this.requestId(),
        inputFingerprint: fingerprint([normalizedRoleKey, request.locale]),
        configFingerprint: this.dependencies.configuration.configFingerprint, policy: this.policy() }));
    });
  }

  retry(ownerId: string, runId: string, mutationId: string, context: ResearchGateContext): Promise<ResearchRunPublicView> {
    return this.write(ownerId, context, async (work, repositories) => {
      text.parse(ownerId);
      researchRequestSchema.shape.mutationId.parse(mutationId);
      const research = repositories().research;
      const source = await work.run(() => research.getRun(ownerId, runId));
      if (!source) throw new ResearchRepositoryError("NOT_FOUND");
      if (source.ownerId !== ownerId || source.id !== runId) throw conflict();
      return work.run(() => research.createRemoteRetry({ ownerId, runId, mutationId,
        requestId: this.requestId(), currentConfigFingerprint: this.dependencies.configuration.configFingerprint,
        policy: this.policy() }));
    });
  }

  get(ownerId: string, runId: string): Promise<ResearchRunPublicView | null> {
    return this.dependencies.reader.get(ownerId, runId);
  }

  recover(ownerId: string, input: unknown): Promise<ResearchRunPublicView | null> {
    return this.dependencies.reader.recover(ownerId, input);
  }

  private requestId(): string {
    return text.parse((this.dependencies.createRequestId ?? (() => crypto.randomUUID()))());
  }

  private policy() {
    const configuration = this.dependencies.configuration;
    return { cacheDays: configuration.cacheDays, userDailyQuota: configuration.userDailyQuota,
      dailyBudgetMicros: configuration.budget.dailyBudgetMicros,
      monthlyBudgetMicros: configuration.budget.monthlyBudgetMicros, maximumMicros: configuration.budget.maximumMicros };
  }

  private async write(ownerId: string, context: ResearchGateContext,
    create: (scope: PublicOperationScope, repositories: () => RemoteResearchWriteRepositories) => Promise<RemoteCreationResult>,
  ): Promise<ResearchRunPublicView> {
    const work = new PublicOperationScope(this.dependencies.monoNow);
    let created: RemoteCreationResult;
    try {
      let repositories: RemoteResearchWriteRepositories | undefined;
      const writes = () => {
        work.ensure();
        return repositories ??= this.dependencies.createWriteRepositories(work.ensure);
      };
      created = await work.run(() => create(work, writes));
      if (created.run.ownerId !== ownerId) throw conflict();
      if (!created.replayed) {
        const initial = created.execution;
        if (!initial || created.run.executionMode !== "cloudflare-workflow-v1") throw unavailable();
        const original = identity(initial);
        if (initial.ownerId !== ownerId || initial.runId !== created.run.id || initial.requestId !== created.run.requestId) throw conflict();
        const admitted = await work.run(() => writes().admission.admitNew(original,
          { ...context, newCallsAllowed: this.dependencies.newCallsAllowed() }));
        if (canonicalJson(identity(admitted.execution)) !== canonicalJson(original)
          || canonicalJson(admitted.execution.job) !== canonicalJson(initial.job)
          || admitted.run.id !== created.run.id || admitted.run.ownerId !== ownerId
          || admitted.run.requestId !== created.run.requestId) throw conflict();
        if (admitted.execution.admissionState === "admitted" && admitted.execution.beganAt === null) {
          await this.submit(work, writes(), admitted.execution);
        }
      }
    } catch (error) {
      if (error instanceof ResearchRepositoryError || error instanceof z.ZodError || error instanceof BridgeTransportError) throw error;
      throw unavailable();
    } finally { work.finish(); }

    // Fresh read capabilities only; no status/result or second work window. A failed refresh cannot prove a safe fallback.
    const refresh = new PublicOperationScope(this.dependencies.monoNow, 500);
    try {
      const view = await refresh.run(() => this.dependencies.reader.readLocalView(refresh, ownerId, created.run.id));
      if (!view) throw unavailable();
      if (view.id !== created.run.id || view.role !== created.run.rawRole || view.locale !== created.run.locale) throw conflict();
      return view;
    } catch (error) {
      if (error instanceof ResearchRepositoryError || error instanceof z.ZodError) throw error;
      throw unavailable();
    } finally { refresh.finish(); }
  }

  private async submit(work: PublicOperationScope, repositories: RemoteResearchWriteRepositories,
    execution: NonNullable<RemoteCreationResult["execution"]>): Promise<void> {
    let proof: AcceptedProof;
    try {
      work.ensure();
      const executor = this.dependencies.createExecutor(work.ensure);
      if (!executor) return;
      proof = await work.run(() => executor.submit(execution.job, { signal: work.signal }));
      await work.run(() => matchAcceptedProof(proof, execution.job));
      const recorded = await work.run(() => repositories.bridge.recordAcceptance(proof));
      if (canonicalJson(recorded) !== canonicalJson(proof)) throw conflict();
    } catch (error) {
      // Only ambiguous optional work can fall through to authoritative local refresh. Corruption/conflicts remain failures.
      if (error instanceof PublicOperationTimeout
        || error instanceof BridgeTransportError && error.kind === "temporary"
        || error instanceof ResearchRepositoryError && error.code === "RESEARCH_UNAVAILABLE") return;
      throw error;
    }
    // A successful write acknowledgement must be followed by a matching persisted proof.
    // Failure here is a required local read failure, not ambiguous optional submit work.
    const persisted = await work.run(() => repositories.bridge.readAcceptance(identity(execution)));
    if (!persisted) throw unavailable();
    await work.run(() => matchAcceptedProof(persisted, execution.job));
    if (canonicalJson(persisted) !== canonicalJson(proof)) throw conflict();
  }
}
