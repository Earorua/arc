import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { hashBridgeJob, type BridgeJob } from "../../app/server/research/executor/job";
import type { BridgeStoredJob } from "../research-executor/d1-job-store";
import type { ExecutorEnvironment } from "../research-executor/environment";
import { createExecutionRuntime as originalExecution, createHttpRuntime as originalHttp,
  createMaintenanceRuntime as originalMaintenance, type ExecutorRuntimeOverrides } from "../research-executor/runtime";
import type { SmokeExecutorEnvironment } from "./environment";
import { D1SmokeEvidence } from "./evidence";
import { scenarioForJob } from "./scenarios";
import { SMOKE_TIMING } from "./timing";
import { createBridgeFetch, createSyntheticProviderFetch } from "./transports";

function sealed(environment: ExecutorEnvironment, overrides: ExecutorRuntimeOverrides) {
  if (!overrides || Reflect.ownKeys(overrides).length !== 0) throw new Error("Smoke runtime overrides forbidden");
  // Deliberate projection: never enumerate the environment or touch its real Provider key.
  const projected: ExecutorEnvironment = {
    EXECUTOR_DB: environment.EXECUTOR_DB,
    EXECUTOR_RECEIPTS: environment.EXECUTOR_RECEIPTS,
    RESEARCH_WORKFLOW: environment.RESEARCH_WORKFLOW,
    ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: environment.ARC_RESEARCH_EXECUTOR_ACCEPT_NEW,
    ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: environment.ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED,
    BETTER_AUTH_URL: environment.BETTER_AUTH_URL,
    ARC_AI_RESEARCH_EXECUTOR_URL: environment.ARC_AI_RESEARCH_EXECUTOR_URL,
    ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: environment.ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID,
    ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX: environment.ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX,
    ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: environment.ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID,
    ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX: environment.ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX,
    OPENROUTER_API_KEY: "synthetic-task15-no-credential",
  };
  const connection = readResearchBridgeConnection(projected);
  if (!connection) throw new Error("Invalid smoke bridge configuration");
  const bridgeFetch = createBridgeFetch((environment as SmokeExecutorEnvironment).SMOKE_SITE, connection.siteOrigin, "site");
  return { projected, bridgeFetch };
}

export function createExecutionRuntime(...[environment, overrides = {}]: Parameters<typeof originalExecution>): ReturnType<typeof originalExecution> {
  const { projected, bridgeFetch } = sealed(environment, overrides);
  const evidence = new D1SmokeEvidence(projected.EXECUTOR_DB);
  let observed: BridgeStoredJob | undefined;
  let immutable: string | undefined;
  let invalid = false;
  let dispatched = false;
  const currentJob = (): BridgeJob => {
    if (invalid || !observed) throw new Error("Smoke job not observed");
    return observed.job;
  };
  const providerFetch = createSyntheticProviderFetch({ currentJob: () => {
    const job = currentJob();
    if (!dispatched) throw new Error("Smoke job dispatch not claimed");
    return job;
  }, evidence, timing: SMOKE_TIMING });
  const bucket = projected.EXECUTOR_RECEIPTS;
  // Only the execution receipt store receives this adapter. Keep platform receivers intact.
  const faultBucket = {
    get: bucket.get.bind(bucket), delete: bucket.delete.bind(bucket),
    put: (async (...args: Parameters<R2Bucket["put"]>) => {
      const job = currentJob();
      const scenario = scenarioForJob(job);
      const [key, , options] = args;
      if (scenario.id === "after-r2" && (key !== `research-receipts/v1/${job.jobId}/${observed!.requestHash}.json`
        || !options?.onlyIf || options.onlyIf instanceof Headers || options.onlyIf.etagDoesNotMatch !== "*")) {
        throw new Error("Smoke fault boundary mismatch");
      }
      const result = await bucket.put(...args);
      if (scenario.id === "after-r2" && result !== null) {
        if (!result || result.key !== key || typeof result.etag !== "string" || !result.etag) throw new Error("Smoke R2 write unavailable");
        await evidence.markFault(job.jobId, "after-r2", Date.now());
        throw new Error("Synthetic after-r2 fault");
      }
      return result;
    }) as R2Bucket["put"],
  } as R2Bucket;
  const runtime = originalExecution({ ...projected, EXECUTOR_RECEIPTS: faultBucket }, { bridgeFetch, providerFetch });
  const jobs: ReturnType<typeof originalExecution>["jobs"] = Object.freeze({
    get: async (jobId: string) => {
      try {
        if (invalid) throw new Error("Smoke job changed");
        const next = await runtime.jobs.get(jobId);
        if (!next || next.job.jobId !== jobId) throw new Error("Smoke job unavailable");
        const scenario = scenarioForJob(next.job);
        const canonical = canonicalJson(next.job);
        if (next.requestHash !== await hashBridgeJob(next.job)
          || (observed && (observed.requestHash !== next.requestHash || immutable !== canonical))) {
          throw new Error("Smoke job changed");
        }
        observed = next; immutable = canonical;
        await evidence.start(scenario.id, Date.now());
        return next;
      } catch (error) { invalid = true; throw error; }
    },
    recordBegin: runtime.jobs.recordBegin.bind(runtime.jobs),
    closeUnclaimed: runtime.jobs.closeUnclaimed.bind(runtime.jobs),
    claimDispatch: async (job, grant, now) => {
      if (canonicalJson(currentJob()) !== canonicalJson(job)) throw new Error("Smoke job changed");
      const claimed = await runtime.jobs.claimDispatch(job, grant, now);
      if (claimed) dispatched = true;
      return claimed;
    },
  });
  const receipts: ReturnType<typeof originalExecution>["receipts"] = Object.freeze({
    recover: runtime.receipts.recover.bind(runtime.receipts),
    save: async (receipt, now) => {
      const job = currentJob();
      const saved = await runtime.receipts.save(receipt, now);
      if (scenarioForJob(job).id === "after-d1") {
        await evidence.markFault(job.jobId, "after-d1", Date.now());
        throw new Error("Synthetic after-d1 fault");
      }
      return saved;
    },
  });
  return Object.freeze({ ...runtime, jobs, receipts });
}

export function createHttpRuntime(...[environment, overrides = {}]: Parameters<typeof originalHttp>): ReturnType<typeof originalHttp> {
  const { projected, bridgeFetch } = sealed(environment, overrides);
  return originalHttp(projected, { bridgeFetch });
}

export function createMaintenanceRuntime(...[environment, overrides = {}]: Parameters<typeof originalMaintenance>): ReturnType<typeof originalMaintenance> {
  const { projected, bridgeFetch } = sealed(environment, overrides);
  return originalMaintenance(projected, { bridgeFetch });
}
