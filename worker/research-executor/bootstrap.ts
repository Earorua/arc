import type { AcceptedProof } from "../../app/server/research/executor/bridge-contract";
import type { BridgeJob } from "../../app/server/research/executor/job";
import type { D1BridgeJobStore } from "./d1-job-store";
import type { SiteBridgeClient } from "./site-client";

type BootstrapPhase = "job-accept" | "workflow-create" | "workflow-get" | "workflow-status"
  | "record-accepted" | "site-accepted";
type BootstrapDiagnostic = Readonly<{ event: "arc.research.workflow-start"; phase: BootstrapPhase;
  state: "started" | "succeeded" | "failed"; elapsedMs: number; aborted: boolean }>;

type BootstrapDependencies = Readonly<{
  jobs: Pick<D1BridgeJobStore, "accept" | "recordWorkflowAccepted">;
  workflow: Pick<Workflow<{ jobId: string }>, "create" | "get">;
  site: Pick<SiteBridgeClient, "accepted">;
  wallNow: () => number;
  monoNow?: () => number;
  onDiagnostic?: (diagnostic: BootstrapDiagnostic) => void;
  guard?: () => void;
  signal?: AbortSignal;
}>;

const PROVED_STATES = new Set([
  "queued", "running", "paused", "errored", "terminated", "complete", "waiting", "waitingForPause",
]);

function proof(stored: Awaited<ReturnType<D1BridgeJobStore["accept"]>>): AcceptedProof {
  if (stored.workflowAcceptedAt === null) throw new Error("Research workflow is not durably accepted");
  return Object.freeze({ jobId: stored.job.jobId, requestHash: stored.requestHash,
    workflowId: stored.job.jobId, workflowAcceptedAt: stored.workflowAcceptedAt });
}

export async function ensureWorkflow(job: BridgeJob, dependencies: BootstrapDependencies): Promise<AcceptedProof> {
  const guard = dependencies.guard ?? (() => undefined);
  const monoNow = dependencies.monoNow ?? (() => performance.now());
  const startedAt = monoNow();
  const report = (phase: BootstrapPhase, state: BootstrapDiagnostic["state"]) => {
    try {
      const elapsed = monoNow() - startedAt;
      const diagnostic: BootstrapDiagnostic = Object.freeze({ event: "arc.research.workflow-start", phase, state,
        elapsedMs: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
        aborted: dependencies.signal?.aborted === true });
      if (dependencies.onDiagnostic) dependencies.onDiagnostic(diagnostic);
      else console.info(JSON.stringify(diagnostic));
    } catch { /* Diagnostics must never alter acceptance or disclose raw errors/payloads. */ }
  };
  const stage = async <T>(phase: BootstrapPhase, operation: () => Promise<T>): Promise<T> => {
    guard();
    report(phase, "started");
    try {
      const value = await operation();
      guard();
      report(phase, "succeeded");
      return value;
    } catch (error) {
      report(phase, "failed");
      throw error;
    }
  };
  let stored = await stage("job-accept", () => dependencies.jobs.accept(job, dependencies.wallNow()));
  if (stored.workflowAcceptedAt === null) {
    const acceptedJob = stored.job;
    let proved = false;
    try {
      const instance = await stage("workflow-create", () => dependencies.workflow.create({ id: acceptedJob.jobId,
        params: { jobId: acceptedJob.jobId } }));
      proved = instance.id === acceptedJob.jobId;
    } catch {
      try {
        const instance = await stage("workflow-get", () => dependencies.workflow.get(acceptedJob.jobId));
        const status = await stage("workflow-status", () => instance.status());
        proved = instance.id === acceptedJob.jobId && PROVED_STATES.has(status.status);
      } catch { proved = false; }
    }
    if (!proved) throw new Error("Research workflow acceptance is temporarily unavailable");
    stored = await stage("record-accepted", () => dependencies.jobs.recordWorkflowAccepted(
      acceptedJob, acceptedJob.jobId, dependencies.wallNow()));
  }
  const accepted = proof(stored);
  await stage("site-accepted", () => dependencies.signal
    ? dependencies.site.accepted(stored.job, accepted, { signal: dependencies.signal })
    : dependencies.site.accepted(stored.job, accepted));
  return accepted;
}
