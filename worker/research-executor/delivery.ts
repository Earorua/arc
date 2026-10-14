import { BridgeTransportError } from "../../app/server/research/executor/http-transport";
import { BRIDGE_RECEIPT_RETENTION_MS } from "../../app/server/research/executor/receipt";
import type { D1BridgeJobStore } from "./d1-job-store";
import type { ExecutorMaintenanceStore, DeliveryFailure } from "./maintenance-store";
import { BridgeReceiptStoreError, type ExecutorReceiptStore } from "./receipt-store";
import type { SiteBridgeClient } from "./site-client";

const OUTBOUND_MS = 5_000;

export type DeliveryDependencies = Readonly<{
  jobs: Pick<D1BridgeJobStore, "get">;
  receipts: Pick<ExecutorReceiptStore, "recover" | "acknowledge">;
  store: Pick<ExecutorMaintenanceStore, "scheduleReceipt" | "readDelivery" | "defer" | "complete">;
  site: Pick<SiteBridgeClient, "complete" | "metadata">;
  wallNow: () => number;
  signal?: AbortSignal;
  outboundBudget?: () => number;
}>;

function nowFrom(clock: () => number): number {
  const value = clock();
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Executor delivery unavailable");
  return value;
}

function failure(error: unknown): DeliveryFailure {
  if (error instanceof BridgeTransportError) {
    if (error.kind === "authentication" || error.kind === "conflict" || error.kind === "protocol") return error.kind;
    return "temporary";
  }
  if (error instanceof BridgeReceiptStoreError) {
    return error.code === "conflict" || error.code === "invalid-message" ? "conflict" : "temporary";
  }
  return "temporary";
}

async function outbound<T>(parent: AbortSignal | undefined,
  maximum: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (parent?.aborted) throw new DOMException("Executor delivery aborted", "AbortError");
  if (!Number.isFinite(maximum) || maximum <= 0 || maximum > OUTBOUND_MS) {
    throw new Error("Executor delivery unavailable");
  }
  const controller = new AbortController();
  let rejectTimeout: ((reason: Error) => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
  const abort = () => {
    controller.abort();
    rejectTimeout?.(new Error("Executor delivery request deadline exceeded"));
  };
  parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, Math.max(1, Math.ceil(maximum)));
  const operation = Promise.resolve().then(() => work(controller.signal));
  void operation.catch(() => undefined);
  try { return await Promise.race([operation, timeout]); }
  finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
    controller.abort();
  }
}

export async function deliverReceipt(jobId: string, dependencies: DeliveryDependencies): Promise<void> {
  const now = nowFrom(dependencies.wallNow);
  if (dependencies.signal?.aborted) return;
  const storedJob = await dependencies.jobs.get(jobId);
  if (!storedJob || storedJob.dispatchState !== "claimed" || storedJob.grant === null) {
    throw new Error("Executor delivery unavailable");
  }
  if (dependencies.signal?.aborted) return;
  const receipt = await dependencies.receipts.recover(jobId, now);
  if (!receipt) return;
  if (receipt.metadata.grant.jobId !== storedJob.job.jobId
    || receipt.metadata.grant.requestHash !== storedJob.requestHash) {
    throw new Error("Executor delivery unavailable");
  }
  if (dependencies.signal?.aborted) return;
  const existing = await dependencies.store.readDelivery(jobId);
  if (existing && existing.receiptHash !== receipt.metadata.receiptHash) {
    await dependencies.store.defer(jobId, existing.receiptHash, existing.version, now, "conflict");
    return;
  }
  if (dependencies.signal?.aborted) return;
  await dependencies.store.scheduleReceipt(receipt.metadata);
  if (dependencies.signal?.aborted) return;
  const state = await dependencies.store.readDelivery(jobId);
  if (!state || state.receiptHash !== receipt.metadata.receiptHash) throw new Error("Executor delivery unavailable");
  if (state.completedAt !== null || state.stoppedCode !== null || now < state.nextAttemptAt) return;
  const notice = { jobId, requestHash: storedJob.requestHash, receiptHash: receipt.metadata.receiptHash };
  try {
    const useMetadata = receipt.bodyState !== "available" || receipt.receipt === null
      || now >= receipt.metadata.producedAt + BRIDGE_RECEIPT_RETENTION_MS;
    const outboundMs = dependencies.outboundBudget?.() ?? OUTBOUND_MS;
    if (outboundMs <= 0) return;
    const acknowledgement = await outbound(dependencies.signal, Math.min(OUTBOUND_MS, outboundMs),
      (requestSignal) => useMetadata
      ? dependencies.site.metadata(storedJob.job, receipt.metadata, { signal: requestSignal })
      : dependencies.site.complete(storedJob.job, notice, { signal: requestSignal }));
    if (dependencies.signal?.aborted) return;
    if (acknowledgement.jobId !== notice.jobId || acknowledgement.requestHash !== notice.requestHash
      || acknowledgement.receiptHash !== notice.receiptHash) {
      await dependencies.store.defer(jobId, notice.receiptHash, state.version, now, "conflict");
      return;
    }
    await dependencies.receipts.acknowledge(jobId, notice.receiptHash, now);
    if (dependencies.signal?.aborted) return;
    await dependencies.store.complete(jobId, notice.receiptHash, state.version, now);
  } catch (error) {
    if (dependencies.signal?.aborted) return;
    await dependencies.store.defer(jobId, notice.receiptHash, state.version, now, failure(error));
  }
}
