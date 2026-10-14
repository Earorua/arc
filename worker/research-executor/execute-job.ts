import { assertBridgeProviderBudget, BridgeBeginError } from "../../app/server/research/executor/begin";
import { parseBridgeProviderReceipt, type BridgeProviderErrorOutcome,
  type BridgeProviderResponseOutcome } from "../../app/server/research/executor/receipt";
import { ResearchProviderError, type ResearchProvider } from "../../app/server/research/provider";
import type { D1BridgeJobStore } from "./d1-job-store";
import type { ExecutorReceiptStore } from "./receipt-store";
import type { SiteBridgeClient } from "./site-client";
import type { ExecutionReference } from "./workflow-policy";

export type ResearchJobDependencies = Readonly<{
  jobs: Pick<D1BridgeJobStore, "get" | "recordBegin" | "claimDispatch" | "closeUnclaimed">;
  receipts: Pick<ExecutorReceiptStore, "save" | "recover">;
  site: Pick<SiteBridgeClient, "begin">;
  provider: Pick<ResearchProvider, "research">;
  wallNow: () => number;
  monoNow: () => number;
}>;

export async function runResearchJob(_jobId: string, _dependencies: ResearchJobDependencies): Promise<ExecutionReference> {
  const { jobs, receipts, site, provider, wallNow, monoNow } = _dependencies;
  const unavailable = (): ExecutionReference => Object.freeze({ jobId: _jobId, state: "unavailable", receiptHash: null });
  let stored: Awaited<ReturnType<typeof jobs.get>>;
  try { stored = await jobs.get(_jobId); }
  catch { return unavailable(); }
  if (!stored || stored.job.jobId !== _jobId) return unavailable();
  if (stored.dispatchState === "closed") {
    return Object.freeze({ jobId: _jobId, state: "closed", receiptHash: null });
  }
  if (stored.dispatchState === "claimed") {
    try {
      const recovered = await receipts.recover(_jobId, wallNow());
      return recovered
        ? Object.freeze({ jobId: _jobId, state: "recorded", receiptHash: recovered.metadata.receiptHash })
        : Object.freeze({ jobId: _jobId, state: "already-claimed", receiptHash: null });
    } catch { return unavailable(); }
  }

  const beginStarted = monoNow();
  let reply: Awaited<ReturnType<typeof site.begin>>;
  try {
    reply = await site.begin(stored.job);
    assertBridgeProviderBudget(reply, monoNow() - beginStarted);
    await jobs.recordBegin(stored.job, reply.grant);
    assertBridgeProviderBudget(reply, monoNow() - beginStarted);
  } catch (error) {
    if (error instanceof BridgeBeginError && error.code === "insufficient-time") {
      try {
        const closed = await jobs.closeUnclaimed(stored.job, wallNow());
        return Object.freeze({ jobId: _jobId,
          state: closed.dispatchState === "closed" ? "closed" : "unavailable", receiptHash: null });
      } catch { return unavailable(); }
    }
    return unavailable();
  }

  let claimed: boolean;
  try { claimed = await jobs.claimDispatch(stored.job, reply.grant, wallNow()); }
  catch { return unavailable(); }
  if (!claimed) return Object.freeze({ jobId: _jobId, state: "already-claimed", receiptHash: null });
  try { assertBridgeProviderBudget(reply, monoNow() - beginStarted); }
  catch { return unavailable(); }

  const dispatchedAt = monoNow();
  let outcome: BridgeProviderResponseOutcome | BridgeProviderErrorOutcome;
  try {
    const result = await provider.research({ role: stored.job.role, locale: stored.job.locale });
    outcome = { kind: "response", content: result.content, annotations: result.annotations,
      actualModel: result.actualModel, usage: result.usage };
  } catch (error) {
    outcome = error instanceof ResearchProviderError
      ? { kind: "error", code: error.code, retryable: error.retryable, charged: error.charged,
        actualModel: error.actualModel, usage: error.usage }
      : { kind: "error", code: "unavailable", retryable: false, charged: "unknown",
        actualModel: null, usage: null };
  }
  let receipt;
  try {
    receipt = parseBridgeProviderReceipt({ grant: reply.grant, producedAt: wallNow(),
      latencyMs: Math.ceil(monoNow() - dispatchedAt), outcome });
    const saved = await receipts.save(receipt, wallNow());
    return Object.freeze({ jobId: _jobId, state: "recorded", receiptHash: saved.metadata.receiptHash });
  } catch { return unavailable(); }
}
