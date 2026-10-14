import { BridgeTransportError } from "../../app/server/research/executor/http-transport";
import type { BridgeJob } from "../../app/server/research/executor/job";
import type { D1BridgeJobStore } from "./d1-job-store";
import type { ExecutorMaintenanceStore } from "./maintenance-store";
import type { ExecutorReceiptStore } from "./receipt-store";
import type { SiteBridgeClient } from "./site-client";

type MaintenanceDependencies = Readonly<{
  jobs: Readonly<{
    accept(job: BridgeJob, now: number, signal?: AbortSignal, guard?: () => void): ReturnType<D1BridgeJobStore["accept"]>;
    get(jobId: string, signal?: AbortSignal, guard?: () => void): ReturnType<D1BridgeJobStore["get"]>;
  }>;
  receipts: Readonly<{
    recover(jobId: string, now: number, signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorReceiptStore["recover"]>;
    cleanup(jobId: string, now: number, signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorReceiptStore["cleanup"]>;
  }>;
  store: Readonly<{
    acquire(now: number, signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorMaintenanceStore["acquire"]>;
    next(category: "bootstrap" | "results", generation: number, signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorMaintenanceStore["next"]>;
    takePickupTurn(generation: number, signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorMaintenanceStore["takePickupTurn"]>;
    ensureAcceptance(jobId: string, now: number, signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorMaintenanceStore["ensureAcceptance"]>;
    readAcceptanceDelivery(jobId: string, signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorMaintenanceStore["readAcceptanceDelivery"]>;
    recordAcceptance(jobId: string, now: number, signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorMaintenanceStore["recordAcceptance"]>;
    deferAcceptance(jobId: string, now: number, failure: "temporary" | "authentication" | "protocol" | "conflict", signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorMaintenanceStore["deferAcceptance"]>;
    cleanupPriority(jobId: string, now: number, signal?: AbortSignal, guard?: () => void): ReturnType<ExecutorMaintenanceStore["cleanupPriority"]>;
  }>;
  site: Pick<SiteBridgeClient, "maintenance" | "outbox">;
  bootstrap: (job: BridgeJob, signal: AbortSignal, guard?: () => void) => Promise<unknown>;
  delivery: (jobId: string, signal: AbortSignal, guard?: () => void,
    outboundBudget?: () => number) => Promise<void>;
  acceptNew: boolean;
  wallNow: () => number;
  monoNow: () => number;
}>;

const WHOLE_MS = 30_000;
const CATEGORY_MS = 8_000;
const REQUEST_MS = 5_000;
const FINALIZATION_MS = 1_000;

function safeNow(clock: () => number): number {
  const value = clock();
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - WHOLE_MS) {
    throw new Error("Executor maintenance unavailable");
  }
  return value;
}

function transportFailure(error: unknown): "temporary" | "authentication" | "protocol" | "conflict" {
  if (error instanceof BridgeTransportError) {
    if (error.kind === "authentication" || error.kind === "protocol" || error.kind === "conflict") return error.kind;
  }
  return "temporary";
}

async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, remaining: number,
  maximum = REQUEST_MS): Promise<T> {
  if (remaining <= 0) throw new Error("Executor maintenance deadline exceeded");
  const controller = new AbortController();
  const limit = Math.max(1, Math.min(maximum, Math.ceil(remaining)));
  let rejectTimeout: ((reason: Error) => void) | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => {
    controller.abort();
    rejectTimeout?.(new Error("Executor maintenance deadline exceeded"));
  }, limit);
  const operation = Promise.resolve().then(() => work(controller.signal));
  void operation.catch(() => undefined);
  try { return await Promise.race([operation, timeout]); }
  finally { clearTimeout(timer); controller.abort(); }
}

export async function runExecutorMaintenance(dependencies: MaintenanceDependencies): Promise<{ visited: [number, number, number] }> {
  const wall = dependencies.wallNow();
  const start = safeNow(dependencies.monoNow);
  const wholeEnd = start + WHOLE_MS;
  const wholeGuard = () => {
    if (safeNow(dependencies.monoNow) >= wholeEnd) throw new Error("Executor maintenance deadline exceeded");
  };
  const lease = await bounded((signal) => dependencies.store.acquire(wall, signal, wholeGuard),
    wholeEnd - safeNow(dependencies.monoNow));
  if (!lease) return { visited: [0, 0, 0] };
  const visited: [number, number, number] = [0, 0, 0];
  for (let offset = 0; offset < 3; offset++) {
    const category = ((lease.first + offset) % 3) as 0 | 1 | 2;
    const categoryStart = safeNow(dependencies.monoNow);
    const categoryEnd = Math.min(wholeEnd, categoryStart + CATEGORY_MS);
    const categoryGuard = () => {
      wholeGuard();
      if (safeNow(dependencies.monoNow) >= categoryEnd) throw new Error("Executor maintenance category deadline exceeded");
    };
    if (category === 0) {
      if (safeNow(dependencies.monoNow) < categoryEnd) {
        try {
          const reply = await bounded((signal) => dependencies.site.maintenance({ signal }),
            Math.min(categoryEnd, wholeEnd) - safeNow(dependencies.monoNow));
          visited[0] = reply.visited;
        } catch { visited[0] = 0; }
      }
      continue;
    }
    const active = new Set<Promise<void>>();
    let emptyTurns = 0;
    const remaining = () => Math.min(categoryEnd, wholeEnd) - safeNow(dependencies.monoNow);
    const launch = (work: (signal: AbortSignal) => Promise<void>) => {
      const available = remaining();
      if (available <= 0) return false;
      const promise = bounded(work, available, available)
        .catch(() => undefined).finally(() => active.delete(promise));
      active.add(promise);
      return true;
    };
    const accept = async (job: BridgeJob, signal: AbortSignal) => {
      categoryGuard();
      const stored = await dependencies.jobs.accept(job, dependencies.wallNow(), signal, categoryGuard);
      await dependencies.store.ensureAcceptance(stored.job.jobId, dependencies.wallNow(), signal, categoryGuard);
      const state = await dependencies.store.readAcceptanceDelivery(stored.job.jobId, signal, categoryGuard);
      if (state.acknowledgedAt !== null || state.stoppedCode !== null
        || dependencies.wallNow() < state.nextAttemptAt || signal.aborted) return;
      const outboundRemaining = remaining() - FINALIZATION_MS;
      if (outboundRemaining <= 0) return;
      try {
        const proof = await bounded((requestSignal) => dependencies.bootstrap(
          stored.job, requestSignal, categoryGuard), outboundRemaining);
        if (proof && !signal.aborted) await dependencies.store.recordAcceptance(
          stored.job.jobId, dependencies.wallNow(), signal, categoryGuard);
      } catch (error) {
        if (!signal.aborted) await dependencies.store.deferAcceptance(stored.job.jobId,
          dependencies.wallNow(), transportFailure(error), signal, categoryGuard);
      }
    };
    while (visited[category] < 10 && safeNow(dependencies.monoNow) < categoryEnd
      && safeNow(dependencies.monoNow) < wholeEnd) {
      if (active.size >= 2) { await Promise.race(active); continue; }
      if (category === 1) {
        let turn: "existing" | "pickup";
        try {
          turn = await bounded((signal) => dependencies.store.takePickupTurn(lease.generation, signal, categoryGuard),
            Math.min(categoryEnd, wholeEnd) - safeNow(dependencies.monoNow));
        } catch { break; }
        if (turn === "pickup" && dependencies.acceptNew) {
          let page: Awaited<ReturnType<SiteBridgeClient["outbox"]>>;
          try {
            page = await bounded((signal) => dependencies.site.outbox({ signal }),
              Math.min(categoryEnd, wholeEnd) - safeNow(dependencies.monoNow));
          } catch { break; }
          if (page.jobs.length === 0) {
            emptyTurns += 1;
            if (emptyTurns >= 2) break;
            continue;
          }
          emptyTurns = 0;
          for (const job of page.jobs) {
            if (visited[1] >= 10 || active.size >= 2) break;
            try { categoryGuard(); } catch { break; }
            if (!launch((signal) => accept(job, signal))) break;
            visited[1] += 1;
          }
          continue;
        }
        let id: string | null;
        try {
          id = await bounded((signal) => dependencies.store.next("bootstrap", lease.generation, signal, categoryGuard),
            Math.min(categoryEnd, wholeEnd) - safeNow(dependencies.monoNow));
        } catch { break; }
        if (!id) {
          emptyTurns += 1;
          if (emptyTurns >= (dependencies.acceptNew ? 2 : 1)) break;
          continue;
        }
        emptyTurns = 0;
        if (!launch(async (signal) => {
          const stored = await dependencies.jobs.get(id, signal, categoryGuard);
          if (!stored || signal.aborted) return;
          await accept(stored.job, signal);
        })) break;
        visited[1] += 1;
      } else {
        let id: string | null;
        try {
          id = await bounded((signal) => dependencies.store.next("results", lease.generation, signal, categoryGuard),
            Math.min(categoryEnd, wholeEnd) - safeNow(dependencies.monoNow));
        } catch { break; }
        if (!id) break;
        if (!launch(async (signal) => {
          const now = dependencies.wallNow();
          let priority = true;
          try { priority = await dependencies.store.cleanupPriority(id, now, signal, categoryGuard); }
          catch { /* Unknown state keeps cleanup fail-closed ahead of delivery. */ }
          if (priority) {
            try { await dependencies.receipts.cleanup(id, now, signal, categoryGuard); }
            catch { /* Delivery remains independently eligible. */ }
          }
          if (signal.aborted) return;
          const outboundRemaining = remaining() - FINALIZATION_MS;
          if (outboundRemaining > 0) {
            try { await dependencies.delivery(id, signal, categoryGuard,
              () => Math.min(REQUEST_MS, remaining() - FINALIZATION_MS)); }
            catch { /* Cleanup remains independently eligible. */ }
          }
          if (signal.aborted) return;
          await dependencies.receipts.cleanup(id, dependencies.wallNow(), signal, categoryGuard);
        })) break;
        visited[2] += 1;
      }
    }
    await Promise.all(active);
  }
  return { visited };
}
