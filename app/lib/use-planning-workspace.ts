"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratePlanningRequest, PlanningEventRequest, ReplanDecisionRequest } from "../contracts/planning-api";
import {
  planningEventInputSchema,
  planningMutationResultSchema,
  planningWorkspaceSchema,
  type PlanningEvent,
  type PlanningEventInput,
  type PlanningMutationResult,
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
export type PlanningRecoveryState = "none" | "session-expired" | "conflict" | "unavailable";

export type PlanningWorkspaceController = {
  workspace: PlanningWorkspace | null;
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
  const clientRef = useRef(options.client ?? planningClient);
  const localRef = useRef(options.local ?? createLocalPlanningRepository());
  const nowRef = useRef(options.now ?? (() => new Date()));
  const createMutationIdRef = useRef(options.createMutationId ?? (() =>
    `mutation-${nowRef.current().getTime().toString(36)}-${crypto.randomUUID()}`));
  const [workspace, setWorkspace] = useState<PlanningWorkspace | null>(null);
  const [source, setSource] = useState<PlanningStateSource>("restoring");
  const [migration, setMigration] = useState<PlanningMigrationState>("none");
  const [recovery, setRecovery] = useState<PlanningRecoveryState>("none");
  const workspaceRef = useRef<PlanningWorkspace | null>(null);
  const sourceRef = useRef<PlanningStateSource>("restoring");
  const userIdRef = useRef<string | null>(session.data?.user.id ?? null);
  const importSourceRef = useRef<LocalPlanningImportSource | null>(null);
  const inFlightRef = useRef(false);

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

  const load = useCallback(async () => {
    const userId = userIdRef.current;
    const sessionIsCurrent = () => userIdRef.current === userId;
    setRecovery("none");
    if (!userId) {
      const localWorkspace = await localRef.current.load();
      if (!sessionIsCurrent()) return;
      publishWorkspace(localWorkspace);
      importSourceRef.current = null;
      setMigration("none");
      publishSource("local");
      return;
    }
    try {
      const cloudWorkspace = await clientRef.current.loadWorkspace();
      if (!sessionIsCurrent()) return;
      if (cloudWorkspace) {
        publishWorkspace(cloudWorkspace);
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
        setMigration(progress?.completed ? "imported" : "available");
        publishSource("local");
      } else {
        publishWorkspace(null);
        setMigration("none");
        publishSource("cloud");
      }
    } catch (error) {
      if (!sessionIsCurrent()) return;
      handleFailure(error, setRecovery);
      if (workspaceRef.current && sourceRef.current === "cloud") publishSource("offline-cloud");
      else if (!workspaceRef.current) publishSource("offline-cloud");
    }
  }, [publishSource, publishWorkspace]);

  useEffect(() => {
    userIdRef.current = session.data?.user.id ?? null;
    if (session.isPending) {
      let current = true;
      queueMicrotask(() => {
        if (current) publishSource("restoring");
      });
      return () => { current = false; };
    }
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      void load().catch((error) => {
        if (current) handleFailure(error, setRecovery);
      });
    });
    return () => { current = false; };
  }, [load, publishSource, session.data?.user.id, session.isPending]);

  const guarded = useCallback(async (action: () => Promise<boolean>): Promise<boolean> => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    try { return await action(); }
    finally { inFlightRef.current = false; }
  }, []);

  const publishResult = useCallback((value: unknown, nextSource: "local" | "cloud") => {
    const result = planningMutationResultSchema.parse(value);
    publishWorkspace(result.workspace);
    publishSource(nextSource);
    setRecovery("none");
    return true;
  }, [publishSource, publishWorkspace]);

  const mutate = useCallback(async (
    localAction: (repository: LocalPlanningRepository) => Promise<PlanningMutationResult>,
    cloudAction: (client: PlanningClient) => Promise<PlanningMutationResult>,
  ) => guarded(async () => {
    try {
      if (!userIdRef.current) return publishResult(await localAction(localRef.current), "local");
      if (sourceRef.current !== "cloud") return false;
      return publishResult(await cloudAction(clientRef.current), "cloud");
    } catch (error) {
      handleFailure(error, setRecovery);
      if (userIdRef.current && workspaceRef.current && isUnavailable(error)) publishSource("offline-cloud");
      return false;
    }
  }), [guarded, publishResult, publishSource]);

  const generate = useCallback((input: GeneratePlanningRequest) => mutate(
    (repository) => repository.generate(input),
    (client) => client.generate(input),
  ), [mutate]);

  const record = useCallback((input: PlanningEventInput) => {
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
      (repository) => repository.appendEvent(request),
      (client) => client.appendEvent(request),
    );
  }, [mutate]);

  const decide = useCallback((kind: "accept" | "discard", candidatePlanVersionId: string) => {
    const current = workspaceRef.current;
    if (!current) return Promise.resolve(false);
    const request: ReplanDecisionRequest = {
      mutationId: createMutationIdRef.current(),
      baseVersionId: current.activePlanVersionId,
      candidatePlanVersionId,
    };
    return mutate(
      (repository) => kind === "accept" ? repository.accept(request) : repository.discard(request),
      (client) => kind === "accept" ? client.acceptReplan(request) : client.discardReplan(request),
    );
  }, [mutate]);

  const importLocal = useCallback(() => guarded(async () => {
    const userId = userIdRef.current;
    const sourceSnapshot = importSourceRef.current ?? await localRef.current.readImportSource();
    if (!userId || !sourceSnapshot) return false;
    setMigration("importing");
    try {
      let progress = await localRef.current.readImportProgress(userId, sourceSnapshot.workspaceFingerprint);
      if (!progress) {
        progress = {
          userId,
          initialMutationId: sourceSnapshot.generationMutationId,
          lastImportedSequence: 0,
          completed: false,
        };
      }
      let cloudWorkspace = await generateImportWorkspace(clientRef.current, sourceSnapshot, progress);
      if (!cloudWorkspace) throw new Error("Planning import did not produce a workspace.");
      await localRef.current.updateImportProgress(sourceSnapshot.workspaceFingerprint, progress);

      if (progress.lastImportedSequence > 0) {
        cloudWorkspace = planningWorkspaceSchema.parse(await clientRef.current.loadWorkspace());
      }

      for (const event of [...sourceSnapshot.workspace.events].sort((left, right) => left.sequence - right.sequence)) {
        if (event.sequence <= progress.lastImportedSequence) continue;
        const result = await replayImportEvent(clientRef.current, cloudWorkspace, event);
        cloudWorkspace = planningMutationResultSchema.parse(result).workspace;
        progress = { ...progress, lastImportedSequence: event.sequence };
        await localRef.current.updateImportProgress(sourceSnapshot.workspaceFingerprint, progress);
      }
      const loaded = planningWorkspaceSchema.parse(await clientRef.current.loadWorkspace());
      if (!importMatches(sourceSnapshot.workspace, loaded)) throw new Error("Planning import verification failed.");
      await localRef.current.updateImportProgress(sourceSnapshot.workspaceFingerprint, { ...progress, completed: true });
      publishWorkspace(loaded);
      publishSource("cloud");
      setMigration("imported");
      setRecovery("none");
      return true;
    } catch (error) {
      setMigration("failed");
      handleFailure(error, setRecovery);
      return false;
    }
  }), [guarded, publishSource, publishWorkspace]);

  return {
    workspace,
    source,
    migration,
    recovery,
    generate,
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
  return planningMutationResultSchema.parse(result).workspace;
}

function replayImportEvent(client: PlanningClient, workspace: PlanningWorkspace, event: PlanningEvent) {
  const request = {
    mutationId: event.mutationId,
    baseVersionId: workspace.activePlanVersionId,
  };
  if (event.kind === "replan_accepted") {
    return client.acceptReplan({ ...request, candidatePlanVersionId: event.candidatePlanVersionId });
  }
  if (event.kind === "replan_discarded") {
    return client.discardReplan({ ...request, candidatePlanVersionId: event.candidatePlanVersionId });
  }
  return client.appendEvent({ ...request, event: planningEventInputSchema.parse(stripEventMetadata(event)) });
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
  if (isArcApiError(error) && (error.status === 401 || error.action === "sign-in")) publish("session-expired");
  else if (isArcApiError(error) && (error.status === 409 || error.code === "CONFLICT")) publish("conflict");
  else publish("unavailable");
}

function isUnavailable(error: unknown): boolean {
  return !isArcApiError(error) || error.status === 429 || error.status >= 500;
}
