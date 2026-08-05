"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LearningUnit } from "../domain/learning";
import { authClient } from "./auth-client";
import { arcCloudClient, isArcApiError, type ArcCloudClient } from "./cloud-client";
import {
  completeDemoUnit,
  fingerprintDemoState,
  hasMeaningfulDemoState,
  loadDemoState,
  mergeSetup,
  saveDemoState,
  type DemoState,
  type SetupAnswers,
} from "./demo-store";
import {
  acknowledgeMigrationSnapshot,
  isMigrationSnapshotAcknowledged,
} from "./migration-dismissal";
import {
  enqueueOfflineMutation,
  readOfflineQueue,
  replayOfflineQueue,
  type OfflineMutation,
} from "./offline-queue";

export type ArcStateSource = "restoring" | "local" | "cloud" | "offline-cloud";
export type ArcMigrationState = "none" | "available" | "importing" | "imported" | "failed";
export type ArcMigrationResolution = "reject" | "archive-import" | "activate-import";
export type ArcRecoveryState = "none" | "session-expired";

export type ArcStateController = {
  state: DemoState | null;
  source: ArcStateSource;
  migration: ArcMigrationState;
  localMigrationState: DemoState | null;
  recovery: ArcRecoveryState;
  dismissMigration(): void;
  importLocal(resolution?: ArcMigrationResolution): Promise<void>;
  saveSetup(setup: SetupAnswers): Promise<boolean>;
  completeUnit(unit: LearningUnit): Promise<boolean>;
  retry(): Promise<void>;
};

type ArcSessionState = {
  data: { user: { id: string; name: string; email: string } } | null;
  isPending: boolean;
};

type ArcStateOptions = {
  client: ArcCloudClient;
  storage: Storage;
  createMutationId: () => string;
  now: () => Date;
  useSession: () => ArcSessionState;
};

function useRuntimeSession(): ArcSessionState {
  const session = authClient.useSession();
  return {
    data: session.data?.user ? { user: session.data.user } : null,
    isPending: session.isPending,
  };
}

function retryable(error: unknown): boolean {
  return !isArcApiError(error) || error.status === 429 || error.status >= 500;
}

function hasPendingLocalMigration(
  local: DemoState,
  userId: string,
  storage?: Storage,
): boolean {
  return hasMeaningfulDemoState(local)
    && !isMigrationSnapshotAcknowledged(
      userId,
      fingerprintDemoState(local),
      storage,
    );
}

export function useArcState(options: Partial<ArcStateOptions> = {}): ArcStateController {
  const useSession = options.useSession ?? useRuntimeSession;
  const session = useSession();
  const client = options.client ?? arcCloudClient;
  const storage = options.storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  const clientRef = useRef(client);
  const storageRef = useRef(storage);
  const createMutationIdRef = useRef(options.createMutationId ?? (() => crypto.randomUUID()));
  const nowRef = useRef(options.now ?? (() => new Date()));

  const [state, setState] = useState<DemoState | null>(null);
  const [source, setSource] = useState<ArcStateSource>("restoring");
  const [migration, setMigration] = useState<ArcMigrationState>("none");
  const [localMigrationState, setLocalMigrationState] = useState<DemoState | null>(null);
  const [recovery, setRecovery] = useState<ArcRecoveryState>("none");
  const stateRef = useRef<DemoState | null>(null);
  const sourceRef = useRef<ArcStateSource>("restoring");
  const userId = session.data?.user.id ?? null;
  const userIdRef = useRef<string | null>(userId);
  const migrationIdRef = useRef<string | null>(null);

  const publishState = useCallback((next: DemoState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const publishSource = useCallback((next: ArcStateSource) => {
    sourceRef.current = next;
    setSource(next);
  }, []);

  useEffect(() => {
    userIdRef.current = userId;
    if (session.isPending) {
      let active = true;
      queueMicrotask(() => {
        if (!active) return;
        publishState(null);
        publishSource("restoring");
        setLocalMigrationState(null);
        setRecovery("none");
      });
      return () => {
        active = false;
      };
    }

    const local = loadDemoState(storageRef.current);
    if (!userId) {
      const hydrationTimer = window.setTimeout(() => {
        publishState(local);
        publishSource("local");
        setMigration("none");
        setLocalMigrationState(null);
        setRecovery("none");
        migrationIdRef.current = null;
      }, 0);
      return () => window.clearTimeout(hydrationTimer);
    }

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      publishState(null);
      publishSource("restoring");
    });
    void clientRef.current.loadWorkspace()
      .then((snapshot) => {
        if (!active) return;
        const available = hasPendingLocalMigration(local, userId, storageRef.current);
        publishState(snapshot?.state ?? local);
        publishSource(snapshot
          ? (readOfflineQueue(storageRef.current).length > 0 ? "offline-cloud" : "cloud")
          : "local");
        setMigration(available ? "available" : "none");
        setLocalMigrationState(available ? local : null);
        setRecovery("none");
      })
      .catch((error) => {
        if (!active) return;
        publishState(local);
        publishSource("offline-cloud");
        setRecovery(isArcApiError(error) && error.status === 401 ? "session-expired" : "none");
        const available = hasPendingLocalMigration(local, userId, storageRef.current);
        setMigration(available ? "available" : "none");
        setLocalMigrationState(available ? local : null);
      });

    return () => {
      active = false;
    };
  }, [publishSource, publishState, session.isPending, userId]);

  const importLocal = useCallback(async (resolution: ArcMigrationResolution = "reject") => {
    const local = loadDemoState(storageRef.current);
    const currentUserId = userIdRef.current;
    if (!currentUserId || !hasMeaningfulDemoState(local)) {
      setMigration("none");
      return;
    }

    const migrationId = migrationIdRef.current ?? createMutationIdRef.current();
    migrationIdRef.current = migrationId;
    setMigration("importing");
    try {
      await clientRef.current.importLocal(local, resolution, migrationId);
      const snapshot = await clientRef.current.loadWorkspace();
      if (!snapshot) throw new Error("Imported Arc workspace is unavailable.");
      acknowledgeMigrationSnapshot(
        currentUserId,
        fingerprintDemoState(local),
        storageRef.current,
      );
      publishState(snapshot.state);
      publishSource("cloud");
      setMigration("imported");
      setLocalMigrationState(null);
      setRecovery("none");
    } catch (error) {
      setMigration("failed");
      if (isArcApiError(error) && error.status === 401) setRecovery("session-expired");
      throw error;
    }
  }, [publishSource, publishState]);

  const dismissMigration = useCallback(() => {
    const local = loadDemoState(storageRef.current);
    const currentUserId = userIdRef.current;
    if (currentUserId && hasMeaningfulDemoState(local)) {
      acknowledgeMigrationSnapshot(
        currentUserId,
        fingerprintDemoState(local),
        storageRef.current,
      );
    }
    setMigration("none");
    setLocalMigrationState(null);
  }, []);

  const enqueue = useCallback((mutation: OfflineMutation): boolean => {
    const result = enqueueOfflineMutation(mutation, storageRef.current);
    publishSource("offline-cloud");
    return result.accepted;
  }, [publishSource]);

  const saveSetup = useCallback(async (setup: SetupAnswers): Promise<boolean> => {
    const current = stateRef.current;
    if (!current) return false;
    const signedIn = Boolean(userIdRef.current);
    if (!signedIn || sourceRef.current === "local") {
      const next = mergeSetup(current, setup);
      const saved = saveDemoState(next, storageRef.current);
      if (saved) {
        publishState(next);
        if (signedIn && hasMeaningfulDemoState(next)) {
          setMigration("available");
          setLocalMigrationState(next);
        }
      }
      return saved;
    }

    const mutationId = createMutationIdRef.current();
    const mutation: OfflineMutation = {
      id: mutationId,
      kind: "save-setup",
      createdAt: nowRef.current().toISOString(),
      payload: { mutationId, setup },
    };
    if (sourceRef.current === "offline-cloud") {
      const accepted = enqueue(mutation);
      if (accepted) publishState(mergeSetup(current, setup));
      return accepted;
    }

    try {
      const snapshot = await clientRef.current.saveSetup(setup, mutationId);
      publishState(snapshot.state);
      publishSource("cloud");
      setRecovery("none");
      return true;
    } catch (error) {
      if (isArcApiError(error) && error.status === 401) {
        setRecovery("session-expired");
        return false;
      }
      if (!retryable(error)) return false;
      const accepted = enqueue(mutation);
      if (accepted) publishState(mergeSetup(current, setup));
      return accepted;
    }
  }, [enqueue, publishSource, publishState]);

  const completeUnit = useCallback(async (unit: LearningUnit): Promise<boolean> => {
    const current = stateRef.current;
    if (!current) return false;
    if (current.completedUnitIds.includes(unit.id)) return true;
    const signedIn = Boolean(userIdRef.current);
    if (!signedIn || sourceRef.current === "local") {
      const next = completeDemoUnit(current, unit);
      const saved = saveDemoState(next, storageRef.current);
      if (saved) {
        publishState(next);
        if (signedIn) {
          setMigration("available");
          setLocalMigrationState(next);
        }
      }
      return saved;
    }

    const mutationId = createMutationIdRef.current();
    const mutation: OfflineMutation = {
      id: mutationId,
      kind: "complete-unit",
      createdAt: nowRef.current().toISOString(),
      payload: {
        mutationId,
        unitId: unit.id,
        title: unit.title,
        deliverable: unit.deliverable,
        skillIds: unit.skillIds,
      },
    };
    if (sourceRef.current === "offline-cloud") {
      const accepted = enqueue(mutation);
      if (accepted) publishState(completeDemoUnit(current, unit));
      return accepted;
    }

    try {
      const snapshot = await clientRef.current.completeUnit(unit, mutationId);
      publishState(snapshot.state);
      publishSource("cloud");
      setRecovery("none");
      return true;
    } catch (error) {
      if (isArcApiError(error) && error.status === 401) {
        setRecovery("session-expired");
        return false;
      }
      if (!retryable(error)) return false;
      const accepted = enqueue(mutation);
      if (accepted) publishState(completeDemoUnit(current, unit));
      return accepted;
    }
  }, [enqueue, publishSource, publishState]);

  const retry = useCallback(async () => {
    if (!userIdRef.current) return;
    const remaining = await replayOfflineQueue(
      (mutation) => clientRef.current.replay(mutation),
      storageRef.current,
    );
    if (remaining.length > 0) {
      publishSource("offline-cloud");
      return;
    }
    try {
      const snapshot = await clientRef.current.loadWorkspace();
      if (snapshot) {
        publishState(snapshot.state);
        publishSource("cloud");
        setRecovery("none");
      }
    } catch (error) {
      publishSource("offline-cloud");
      if (isArcApiError(error) && error.status === 401) setRecovery("session-expired");
    }
  }, [publishSource, publishState]);

  return {
    state,
    source,
    migration,
    localMigrationState,
    recovery,
    dismissMigration,
    importLocal,
    saveSetup,
    completeUnit,
    retry,
  };
}
