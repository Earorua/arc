"use client";

import { useLayoutEffect, useState } from "react";
import { z } from "zod";
import {
  researchRequestSchema,
  researchRunPublicViewSchema,
  type ResearchPlanningData,
  type ResearchRequest,
  type ResearchRunPublicView,
} from "../contracts/research";
import { researchClient, ResearchClientError, type ResearchClient, type ResearchClientResult } from "./research-client";

export type RoleResearchState =
  | { kind: "idle" | "submitting" }
  | { kind: "queued" | "researching" | "validating" | "ready" | "needs-review"; runId: string }
  | { kind: "failed"; runId?: string };
export type RoleResearchInput = Omit<ResearchRequest, "mutationId">;
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type RoleResearchOptions = {
  /** Pass null while the session is pending. Eligibility permits writes only. */
  userId: string | null;
  eligible: boolean;
  /** Whether Setup is the currently active surface. */
  active: boolean;
  signal?: AbortSignal;
  client?: ResearchClient;
  storage?: RecoveryStorage;
  createMutationId?: () => string;
};
type View = {
  state: RoleResearchState;
  run: ResearchRunPublicView | null;
  error: ResearchClientError | null;
  requestId: string | null;
  busy: boolean;
  restoring: boolean;
};
export type RoleResearchController = View & {
  planningData: ResearchPlanningData | null;
  start(input: RoleResearchInput): Promise<boolean>;
  refresh(): Promise<boolean>;
  retry(): Promise<boolean>;
  reset(): void;
};
const storageKey = "arc:role-research:v1";
const recoverySchema = z.object({
  runId: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  role: researchRequestSchema.shape.role,
  locale: researchRequestSchema.shape.locale,
}).strict();
type RecoveryIdentity = z.infer<typeof recoverySchema>;
type Snapshot = View & { owner: string | null };
const emptyView = (): View => ({ state: { kind: "idle" }, run: null, error: null, requestId: null, busy: false, restoring: false });
const normalizedRole = (role: string) => role.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
const sameRole = (a: RoleResearchInput, b: RoleResearchInput) => normalizedRole(a.role) === normalizedRole(b.role) && a.locale === b.locale;
const isActiveRun = (run: ResearchRunPublicView | null) => run?.state === "queued" || run?.state === "researching" || run?.state === "validating";

// Lifecycle state is kept outside React rendering. Each effect connection and
// operation has its own token, so stale completions cannot publish or persist.
function createController(initial: RoleResearchOptions, publish: (value: Snapshot) => void) {
  const client = initial.client ?? researchClient;
  const createMutationId = initial.createMutationId ?? (() => `mutation-${crypto.randomUUID()}`);
  let owner: string | null = null;
  let context: RoleResearchOptions = initial;
  let mounted = false;
  let epoch = 0;
  let view = emptyView();
  let recovery: RecoveryIdentity | null = null;
  let submit: ResearchRequest | null = null;
  let retryAttempt: { runId: string; mutationId: string } | null = null;
  let operation: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = 1_000;

  function storage() { return initial.storage ?? window.localStorage; }
  function removeStored() { try { storage().removeItem(storageKey); } catch { /* Recovery storage is optional. */ } }
  function persist(value: RecoveryIdentity) {
    try { storage().setItem(storageKey, JSON.stringify(value)); } catch { /* In-memory results still work. */ }
  }
  function readStored() {
    try {
      const raw = storage().getItem(storageKey);
      if (raw === null) return null;
      if (raw.length > 1_024) { removeStored(); return null; }
      const parsed = recoverySchema.safeParse(JSON.parse(raw) as unknown);
      if (parsed.success) return parsed.data;
    } catch { /* Never treat storage content as server authority. */ }
    removeStored();
    return null;
  }
  function emit() { if (mounted) publish({ ...view, owner }); }
  function clearTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
  function stop() {
    epoch += 1;
    clearTimer();
    operation?.abort();
    operation = null;
    view = { ...view, busy: false, restoring: false };
  }
  function available(caller: string | null, write = false) {
    return mounted && caller !== null && caller === owner && caller === context.userId
      && context.active && !context.signal?.aborted && document.visibilityState !== "hidden"
      && (!write || context.eligible);
  }
  function schedule() {
    clearTimer();
    if (!available(owner) || operation || !isActiveRun(view.run) || view.error) return;
    const scheduledEpoch = epoch;
    const scheduledOwner = owner;
    timer = setTimeout(() => {
      timer = null;
      if (epoch !== scheduledEpoch || !available(scheduledOwner)) return;
      delay = Math.min(5_000, delay * 2);
      void refresh(scheduledOwner, false);
    }, delay);
  }
  async function execute(
    caller: string,
    action: (signal: AbortSignal) => Promise<ResearchClientResult>,
    expected: RoleResearchInput & { runId?: string },
    submitting: boolean,
  ) {
    clearTimer();
    const token = new AbortController();
    operation = token;
    const operationEpoch = epoch;
    const current = () => available(caller) && epoch === operationEpoch && operation === token && !token.signal.aborted;
    view = { ...view, error: null, requestId: null, busy: true, restoring: !submitting && !view.run,
      ...(submitting && !view.run ? { state: { kind: "submitting" as const } } : {}) };
    emit();
    try {
      const result = await action(token.signal);
      if (!current()) return false;
      const parsed = researchRunPublicViewSchema.safeParse(result.run);
      if (!parsed.success || !sameRole(parsed.data, expected) || expected.runId && parsed.data.id !== expected.runId) {
        throw new ResearchClientError("INTERNAL", result.requestId, true);
      }
      const run = parsed.data;
      recovery = { runId: run.id, role: run.role, locale: run.locale };
      view = { state: { kind: run.state, runId: run.id }, run, error: result.error,
        requestId: result.requestId, busy: false, restoring: false };
      persist(recovery);
      // Refreshing the source run cannot resolve a lost retry POST response.
      // Keep that mutation identity so an explicit retry replays its successor.
      if (submitting || retryAttempt?.runId !== run.id) retryAttempt = null;
      return true;
    } catch (error) {
      if (!current()) return false;
      const safeError = error instanceof ResearchClientError ? error : new ResearchClientError("RESEARCH_UNAVAILABLE");
      if (safeError.code === "NOT_FOUND" || safeError.code === "UNAUTHENTICATED") {
        recovery = null;
        view = emptyView();
        removeStored();
      }
      view = { ...view, state: view.run ? view.state : { kind: "failed" }, error: safeError,
        requestId: safeError.requestId, busy: false, restoring: false };
      return false;
    } finally {
      if (current()) {
        operation = null;
        emit();
        schedule();
      }
    }
  }
  async function refresh(caller: string | null, resetDelay = true) {
    if (!available(caller) || operation || !recovery) return false;
    if (resetDelay) delay = 1_000;
    const expected = recovery;
    return execute(caller!, (signal) => client.getResearch(expected.runId, signal), expected, false);
  }
  return {
    connect(next: RoleResearchOptions) {
      context = next;
      mounted = true;
      if (owner !== next.userId) {
        stop();
        if (owner !== null) removeStored();
        owner = next.userId;
        recovery = null;
        submit = null;
        retryAttempt = null;
        view = emptyView();
        delay = 1_000;
      }
      const connectionEpoch = epoch;
      const resume = () => {
        if (!available(owner)) return;
        if (!recovery) recovery = readStored();
        if (recovery) void refresh(owner);
        else emit();
      };
      const suspend = () => { stop(); emit(); };
      const visibility = () => { if (document.visibilityState === "hidden") suspend(); else resume(); };
      document.addEventListener("visibilitychange", visibility);
      next.signal?.addEventListener("abort", suspend, { once: true });
      queueMicrotask(() => { if (mounted && epoch === connectionEpoch) { emit(); resume(); } });
      return () => {
        mounted = false;
        stop();
        document.removeEventListener("visibilitychange", visibility);
        next.signal?.removeEventListener("abort", suspend);
      };
    },
    async start(caller: string | null, input: RoleResearchInput) {
      if (!available(caller, true) || operation) return false;
      if (view.run && sameRole(view.run, input)) return true;
      try {
        if (!submit || !sameRole(submit, input)) {
          submit = researchRequestSchema.parse({ ...input, mutationId: createMutationId() });
        }
      } catch {
        view = { ...emptyView(), state: { kind: "failed" }, error: new ResearchClientError("INVALID_INPUT"), requestId: "request-unavailable" };
        emit();
        return false;
      }
      const request = submit;
      recovery = null;
      retryAttempt = null;
      view = emptyView();
      removeStored();
      delay = 1_000;
      return execute(caller!, (signal) => client.startResearch(request, signal), request, true);
    },
    refresh,
    async retry(caller: string | null) {
      const run = view.run;
      if (!available(caller, true) || operation || !run || !run.retryable
        || run.state !== "failed" && run.state !== "needs-review") return false;
      try {
        if (!retryAttempt || retryAttempt.runId !== run.id) retryAttempt = { runId: run.id, mutationId: createMutationId() };
      } catch {
        const error = new ResearchClientError("INTERNAL");
        view = { ...view, error, requestId: error.requestId };
        emit();
        return false;
      }
      const attempt = retryAttempt;
      delay = 1_000;
      return execute(caller!, (signal) => client.retryResearch(run.id, { mutationId: attempt.mutationId }, signal), run, true);
    },
    reset(caller: string | null) {
      if (caller !== owner) return;
      stop();
      recovery = null;
      submit = null;
      retryAttempt = null;
      view = emptyView();
      removeStored();
      emit();
    },
  };
}

export function useRoleResearch(options: RoleResearchOptions): RoleResearchController {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({ ...emptyView(), owner: null }));
  const [controller] = useState(() => createController(options, setSnapshot));
  const { userId, eligible, active, signal } = options;
  // Synchronize committed authorization before a caller's layout effect can
  // invoke either current or retained commands. Abandoned renders do not connect.
  useLayoutEffect(() => controller.connect({ userId, eligible, active, signal }), [controller, userId, eligible, active, signal]);
  // Mask in render, before effect cleanup, so account transitions never flash
  // another owner's source, errors, or Request ID.
  const visible = userId !== null && snapshot.owner === userId && active && !signal?.aborted;
  const view = visible ? snapshot : emptyView();
  return {
    state: view.state, run: view.run, error: view.error, requestId: view.requestId, busy: view.busy, restoring: view.restoring,
    planningData: view.run?.state === "ready" ? view.run.planningData : null,
    start: (input) => controller.start(userId, input),
    refresh: () => controller.refresh(userId),
    retry: () => controller.retry(userId),
    reset: () => controller.reset(userId),
  };
}
