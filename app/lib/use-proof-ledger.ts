"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanningWorkspace } from "../contracts/planning";
import type {
  CreateProofRequest,
  ProofLedgerMutationResult,
  ProofLedgerWorkspace,
  ProofVisibility,
  ReviseProofRequest,
  SkillEvidenceProjection,
} from "../contracts/proof-ledger";
import type { ProofItem } from "../domain/learning";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { authClient } from "./auth-client";
import { isArcApiError } from "./cloud-client";
import { proofClient, type ProofClient } from "./proof-client";
import { legacyProofsToPracticingSkills } from "./proof/legacy-adapter";
import { createLocalProofRepository, type LocalProofRepository } from "./proof/local-repository";
import { completedSkillEvidenceFromPlanning, projectSkillEvidence } from "./proof/projection";

export type ProofStateSource = "restoring" | "local" | "cloud" | "offline-cloud";
export type ProofRecoveryState = "none" | "session-expired" | "conflict" | "unavailable" | "version-unavailable";
type Identity = "guest" | `user:${string}`;
type SessionState = { data: { user: { id: string; name: string; email: string } } | null; isPending: boolean };
type CreateInput = Omit<CreateProofRequest, "mutationId" | "baseRevision">;
type ReviseInput = Omit<ReviseProofRequest, "mutationId" | "baseRevision">;

export type ProofLedgerController = {
  workspace: ProofLedgerWorkspace | null;
  projections: SkillEvidenceProjection[];
  source: ProofStateSource;
  recovery: ProofRecoveryState;
  createProof(input: CreateInput): Promise<boolean>;
  reviseProof(proofId: string, input: ReviseInput): Promise<boolean>;
  withdrawProof(proofId: string): Promise<boolean>;
  setVisibility(proofId: string, visibility: ProofVisibility): Promise<boolean>;
  retry(): Promise<void>;
};

type Options = {
  planningWorkspace: PlanningWorkspace | null;
  legacyProofs: readonly ProofItem[];
  client?: ProofClient;
  local?: LocalProofRepository;
  createMutationId?: () => string;
  useSession?: () => SessionState;
};

function runtimeSession(): SessionState {
  const session = authClient.useSession();
  return { data: session.data?.user ? { user: session.data.user } : null, isPending: session.isPending };
}

export function useProofLedger(options: Options): ProofLedgerController {
  const useSession = options.useSession ?? runtimeSession;
  const session = useSession();
  const identity: Identity = session.data?.user.id ? `user:${session.data.user.id}` : "guest";
  const clientRef = useRef(options.client ?? proofClient);
  const localRef = useRef(options.local ?? createLocalProofRepository());
  const createMutationIdRef = useRef(options.createMutationId ?? (() => `mutation-${crypto.randomUUID()}`));
  const [workspace, setWorkspace] = useState<ProofLedgerWorkspace | null>(null);
  const [source, setSource] = useState<ProofStateSource>("restoring");
  const [recovery, setRecovery] = useState<ProofRecoveryState>("none");
  const [visibleIdentity, setVisibleIdentity] = useState<Identity | null>(null);
  const workspaceRef = useRef<ProofLedgerWorkspace | null>(null);
  const sourceRef = useRef<ProofStateSource>("restoring");
  const identityRef = useRef(identity);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const activeRef = useRef<{ identity: Identity; generation: number } | null>(null);

  const publish = useCallback((nextWorkspace: ProofLedgerWorkspace | null, nextSource: ProofStateSource, nextIdentity: Identity) => {
    workspaceRef.current = nextWorkspace;
    sourceRef.current = nextSource;
    setWorkspace(nextWorkspace);
    setSource(nextSource);
    setVisibleIdentity(nextIdentity);
  }, []);

  const load = useCallback(async () => {
    const currentIdentity = identityRef.current;
    const generation = ++generationRef.current;
    const userId = currentIdentity === "guest" ? null : currentIdentity.slice(5);
    const current = () => mountedRef.current
      && identityRef.current === currentIdentity && generationRef.current === generation;
    setRecovery("none");
    try {
      const next = userId
        ? await clientRef.current.loadWorkspace()
        : await localRef.current.load();
      if (!current()) return;
      publish(next, userId ? "cloud" : "local", currentIdentity);
    } catch (error) {
      if (!current()) return;
      setRecovery(recoveryFor(error));
      setVisibleIdentity(currentIdentity);
      if (userId) {
        sourceRef.current = "offline-cloud";
        setSource("offline-cloud");
      } else {
        sourceRef.current = "local";
        setSource("local");
      }
    }
  }, [publish]);

  useEffect(() => {
    mountedRef.current = true;
    identityRef.current = identity;
    generationRef.current += 1;
    activeRef.current = null;
    if (session.isPending) {
      sourceRef.current = "restoring";
      return () => { mountedRef.current = false; generationRef.current += 1; };
    }
    queueMicrotask(() => { if (mountedRef.current && identityRef.current === identity) void load(); });
    return () => { mountedRef.current = false; generationRef.current += 1; };
  }, [identity, load, session.isPending]);

  const mutate = useCallback(async (
    localAction: (repository: LocalProofRepository, mutationId: string, baseRevision: number) => Promise<ProofLedgerMutationResult>,
    cloudAction: (client: ProofClient, mutationId: string, baseRevision: number) => Promise<ProofLedgerMutationResult>,
  ) => {
    const currentIdentity = identityRef.current;
    const generation = generationRef.current;
    if (visibleIdentity !== currentIdentity || sourceRef.current === "restoring"
      || sourceRef.current === "offline-cloud" || activeRef.current !== null) return false;
    const token = { identity: currentIdentity, generation };
    activeRef.current = token;
    try {
      const mutationId = createMutationIdRef.current();
      const baseRevision = workspaceRef.current?.revision ?? 0;
      const result = currentIdentity === "guest"
        ? await localAction(localRef.current, mutationId, baseRevision)
        : await cloudAction(clientRef.current, mutationId, baseRevision);
      if (!mountedRef.current || identityRef.current !== currentIdentity
        || generationRef.current !== generation) return false;
      workspaceRef.current = result.workspace;
      setWorkspace(result.workspace);
      setRecovery("none");
      return true;
    } catch (error) {
      if (!mountedRef.current || identityRef.current !== currentIdentity
        || generationRef.current !== generation) return false;
      const nextRecovery = recoveryFor(error);
      setRecovery(nextRecovery);
      if (currentIdentity !== "guest" && nextRecovery === "unavailable") {
        sourceRef.current = "offline-cloud";
        setSource("offline-cloud");
      }
      return false;
    } finally {
      if (activeRef.current === token) activeRef.current = null;
    }
  }, [visibleIdentity]);

  const createProof = useCallback((input: CreateInput) => mutate(
    (repository, mutationId, baseRevision) => repository.createProof({ ...input, mutationId, baseRevision }),
    (client, mutationId, baseRevision) => client.createProof({ ...input, mutationId, baseRevision }),
  ), [mutate]);

  const reviseProof = useCallback((proofId: string, input: ReviseInput) => mutate(
    (repository, mutationId, baseRevision) => repository.reviseProof(proofId, { ...input, mutationId, baseRevision }),
    (client, mutationId, baseRevision) => client.reviseProof(proofId, { ...input, mutationId, baseRevision }),
  ), [mutate]);

  const withdrawProof = useCallback((proofId: string) => mutate(
    (repository, mutationId, baseRevision) => repository.withdrawProof(proofId, { mutationId, baseRevision }),
    (client, mutationId, baseRevision) => client.withdrawProof(proofId, { mutationId, baseRevision }),
  ), [mutate]);

  const setVisibility = useCallback((proofId: string, visibility: ProofVisibility) => mutate(
    (repository, mutationId, baseRevision) => repository.setVisibility(proofId, { mutationId, baseRevision, visibility }),
    (client, mutationId, baseRevision) => client.setVisibility(proofId, { mutationId, baseRevision, visibility }),
  ), [mutate]);

  const isVisible = !session.isPending && visibleIdentity === identity;
  const exposedWorkspace = isVisible ? workspace : null;
  const exposedSource: ProofStateSource = isVisible ? source : "restoring";
  const exposedRecovery: ProofRecoveryState = isVisible ? recovery : "none";
  const projections = useMemo(() => deriveProjections(
    exposedWorkspace,
    options.planningWorkspace,
    options.legacyProofs,
  ), [exposedWorkspace, options.legacyProofs, options.planningWorkspace]);

  return {
    workspace: exposedWorkspace,
    projections,
    source: exposedSource,
    recovery: exposedRecovery,
    createProof,
    reviseProof,
    withdrawProof,
    setVisibility,
    retry: load,
  };
}

function deriveProjections(
  workspace: ProofLedgerWorkspace | null,
  planning: PlanningWorkspace | null,
  legacyProofs: readonly ProofItem[],
) {
  const completedUnits = planning ? completedSkillEvidenceFromPlanning(planning) : [];
  const completedSkillIds = new Set(completedUnits.map(({ skillId }) => skillId));
  for (const skillId of legacyProofsToPracticingSkills(legacyProofs)) completedSkillIds.add(skillId);
  const base = {
    skillIds: flagshipBlueprint.skills.map(({ id }) => id),
    completedSkillIds,
    completedUnits,
    versions: workspace?.versions ?? [],
    reviews: workspace?.reviews ?? [],
  };
  return (["internal", "public"] as const).flatMap((visibility) =>
    projectSkillEvidence({ ...base, visibility }));
}

function recoveryFor(error: unknown): ProofRecoveryState {
  if (!isArcApiError(error)) return "unavailable";
  if (error.status === 401 || error.code === "UNAUTHENTICATED") return "session-expired";
  if (error.status === 409 || error.code === "CONFLICT") return "conflict";
  if (error.action === "rebuild" || error.code === "VERSION_UNAVAILABLE") return "version-unavailable";
  return "unavailable";
}
