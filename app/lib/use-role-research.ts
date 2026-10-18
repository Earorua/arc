"use client";

import { useLayoutEffect, useState } from "react";
import {
  researchRequestSchema,
  researchRunPublicViewSchema,
  type ResearchPlanningData,
  type ResearchRecoverRequest,
  type ResearchRequest,
  type ResearchRunPublicView,
} from "../contracts/research";
import { researchClient, ResearchClientError, type ResearchClient, type ResearchClientResult } from "./research-client";
import {
  clearResearchRecovery,
  createKnownResearchRecovery,
  createPendingResearchRecovery,
  readLegacyResearchRecovery,
  readResearchRecovery,
  removeLegacyResearchRecovery,
  saveResearchRecovery,
  type LegacyResearchRecovery,
  type PendingResearchRecovery,
  type ResearchRecoveryRecord,
  type ResearchRecoveryStorage,
} from "./research-recovery-storage";

export type RoleResearchState =
  | { kind: "idle" | "submitting" }
  | { kind: "queued" | "researching" | "validating" | "ready" | "needs-review"; runId: string }
  | { kind: "failed"; runId?: string };
export type RoleResearchInput = Omit<ResearchRequest, "mutationId">;
export type RoleResearchOptions = {
  /** Pass null while the session is pending. Eligibility permits writes only. */
  userId: string | null;
  eligible: boolean;
  /** Whether Setup is the currently active surface. */
  active: boolean;
  signal?: AbortSignal;
  client?: ResearchClient;
  storage?: ResearchRecoveryStorage;
  createMutationId?: () => string;
};

class LocalResearchStorageError extends Error {
  readonly status = 503;
  readonly code = "RESEARCH_UNAVAILABLE" as const;
  readonly requestId = null;
  readonly recovery = "retry-or-flagship" as const;

  constructor(kind: "read" | "write") {
    super(kind === "read"
      ? "Arc could not access recovery details in device storage. Make storage available, then check again."
      : "Arc could not save recovery details in device storage. Make storage available, then try again.");
    this.name = "LocalResearchStorageError";
  }
}

export type RoleResearchError = ResearchClientError | LocalResearchStorageError;
type View = {
  state: RoleResearchState;
  run: ResearchRunPublicView | null;
  error: RoleResearchError | null;
  requestId: string | null;
  busy: boolean;
  restoring: boolean;
  recoveryUncertain: boolean;
  replacementPending: boolean;
};
export type RoleResearchController = View & {
  planningData: ResearchPlanningData | null;
  start(input: RoleResearchInput): Promise<boolean>;
  refresh(): Promise<boolean>;
  retry(): Promise<boolean>;
  confirmReplacement(): Promise<boolean>;
  cancelReplacement(): void;
  reset(): void;
};

const inputSchema = researchRequestSchema.omit({ mutationId: true }).strict();
type RecoveryLocator = { record: ResearchRecoveryRecord; legacy: false } | { record: LegacyResearchRecovery; legacy: true };
type PendingLocator = { record: PendingResearchRecovery; legacy: false };
type Snapshot = View & { owner: string | null };
const emptyView = (): View => ({
  state: { kind: "idle" }, run: null, error: null, requestId: null, busy: false,
  restoring: false, recoveryUncertain: false, replacementPending: false,
});
const normalizedRole = (role: string) => role.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
const sameRole = (a: RoleResearchInput, b: RoleResearchInput) => normalizedRole(a.role) === normalizedRole(b.role) && a.locale === b.locale;
const isActiveRun = (run: ResearchRunPublicView | null) => run?.state === "queued" || run?.state === "researching" || run?.state === "validating";
const isPending = (value: RecoveryLocator | null): value is PendingLocator => value !== null && !value.legacy && value.record.state === "pending";

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
  let locator: RecoveryLocator | null = null;
  let storageUnavailable = false;
  let stagedReplacement: { owner: string; epoch: number; input: RoleResearchInput } | null = null;
  let operation: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = 1_000;

  const unavailableStorage: ResearchRecoveryStorage = {
    getItem() { throw new Error("storage-unavailable"); },
    setItem() { throw new Error("storage-unavailable"); },
    removeItem() { throw new Error("storage-unavailable"); },
  };
  function storage() {
    try { return initial.storage ?? window.localStorage; }
    catch { return unavailableStorage; }
  }
  function emit() {
    view = {
      ...view,
      recoveryUncertain: storageUnavailable || isPending(locator),
      replacementPending: stagedReplacement !== null,
    };
    if (mounted) publish({ ...view, owner });
  }
  function clearTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
  function stop() {
    epoch += 1;
    clearTimer();
    operation?.abort();
    operation = null;
    stagedReplacement = null;
    view = {
      ...view, busy: false, restoring: false, replacementPending: false,
      state: !view.run && view.state.kind === "submitting" ? { kind: "idle" } : view.state,
    };
  }
  function available(caller: string | null, write = false) {
    return mounted && caller !== null && caller === owner && caller === context.userId
      && context.active && !context.signal?.aborted && document.visibilityState !== "hidden"
      && (!write || context.eligible);
  }
  function storageError(kind: "read" | "write", retainView = true) {
    const error = new LocalResearchStorageError(kind);
    view = {
      ...(retainView ? view : emptyView()),
      state: view.run ? view.state : { kind: "failed" },
      error, requestId: null, busy: false, restoring: false,
    };
    emit();
  }
  function loadLocator(currentOwner: string) {
    const current = readResearchRecovery(storage(), currentOwner);
    if (current.status === "unavailable") {
      locator = null;
      storageUnavailable = true;
      return;
    }
    if (current.status === "found") {
      locator = { record: current.record, legacy: false };
      storageUnavailable = false;
      return;
    }
    const legacy = readLegacyResearchRecovery(storage());
    if (legacy.status === "unavailable") {
      locator = null;
      storageUnavailable = true;
      return;
    }
    locator = legacy.status === "found" ? { record: legacy.record, legacy: true } : null;
    storageUnavailable = false;
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
  function saveKnown(caller: string, run: ResearchRunPublicView, previous: RecoveryLocator | null) {
    if (previous && !previous.legacy && previous.record.state === "known") return true;
    const known = createKnownResearchRecovery(caller, { runId: run.id, role: run.role, locale: run.locale });
    if (!saveResearchRecovery(storage(), known)) return false;
    locator = { record: known, legacy: false };
    storageUnavailable = false;
    if (previous?.legacy) removeLegacyResearchRecovery(storage());
    return true;
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
    const previousLocator = locator;
    const current = () => available(caller) && epoch === operationEpoch && operation === token && !token.signal.aborted;
    view = {
      ...view, error: null, requestId: null, busy: true,
      restoring: !submitting && (!view.run || isPending(previousLocator)),
      ...(submitting && !view.run ? { state: { kind: "submitting" as const } } : {}),
    };
    emit();
    try {
      const result = await action(token.signal);
      if (!current()) return false;
      const parsed = researchRunPublicViewSchema.safeParse(result.run);
      if (!parsed.success || !sameRole(parsed.data, expected) || expected.runId && parsed.data.id !== expected.runId) {
        throw new ResearchClientError("INTERNAL", result.requestId, true);
      }
      const run = parsed.data;
      const saved = saveKnown(caller, run, previousLocator);
      stagedReplacement = null;
      view = {
        state: { kind: run.state, runId: run.id }, run,
        error: saved ? result.error : new LocalResearchStorageError("write"),
        requestId: saved ? result.requestId : null,
        busy: false, restoring: false,
        recoveryUncertain: !saved && isPending(previousLocator),
        replacementPending: false,
      };
      return true;
    } catch (error) {
      if (!current()) return false;
      const safeError = error instanceof ResearchClientError ? error : new ResearchClientError("RESEARCH_UNAVAILABLE");
      const pending = isPending(locator);
      if (!pending && (safeError.code === "NOT_FOUND" || safeError.code === "UNAUTHENTICATED")) {
        locator = null;
        view = emptyView();
        clearResearchRecovery(storage());
      }
      view = {
        ...view, state: view.run ? view.state : { kind: "failed" }, error: safeError,
        requestId: safeError.requestId, busy: false, restoring: false,
      };
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
    if (!available(caller) || operation) return false;
    const retryingUnavailableRead = storageUnavailable;
    if (storageUnavailable) {
      loadLocator(caller!);
      if (storageUnavailable) { storageError("read"); return false; }
    }
    if (!locator) {
      if (retryingUnavailableRead) {
        view = emptyView();
        emit();
      }
      return false;
    }
    if (resetDelay) delay = 1_000;
    if (locator.legacy) {
      const expected = locator.record;
      return execute(caller!, (signal) => client.getResearch(expected.runId, signal), expected, false);
    }
    if (locator.record.state === "pending") {
      const expected = locator.record.recovery;
      return execute(caller!, (signal) => client.recoverResearch(expected, signal), expected, false);
    }
    const expected = locator.record;
    return execute(caller!, (signal) => client.getResearch(expected.runId, signal), expected, false);
  }
  function persistPending(caller: string, recovery: ResearchRecoverRequest) {
    const pending = createPendingResearchRecovery(caller, recovery);
    if (!saveResearchRecovery(storage(), pending)) {
      storageError("write");
      return false;
    }
    locator = { record: pending, legacy: false };
    storageUnavailable = false;
    return true;
  }
  async function performStart(caller: string, input: RoleResearchInput) {
    let request: ResearchRequest;
    try { request = researchRequestSchema.parse({ ...input, mutationId: createMutationId() }); }
    catch {
      const error = new ResearchClientError("INTERNAL");
      view = { ...view, state: view.run ? view.state : { kind: "failed" }, error, requestId: error.requestId };
      emit();
      return false;
    }
    const recovery: ResearchRecoverRequest = { kind: "start", ...request };
    if (!persistPending(caller, recovery)) return false;
    stagedReplacement = null;
    view = emptyView();
    delay = 1_000;
    return execute(caller, (signal) => client.startResearch(request, signal), request, true);
  }

  return {
    connect(next: RoleResearchOptions) {
      context = next;
      mounted = true;
      if (owner !== next.userId) {
        stop();
        if (owner !== null) clearResearchRecovery(storage());
        owner = next.userId;
        locator = null;
        storageUnavailable = false;
        stagedReplacement = null;
        view = emptyView();
        delay = 1_000;
        // Load synchronously in the hook's layout effect. A caller layout effect
        // may submit immediately afterward and must see any older pending slot.
        if (owner !== null) loadLocator(owner);
      }
      const connectionEpoch = epoch;
      const resume = () => {
        if (!available(owner)) return;
        if (storageUnavailable) storageError("read");
        else if (locator) void refresh(owner);
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
    async start(caller: string | null, rawInput: RoleResearchInput) {
      if (!available(caller, true) || operation) return false;
      let input: RoleResearchInput;
      try { input = inputSchema.parse(rawInput); }
      catch {
        const error = new ResearchClientError("INVALID_INPUT");
        view = { ...view, state: view.run ? view.state : { kind: "failed" }, error, requestId: error.requestId };
        emit();
        return false;
      }
      if (storageUnavailable) {
        loadLocator(caller!);
        if (storageUnavailable) { storageError("read"); return false; }
      }
      if (isPending(locator)) {
        stagedReplacement = { owner: caller!, epoch, input };
        emit();
        return false;
      }
      if (view.run && sameRole(view.run, input)) return true;
      return performStart(caller!, input);
    },
    refresh,
    async retry(caller: string | null) {
      const run = view.run;
      if (!available(caller, true) || operation || isPending(locator) || !run || !run.retryable
        || run.state !== "failed" && run.state !== "needs-review") return false;
      let mutationId: string;
      try { mutationId = createMutationId(); }
      catch {
        const error = new ResearchClientError("INTERNAL");
        view = { ...view, error, requestId: error.requestId };
        emit();
        return false;
      }
      const recovery: ResearchRecoverRequest = {
        kind: "retry", mutationId, sourceRunId: run.id, role: run.role, locale: run.locale,
      };
      if (!persistPending(caller!, recovery)) return false;
      delay = 1_000;
      return execute(caller!, (signal) => client.retryResearch(run.id, { mutationId }, signal), run, true);
    },
    async confirmReplacement(caller: string | null) {
      const staged = stagedReplacement;
      if (!staged || !available(caller, true) || operation || staged.owner !== caller || staged.epoch !== epoch
        || !isPending(locator)) return false;
      return performStart(caller!, staged.input);
    },
    cancelReplacement(caller: string | null) {
      if (caller !== owner) return;
      stagedReplacement = null;
      emit();
    },
    reset(caller: string | null) {
      if (caller === null || caller !== owner) return;
      stop();
      stagedReplacement = null;
      if (!isPending(locator) && !storageUnavailable) {
        locator = null;
        clearResearchRecovery(storage());
      }
      view = emptyView();
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
    state: view.state, run: view.run, error: view.error, requestId: view.requestId, busy: view.busy,
    restoring: view.restoring, recoveryUncertain: view.recoveryUncertain, replacementPending: view.replacementPending,
    planningData: view.run?.state === "ready" ? view.run.planningData : null,
    start: (input) => controller.start(userId, input),
    refresh: () => controller.refresh(userId),
    retry: () => controller.retry(userId),
    confirmReplacement: () => controller.confirmReplacement(userId),
    cancelReplacement: () => controller.cancelReplacement(userId),
    reset: () => controller.reset(userId),
  };
}
