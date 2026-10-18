import type { AcceptedProof } from "../../app/server/research/executor/bridge-contract";
import type { BridgeJob } from "../../app/server/research/executor/job";
import type { D1BridgeJobStore } from "./d1-job-store";
import type { SiteBridgeClient } from "./site-client";

type BootstrapDependencies = Readonly<{
  jobs: Pick<D1BridgeJobStore, "accept" | "recordWorkflowAccepted">;
  workflow: Pick<Workflow<{ jobId: string }>, "create" | "get">;
  site: Pick<SiteBridgeClient, "accepted">;
  wallNow: () => number;
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
  guard();
  let stored = await dependencies.jobs.accept(job, dependencies.wallNow());
  guard();
  if (stored.workflowAcceptedAt === null) {
    const acceptedJob = stored.job;
    let proved = false;
    try {
      guard();
      const instance = await dependencies.workflow.create({ id: acceptedJob.jobId,
        params: { jobId: acceptedJob.jobId } });
      guard();
      proved = instance.id === acceptedJob.jobId;
    } catch {
      try {
        guard();
        const instance = await dependencies.workflow.get(acceptedJob.jobId);
        guard();
        const status = await instance.status();
        guard();
        proved = instance.id === acceptedJob.jobId && PROVED_STATES.has(status.status);
      } catch { proved = false; }
    }
    if (!proved) throw new Error("Research workflow acceptance is temporarily unavailable");
    guard();
    stored = await dependencies.jobs.recordWorkflowAccepted(acceptedJob, acceptedJob.jobId, dependencies.wallNow());
    guard();
  }
  const accepted = proof(stored);
  guard();
  if (dependencies.signal) {
    await dependencies.site.accepted(stored.job, accepted, { signal: dependencies.signal });
  } else {
    await dependencies.site.accepted(stored.job, accepted);
  }
  guard();
  return accepted;
}
