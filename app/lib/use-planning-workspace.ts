"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  planningMutationResponseSchema,
  planningWorkspaceResponseSchema,
  type GeneratePlanningRequest,
  type PlanningEventRequest,
  type PlanningMutationResponse,
  type ReplanDecisionRequest,
} from "../contracts/planning-api";
import {
  planningEventInputSchema,
  planningMutationResultSchema,
  planningSourceContextSchema,
  planningWorkspaceSchema,
  type PlanningEvent,
  type PlanningEventInput,
  type PlanningMutationResult,
  type PlanningSourceContext,
  type PlanningWorkspace,
} from "../contracts/planning";
import { authClient } from "./auth-client";
import { isArcApiError } from "./cloud-client";
import { planningClient, type PlanningClient } from "./planning-client";
import {
  createLocalPlanningRepository,
  type LocalPlanningImportSource,
  type LocalPlanningRepository,
  type PlanningImportProgress,
} from "./planning/local-repository";
import { fingerprint } from "./planning/fingerprint";

export type PlanningStateSource = "restoring" | "local" | "cloud" | "offline-cloud";
export type PlanningMigrationState = "none" | "available" | "importing" | "imported" | "failed";
export type PlanningRecoveryState = "none" | "session-expired" | "conflict" | "unavailable" | "version-unavailable";

export type PlanningWorkspaceController = {
  workspace: PlanningWorkspace | null;
  sourceContext: PlanningSourceContext | null;
  source: PlanningStateSource;
  migration: PlanningMigrationState;
  recovery: PlanningRecoveryState;
  generate(input: GeneratePlanningRequest): Promise<boolean>;
  record(input: PlanningEventInput): Promise<boolean>;
  accept(candidatePlanVersionId: string): Promise<boolean>;
  discard(candidatePlanVersionId: string): Promise<boolean>;
  importLocal(): Promise<boolean>;
  dismissMigration(): void;
  retry(): Promise<void>;
};

type ArcSessionState = {
  data: { user: { id: string; name: string; email: string } } | null;
  isPending: boolean;
};

type PlanningWorkspaceOptions = {
  client: PlanningClient;
  local: LocalPlanningRepository;
  createMutationId: () => string;
  now: () => Date;
  useSession: () => ArcSessionState;
};

type PlanningIdentity = "guest" | `user:${string}`;
type PlanningOperationToken = { identity: PlanningIdentity; generation: number; lifecycleEpoch: number };

const IMPORT_EVENT_LINEAGE_KIND = "arc-planning-import-event-lineage";
const IMPORT_EVENT_LINEAGE_VERSION = 1;

function useRuntimeSession(): ArcSessionState {
  const session = authClient.useSession();
  return {
    data: session.data?.user ? { user: session.data.user } : null,
    isPending: session.isPending,
  };
}

export function usePlanningWorkspace(options: Partial<PlanningWorkspaceOptions> = {}): PlanningWorkspaceController {
  const useSession = options.useSession ?? useRuntimeSession;
  const session = useSession();
  const currentIdentity: PlanningIdentity = session.data?.user.id
    ? `user:${session.data.user.id}`
    : "guest";
  const clientRef = useRef(options.client ?? planningClient);
  const localRef = useRef(options.local ?? createLocalPlanningRepository());
  const nowRef = useRef(options.now ?? (() => new Date()));
  const createMutationIdRef = useRef(options.createMutationId ?? (() =>
    `mutation-${nowRef.current().getTime().toString(36)}-${crypto.randomUUID()}`));
  const [workspace, setWorkspace] = useState<PlanningWorkspace | null>(null);
  const [sourceContext, setSourceContext] = useState<PlanningSourceContext | null>(null);
  const [source, setSource] = useState<PlanningStateSource>("restoring");
  const [migration, setMigration] = useState<PlanningMigrationState>("none");
  const [recovery, setRecovery] = useState<PlanningRecoveryState>("none");
  const [visibleIdentity, setVisibleIdentity] = useState<PlanningIdentity | null>(null);
  const visibleIdentityRef = useRef<PlanningIdentity | null>(null);
  const workspaceRef = useRef<PlanningWorkspace | null>(null);
  const sourceRef = useRef<PlanningStateSource>("restoring");
  const userIdRef = useRef<string | null>(session.data?.user.id ?? null);
  const importSourceRef = useRef<LocalPlanningImportSource | null>(null);
  const loadGenerationRef = useRef(0);
  const operationContextRef = useRef<{ identity: PlanningIdentity; generation: number }>({
    identity: currentIdentity,
    generation: 0,
  });
  const lifecycleRef = useRef({ mounted: false, epoch: 0 });
  const activeOperationRef = useRef<PlanningOperationToken | null>(null);

  const publishWorkspace = useCallback((value: unknown) => {
    const parsed = value === null ? null : planningWorkspaceSchema.parse(value);
    workspaceRef.current = parsed;
    setWorkspace(parsed);
    return parsed;
  }, []);

  const publishSource = useCallback((value: PlanningStateSource) => {
    sourceRef.current = value;
    setSource(value);
  }, []);

  const publishSourceContext = useCallback((value: unknown) => {
    const parsed = value === null || value === undefined ? null : planningSourceContextSchema.parse(value);
    setSourceContext(parsed);
    return parsed;
  }, []);

  const publishVisibleIdentity = useCallback((value: PlanningIdentity) => {
    visibleIdentityRef.current = value;
    setVisibleIdentity(value);
  }, []);

  const load = useCallback(async () => {
    const loadGeneration = ++loadGenerationRef.current;
    const userId = userIdRef.current;
    const identity: PlanningIdentity = userId ? `user:${userId}` : "guest";
    operationContextRef.current = { identity, generation: loadGeneration };
    const sessionIsCurrent = () => userIdRef.current === userId && loadGenerationRef.current === loadGeneration;
    setRecovery("none");
    if (!userId) {
      const localWorkspace = await localRef.current.load();
      if (!sessionIsCurrent()) return;
      publishWorkspace(localWorkspace);
      publishSourceContext(null);
      publishVisibleIdentity(identity);
      importSourceRef.current = null;
      setMigration("none");
      publishSource("local");
      return;
    }
    try {
      const cloudEnvelope = planningWorkspaceResponseSchema.parse(await clientRef.current.loadWorkspace());
      if (!sessionIsCurrent()) return;
      const cloudWorkspace = cloudEnvelope.workspace;
      if (cloudWorkspace) {
        publishWorkspace(cloudWorkspace);
        publishSourceContext(cloudEnvelope.sourceContext ?? null);
        publishVisibleIdentity(identity);
        importSourceRef.current = null;
        setMigration("none");
        publishSource("cloud");
        return;
      }
      const localSource = await localRef.current.readImportSource();
      if (!sessionIsCurrent()) return;
      importSourceRef.current = localSource;
      if (localSource) {
        const progress = await localRef.current.readImportProgress(userId, localSource.workspaceFingerprint);
        if (!sessionIsCurrent()) return;
        publishWorkspace(localSource.workspace);
        publishSourceContext(null);
        publishVisibleIdentity(identity);
        setMigration(progress?.completed ? "imported" : "available");
        publishSource("local");
      } else {
        publishWorkspace(null);
        publishSourceContext(null);
        publishVisibleIdentity(identity);
        setMigration("none");
        publishSource("cloud");
      }
    } catch (error) {
      if (!sessionIsCurrent()) return;
      if (visibleIdentityRef.current !== identity) {
        publishWorkspace(null);
        publishSourceContext(null);
        importSourceRef.current = null;
        setMigration("none");
      }
      publishVisibleIdentity(identity);
      handleFailure(error, setRecovery);
      if (workspaceRef.current && sourceRef.current === "cloud") publishSource("offline-cloud");
      else if (!workspaceRef.current) publishSource("offline-cloud");
    }
  }, [publishSource, publishSourceContext, publishVisibleIdentity, publishWorkspace]);

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    lifecycle.mounted = true;
    userIdRef.current = session.data?.user.id ?? null;
    loadGenerationRef.current += 1;
    operationContextRef.current = { identity: currentIdentity, generation: loadGenerationRef.current };
    if (session.isPending) {
      let current = true;
      queueMicrotask(() => {
        if (current) publishSource("restoring");
      });
      return () => {
        current = false;
        lifecycle.mounted = false;
        lifecycle.epoch += 1;
        loadGenerationRef.current += 1;
      };
    }
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      void load().catch((error) => {
        if (current) handleFailure(error, setRecovery);
      });
    });
    return () => {
      current = false;
      lifecycle.mounted = false;
      lifecycle.epoch += 1;
      loadGenerationRef.current += 1;
    };
  }, [currentIdentity, load, publishSource, session.data?.user.id, session.isPending]);

  const captureOperation = useCallback((identity: PlanningIdentity): PlanningOperationToken => ({
    identity,
    generation: loadGenerationRef.current,
    lifecycleEpoch: lifecycleRef.current.epoch,
  }), []);

  const isOperationCurrent = useCallback((token: PlanningOperationToken) =>
    lifecycleRef.current.mounted
      && lifecycleRef.current.epoch === token.lifecycleEpoch
      && operationContextRef.current.identity === token.identity
      && operationContextRef.current.generation === token.generation, []);

  const runOperation = useCallback(async (
    identity: PlanningIdentity,
    action: (token: PlanningOperationToken) => Promise<boolean>,
  ): Promise<boolean> => {
    const token = captureOperation(identity);
    const active = activeOperationRef.current;
    if (!isOperationCurrent(token)
      || (active !== null && active.identity === token.identity && active.generation === token.generation
        && active.lifecycleEpoch === token.lifecycleEpoch)) return false;
    activeOperationRef.current = token;
    try { return await action(token); }
    finally {
      if (activeOperationRef.current === token) activeOperationRef.current = null;
    }
  }, [captureOperation, isOperationCurrent]);

  const publishResult = useCallback((
    value: unknown,
    nextSource: "local" | "cloud",
    token: PlanningOperationToken,
  ) => {
    if (!isOperationCurrent(token)) return false;
    const envelope = nextSource === "cloud" ? planningMutationResponseSchema.parse(value) : null;
    const result = envelope?.result ?? planningMutationResultSchema.parse(value);
    if (!isOperationCurrent(token)) return false;
    publishWorkspace(result.workspace);
    publishSourceContext(envelope?.sourceContext ?? null);
    publishVisibleIdentity(token.identity);
    publishSource(nextSource);
    setRecovery("none");
    return true;
  }, [isOperationCurrent, publishSource, publishSourceContext, publishVisibleIdentity, publishWorkspace]);

  const mutate = useCallback(async (
    expectedIdentity: PlanningIdentity,
    localAction: (repository: LocalPlanningRepository) => Promise<PlanningMutationResult>,
    cloudAction: (client: PlanningClient) => Promise<PlanningMutationResponse>,
  ) => runOperation(expectedIdentity, async (token) => {
    try {
      if (token.identity === "guest") {
        const result = await localAction(localRef.current);
        if (!isOperationCurrent(token)) return false;
        return publishResult(result, "local", token);
      }
      if (sourceRef.current !== "cloud") return false;
      const result = await cloudAction(clientRef.current);
      if (!isOperationCurrent(token)) return false;
      return publishResult(result, "cloud", token);
    } catch (error) {
      if (!isOperationCurrent(token)) return false;
      handleFailure(error, setRecovery);
      if (token.identity !== "guest" && workspaceRef.current && isUnavailable(error)) publishSource("offline-cloud");
      return false;
    }
  }), [isOperationCurrent, publishResult, publishSource, runOperation]);

  const generate = useCallback((input: GeneratePlanningRequest) => mutate(
    currentIdentity,
    (repository) => repository.generate(input),
    (client) => client.generate(input),
  ), [currentIdentity, mutate]);

  const guardedGenerate = useCallback((input: GeneratePlanningRequest) => {
    if (visibleIdentity !== currentIdentity) return Promise.resolve(false);
    return generate(input);
  }, [currentIdentity, generate, visibleIdentity]);

  const record = useCallback((input: PlanningEventInput) => {
    if (visibleIdentity !== currentIdentity) return Promise.resolve(false);
    let parsed: PlanningEventInput;
    try { parsed = planningEventInputSchema.parse(input); }
    catch { return Promise.resolve(false); }
    const current = workspaceRef.current;
    if (!current) return Promise.resolve(false);
    const request: PlanningEventRequest = {
      mutationId: createMutationIdRef.current(),
      baseVersionId: current.activePlanVersionId,
      event: parsed,
    };
    return mutate(
      currentIdentity,
      (repository) => repository.appendEvent(request),
      (client) => client.appendEvent(request),
    );
  }, [currentIdentity, mutate, visibleIdentity]);

  const decide = useCallback((kind: "accept" | "discard", candidatePlanVersionId: string) => {
    if (visibleIdentity !== currentIdentity) return Promise.resolve(false);
    const current = workspaceRef.current;
    if (!current) return Promise.resolve(false);
    const request: ReplanDecisionRequest = {
      mutationId: createMutationIdRef.current(),
      baseVersionId: current.activePlanVersionId,
      candidatePlanVersionId,
    };
    return mutate(
      currentIdentity,
      (repository) => kind === "accept" ? repository.accept(request) : repository.discard(request),
      (client) => kind === "accept" ? client.acceptReplan(request) : client.discardReplan(request),
    );
  }, [currentIdentity, mutate, visibleIdentity]);

  const importLocal = useCallback(() => runOperation(currentIdentity, async (token) => {
    if (visibleIdentity !== currentIdentity) return false;
    if (!isOperationCurrent(token) || token.identity === "guest") return false;
    const userId = token.identity.slice("user:".length);
    let sourceSnapshot = importSourceRef.current;
    if (!sourceSnapshot) {
      sourceSnapshot = await localRef.current.readImportSource();
      if (!isOperationCurrent(token)) return false;
    }
    if (!userId || !sourceSnapshot) return false;
    setMigration("importing");
    try {
      let progress = await localRef.current.readImportProgress(userId, sourceSnapshot.workspaceFingerprint);
      if (!isOperationCurrent(token)) return false;
      if (!progress) {
        progress = {
          userId,
          initialMutationId: sourceSnapshot.generationMutationId,
          lastImportedSequence: 0,
          completed: false,
        };
      }
      let cloudWorkspace = await generateImportWorkspace(clientRef.current, sourceSnapshot, progress);
      if (!isOperationCurrent(token)) return false;
      if (!cloudWorkspace) throw new Error("Planning import did not produce a workspace.");
      await localRef.current.updateImportProgress(sourceSnapshot.workspaceFingerprint, progress);
      if (!isOperationCurrent(token)) return false;

      if (progress.lastImportedSequence > 0) {
        const resumed = planningWorkspaceResponseSchema.parse(await clientRef.current.loadWorkspace());
        cloudWorkspace = planningWorkspaceSchema.parse(resumed.workspace);
        if (!isOperationCurrent(token)) return false;
      }

      for (const event of [...sourceSnapshot.workspace.events].sort((left, right) => left.sequence - right.sequence)) {
        if (event.sequence <= progress.lastImportedSequence) continue;
        const result = await replayImportEvent(clientRef.current, cloudWorkspace, event);
        if (!isOperationCurrent(token)) return false;
        cloudWorkspace = planningMutationResultSchema.parse(result).workspace;
        progress = { ...progress, lastImportedSequence: event.sequence };
        await localRef.current.updateImportProgress(sourceSnapshot.workspaceFingerprint, progress);
        if (!isOperationCurrent(token)) return false;
      }
      const loadedEnvelope = planningWorkspaceResponseSchema.parse(await clientRef.current.loadWorkspace());
      if (!isOperationCurrent(token)) return false;
      const loaded = planningWorkspaceSchema.parse(loadedEnvelope.workspace);
      if (!importMatches(sourceSnapshot.workspace, loaded)) throw new Error("Planning import verification failed.");
      await localRef.current.updateImportProgress(sourceSnapshot.workspaceFingerprint, { ...progress, completed: true });
      if (!isOperationCurrent(token)) return false;
      publishWorkspace(loaded);
      publishSourceContext(loadedEnvelope.sourceContext ?? null);
      publishVisibleIdentity(token.identity);
      publishSource("cloud");
      setMigration("imported");
      setRecovery("none");
      return true;
    } catch (error) {
      if (!isOperationCurrent(token)) return false;
      setMigration("failed");
      handleFailure(error, setRecovery);
      return false;
    }
  }), [currentIdentity, isOperationCurrent, publishSource, publishSourceContext, publishVisibleIdentity, publishWorkspace, runOperation, visibleIdentity]);

  return {
    workspace: visibleIdentity === currentIdentity ? workspace : null,
    sourceContext: visibleIdentity === currentIdentity ? sourceContext : null,
    source: visibleIdentity === currentIdentity ? source : "restoring",
    migration: visibleIdentity === currentIdentity ? migration : "none",
    recovery: visibleIdentity === currentIdentity ? recovery : "none",
    generate: guardedGenerate,
    record,
    accept: (candidatePlanVersionId) => decide("accept", candidatePlanVersionId),
    discard: (candidatePlanVersionId) => decide("discard", candidatePlanVersionId),
    importLocal,
    dismissMigration: () => setMigration("none"),
    retry: load,
  };
}

async function generateImportWorkspace(
  client: PlanningClient,
  source: LocalPlanningImportSource,
  progress: PlanningImportProgress,
): Promise<PlanningWorkspace> {
  const initial = source.initialWorkspace;
  const activePath = initial.pathVersions.find(({ id }) => id === initial.activePathVersionId);
  const activePlan = initial.planVersions.find(({ id }) => id === initial.activePlanVersionId);
  if (!activePath || !activePlan) throw new Error("Planning import source is invalid.");
  const result = await client.generate({
    mutationId: progress.initialMutationId,
    roleId: "ai-native-full-stack-engineer",
    planningDate: activePlan.planningDate,
    audit: initial.audit,
    availability: initial.availability,
    target: initial.target,
    selectedScope: activePath.scopeMode,
  });
  return planningMutationResponseSchema.parse(result).result.workspace;
}

async function replayImportEvent(client: PlanningClient, workspace: PlanningWorkspace, event: PlanningEvent) {
  const request = {
    mutationId: event.mutationId,
    baseVersionId: workspace.activePlanVersionId,
  };
  if (event.kind === "replan_accepted") {
    return (await client.acceptReplan({ ...request, candidatePlanVersionId: event.candidatePlanVersionId })).result;
  }
  if (event.kind === "replan_discarded") {
    return (await client.discardReplan({ ...request, candidatePlanVersionId: event.candidatePlanVersionId })).result;
  }
  return (await client.appendEvent({ ...request, event: planningEventInputSchema.parse(stripEventMetadata(event)) })).result;
}

function stripEventMetadata(event: Exclude<PlanningEvent, { kind: "replan_accepted" | "replan_discarded" }>): PlanningEventInput {
  const input: Record<string, unknown> = { ...event };
  delete input.eventId;
  delete input.mutationId;
  delete input.sequence;
  delete input.targetPlanVersionId;
  delete input.occurredAt;
  return planningEventInputSchema.parse(input);
}

function importMatches(local: PlanningWorkspace, cloud: PlanningWorkspace): boolean {
  return local.activePathVersionId === cloud.activePathVersionId
    && local.activePlanVersionId === cloud.activePlanVersionId
    && local.pendingPlanVersionId === cloud.pendingPlanVersionId
    && importEventFingerprint(local.events) === importEventFingerprint(cloud.events);
}

function importEventFingerprint(events: readonly PlanningEvent[]): string {
  let lineage = fingerprint({ kind: IMPORT_EVENT_LINEAGE_KIND, version: IMPORT_EVENT_LINEAGE_VERSION });
  for (const event of events) {
    const canonicalEvent: Record<string, unknown> = { ...event };
    delete canonicalEvent.eventId;
    delete canonicalEvent.occurredAt;
    lineage = fingerprint({
      kind: IMPORT_EVENT_LINEAGE_KIND,
      version: IMPORT_EVENT_LINEAGE_VERSION,
      previousLineageFingerprint: lineage,
      event: canonicalEvent,
    });
  }
  return lineage;
}

function handleFailure(error: unknown, publish: (state: PlanningRecoveryState) => void) {
  if (isArcApiError(error) && error.action === "rebuild") publish("version-unavailable");
  else if (isArcApiError(error) && (error.status === 401 || error.action === "sign-in")) publish("session-expired");
  else if (isArcApiError(error) && (error.status === 409 || error.code === "CONFLICT")) publish("conflict");
  else publish("unavailable");
}

function isUnavailable(error: unknown): boolean {
  return !isArcApiError(error) || error.status === 429 || error.status >= 500;
}
