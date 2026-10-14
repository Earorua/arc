import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import type { ExecutorStatus } from "../../app/server/research/executor/bridge-contract";
import type { ResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import type { PublicOperationScope } from "../../app/server/research/public-operation-scope";
import { RemoteResearchReader, type PublicReadRepositories } from "../../app/server/research/remote-public-reader";
import { ResearchRepositoryError } from "../../app/server/research/repository";
import { createGuardedD1, createSiteBridgeOperations } from "../../app/server/research/site-bridge-factory";
import type { SmokeSiteEnvironment } from "./environment";
import { requireSmokeReplayAdmission, type SmokeReplayAdmission } from "./replay-admission";
import { parseSmokeReplayReply, type SmokeReplayRequest, type SmokeReplayReply } from "./replay-contract";
import { createBridgeFetch } from "./transports";

function unavailable(): never { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
function exact(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }

function requireOriginalStatus(status: ExecutorStatus, admission: SmokeReplayAdmission) {
  if (status.dispatchState !== "claimed" || status.unsent !== null || status.accepted === null || status.metadata === null
    || !exact(status.accepted, admission.accepted) || !exact(status.metadata, admission.metadata)
    || !exact(status.metadata.grant, admission.metadata.grant)
    || status.metadata.receiptHash !== admission.approval.receiptHash
    || (status.bodyState !== "available" && status.bodyState !== "removed")) unavailable();
  return { accepted: status.accepted, metadata: status.metadata, bodyState: status.bodyState };
}

export async function runSmokeReplay({ environment, connection, request, scope }: {
  environment: SmokeSiteEnvironment; connection: ResearchBridgeConnection;
  request: SmokeReplayRequest; scope: PublicOperationScope;
}): Promise<SmokeReplayReply> {
  const admission = await requireSmokeReplayAdmission({ environment, scenarioId: request.scenarioId, scope });
  scope.ensure();
  const rawdb = environment.SMOKE_SITE_DB;
  const monoNow = () => performance.now();
  const compose = (inner: () => void) => () => { scope.ensure(); inner(); scope.ensure(); };
  const createExecutor = (inner: () => void) => {
    const guard = compose(inner);
    guard();
    const bindingFetch = createBridgeFetch(environment.SMOKE_EXECUTOR, connection.executorOrigin, "executor");
    const guardedFetch: typeof fetch = async (input, init) => {
      guard();
      if (!(input instanceof Request) || init !== undefined) unavailable();
      const signal = AbortSignal.any([scope.signal, input.signal]);
      signal.throwIfAborted();
      const response = await bindingFetch(new Request(input, { signal }));
      try { guard(); signal.throwIfAborted(); }
      catch (error) { void response.body?.cancel().catch(() => undefined); throw error; }
      return response;
    };
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection,
      nonces: new D1BridgeNonceStore(createGuardedD1(rawdb, guard)), fetch: guardedFetch, wallNow: Date.now, monoNow }));
    guard(); return client;
  };
  const identity = { jobId: admission.execution.jobId, requestHash: admission.execution.requestHash,
    runHash: admission.approval.runHash, packageHash: admission.approval.packageHash };
  const common = { schemaVersion: "arc-smoke-replay-v1", scenarioId: request.scenarioId, step: request.step };
  let reply: unknown;
  if (request.step === "submit" || request.step === "status") {
    const executor = createExecutor(scope.ensure);
    const preflight = requireOriginalStatus(await scope.run(() => executor.status(admission.execution.job, { signal: scope.signal })), admission);
    if (request.step === "submit") {
      const accepted = await scope.run(() => executor.submit(admission.execution.job, { signal: scope.signal }));
      if (!exact(accepted, admission.accepted) || !exact(accepted, preflight.accepted)) unavailable();
    }
    // Submit reports the status proved before that submit, never a post-submit observation.
    reply = { ...common, completed: true, identity,
      original: { acceptedAt: preflight.accepted.workflowAcceptedAt, beganAt: preflight.metadata.grant.beganAt,
        executionExpiresAt: preflight.metadata.grant.executionExpiresAt, queueExpiresAt: admission.execution.job.queueExpiresAt },
      receipt: { receiptHash: preflight.metadata.receiptHash, metadataSha256: admission.approval.receiptMetadataSha256,
        bodyState: preflight.bodyState },
      checks: { approvalMatched: true, settled: true, acceptedProofMatched: true, grantMatched: true, receiptMatched: true } };
  } else {
    scope.ensure();
    const reader = new RemoteResearchReader({ monoNow,
      legacy: { get: async () => unavailable(), recover: async () => unavailable() },
      createExecutor,
      createReadRepositories: (inner): PublicReadRepositories => {
        const guard = compose(inner);
        guard();
        const db = createGuardedD1(rawdb, guard);
        const research = new D1ResearchRepository(db);
        const executions = new D1SiteExecutionRepository(db, research);
        const bridge = new D1SiteBridgeRepository(db, research, executions);
        const repositories: PublicReadRepositories = {
          research: { getRun: research.getRun.bind(research), getPublicRun: research.getPublicRun.bind(research),
            findRecoveryRun: research.findRecoveryRun.bind(research) },
          executions: { read: executions.read.bind(executions) },
          bridge: { lookup: bridge.lookup.bind(bridge), readAcceptance: bridge.readAcceptance.bind(bridge) },
        };
        guard(); return repositories;
      },
      createOperations: inner => {
        const guard = compose(inner);
        guard(); const operations = createSiteBridgeOperations(rawdb, guard, Date.now); guard(); return operations;
      },
    });
    scope.ensure();
    const ownerB = request.step === "owner-b-get" || request.step === "owner-b-recover";
    const ownerId = ownerB ? admission.scenario.otherOwnerId : admission.scenario.ownerId;
    const selection = { kind: "start", role: admission.scenario.role, locale: admission.scenario.locale,
      mutationId: admission.scenario.mutationId };
    const view = await scope.run(() => request.step === "owner-a-recover" || request.step === "owner-b-recover"
      ? reader.recover(ownerId, selection) : reader.get(ownerId, admission.run.id));
    if (ownerB) reply = { ...common, completed: view === null, isNull: view === null };
    else {
      if (!view || view.id !== admission.run.id || view.state !== "ready" || view.packageId !== admission.run.packageId
        || view.backgroundAccepted !== true) unavailable();
      reply = { ...common, completed: true, identity, checks: { approvalMatched: true, settled: true,
        runMatched: true, packageMatched: true, ready: true, backgroundAccepted: true } };
    }
  }
  scope.ensure();
  const result = parseSmokeReplayReply(reply);
  scope.ensure(); return result;
}
