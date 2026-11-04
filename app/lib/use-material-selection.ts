"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { z } from "zod";
import { materialDocumentDraftRefSchema, materialSetupDraftSchema, readSetupDraft, writeSetupDraft } from "../components/setup/setup-draft";
import type { MaterialPlanningReference } from "../contracts/material-planning";
import type { MaterialSelectionRef } from "../contracts/documents";
import { documentsClient, type DocumentsClient } from "./documents-client";
import { restoreWorkspaceDraft, type AdoptedMaterialScope, type RestoreConflict, type RestoreResolution } from "./material-workspace-draft";

export type MaterialDocumentDraftRef = z.infer<typeof materialDocumentDraftRefSchema>;
export type MaterialSetupRefs = z.infer<typeof materialSetupDraftSchema>;
const emptyRefs = (): MaterialSetupRefs => ({ draftId: "draft-pending", slots: {}, supplements: [], selection: null, preview: null });
export function useMaterialSelection({ ownerId, scopeKey, workspace, workspaceRevision, client = documentsClient, enabled = true }: {
  ownerId: string | null; scopeKey: string; workspace?: AdoptedMaterialScope; workspaceRevision?: number; client?: DocumentsClient; enabled?: boolean;
}) {
  const { goalId, workspaceId, baseVersionId } = workspace ?? {};
  const [attempt, setAttempt] = useState<{ id: number; scope?: string; resolution?: RestoreResolution }>({ id: 0 });
  const scopeIdentity = JSON.stringify([ownerId, scopeKey, goalId, workspaceId, baseVersionId]);
  const key = JSON.stringify([scopeIdentity, workspaceRevision, enabled, attempt.id]);
  const [state, setState] = useState<{ key: string; refs: MaterialSetupRefs; ready: boolean; failure?: "read" | RestoreConflict }>({ key, refs: emptyRefs(), ready: false });
  const epoch = useRef(0); const controllers = useRef(new Set<AbortController>());
  useLayoutEffect(() => {
    epoch.current++; const generation = epoch.current;
    const controller = new AbortController();
    async function restore() {
      if (!enabled || generation !== epoch.current) return;
      const saved = ownerId ? readSetupDraft(ownerId, `materials:${scopeKey}`, materialSetupDraftSchema) : null;
      let refs = saved ?? { ...emptyRefs(), draftId: `draft-${crypto.randomUUID()}` };
      if (ownerId && goalId && workspaceId && baseVersionId) {
        try {
          const scope = { goalId, workspaceId, baseVersionId };
          const merged = await restoreWorkspaceDraft(client, refs, scope, controller.signal, attempt.scope === scopeIdentity ? attempt.resolution : undefined);
          if (generation !== epoch.current) return;
          if (typeof merged === "string") { setState({ key, refs: emptyRefs(), ready: false, failure: merged }); return; }
          refs = merged;
        } catch {
          if (generation === epoch.current) setState({ key, refs: emptyRefs(), ready: false, failure: "read" });
          return;
        }
      }
      setState({ key, refs, ready: true });
      if (ownerId) writeSetupDraft(ownerId, `materials:${scopeKey}`, materialSetupDraftSchema, refs);
    }
    queueMicrotask(() => void restore());
    const pending = controllers.current;
    return () => { epoch.current = generation + 1; controller.abort(); for (const c of pending) c.abort(); pending.clear(); };
  }, [key, enabled, ownerId, scopeKey, goalId, workspaceId, baseVersionId, client, scopeIdentity, attempt.scope, attempt.resolution]);
  const update = useCallback((change: (refs: MaterialSetupRefs) => MaterialSetupRefs) => {
    setState(current => {
      if (current.key !== key || !current.ready) return current;
      const refs = materialSetupDraftSchema.parse(change(current.refs));
      if (ownerId) writeSetupDraft(ownerId, `materials:${scopeKey}`, materialSetupDraftSchema, refs);
      return { ...current, refs };
    });
  }, [key, ownerId, scopeKey]);
  const setSlot = useCallback((slot: "resume" | "jd", value: MaterialDocumentDraftRef | null) => {
    const parsed = value === null ? null : materialDocumentDraftRefSchema.parse(value);
    update(refs => { const slots = { ...refs.slots }; if (parsed) slots[slot] = parsed; else delete slots[slot]; return { ...refs, slots, preview: null }; });
  }, [update]);
  const setSupplements = useCallback((values: MaterialDocumentDraftRef[]) => {
    const parsed = materialSetupDraftSchema.shape.supplements.parse(values);
    update(refs => ({ ...refs, supplements: parsed, preview: null }));
  }, [update]);
  const setSelection = useCallback((selection: MaterialSelectionRef | null) => update(refs => ({ ...refs, selection, preview: null })), [update]);
  const setPreview = useCallback((preview: MaterialPlanningReference | null) => update(refs => ({ ...refs, preview })), [update]);
  const runScoped = useCallback(async <T,>(work: (signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    const generation = epoch.current; const controller = new AbortController(); controllers.current.add(controller);
    try { const value = await work(controller.signal); return controller.signal.aborted || generation !== epoch.current ? null : value; }
    catch (error) { if (controller.signal.aborted || generation !== epoch.current) return null; throw error; }
    finally { controllers.current.delete(controller); }
  }, []);
  return { refs: state.key === key ? state.refs : emptyRefs(), ready: state.key === key && state.ready,
    restoreFailed: state.key === key && Boolean(state.failure), restoreConflict: state.key === key && state.failure !== "read" ? state.failure : undefined,
    retryRestore: (resolution?: RestoreResolution) => setAttempt(current => ({ id: current.id + 1, scope: scopeIdentity, resolution })),
    setSlot, setSupplements, setSelection, setPreview, runScoped };
}
