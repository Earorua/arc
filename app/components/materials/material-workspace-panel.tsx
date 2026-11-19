"use client";
import { useRef, useState } from "react";
import { authClient } from "../../lib/auth-client";
import type { usePlanningWorkspace } from "../../lib/use-planning-workspace";
import type { MaterialPlanningReference } from "../../contracts/material-planning";
import type { MaterialSelectionEntry } from "../../contracts/documents";
import { planningDateForInstant } from "../../lib/planning/calendar";
import { MaterialSelectionSummary, MaterialSetupProvider, useMaterialSetup } from "./material-setup-provider";
import { MaterialLibrary } from "./material-library";
import { MaterialContextReview, type MaterialPreview } from "./material-context-review";
import { MaterialHistory } from "./material-history";

type PlanningController = ReturnType<typeof usePlanningWorkspace>;
export function MaterialWorkspaceEntry({ planning }: { planning?: PlanningController }) {
  const session = authClient.useSession(); const ownerId = session.data?.user.id;
  if (session.isPending || !ownerId) return null;
  const workspace = planning?.source === "cloud" ? planning.workspace : null;
  const adoptedScope = workspace ? { goalId: workspace.goalId, workspaceId: workspace.id, baseVersionId: workspace.activePlanVersionId } : undefined;
  return <MaterialSetupProvider ownerId={ownerId} scopeKey={`workspace:${planning?.workspace?.goalId ?? "library"}`} workspace={adoptedScope} workspaceRevision={workspace?.revision}>
    <MaterialWorkspacePanel ownerId={ownerId} planning={planning} />
  </MaterialSetupProvider>;
}
function MaterialWorkspacePanel({ ownerId, planning }: { ownerId: string; planning?: PlanningController }) {
  const state = useMaterialSetup(); const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ reference: MaterialPlanningReference; preview: MaterialPreview; key: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const mutation = useRef<{ key: string; id: string } | null>(null);
  const detachMutation = useRef<{ key: string; id: string } | null>(null);
  const workspace = planning?.source === "cloud" ? planning.workspace : null; const sourceContext = planning?.sourceContext;
  const scope = workspace ? { kind: "goal" as const, goalId: workspace.goalId, workspaceId: workspace.id, baseVersionId: workspace.activePlanVersionId, revision: workspace.revision } : null;
  const scopeKey = JSON.stringify({ scope, slots: state?.refs.slots, supplements: state?.refs.supplements });
  if (!state?.capabilities || (!state.capabilities.documentsEnabled && !state.capabilities.hasDocuments)) return null;
  const canPlan = state.capabilities.documentsEnabled && state.capabilities.planningEnabled;
  const selectionLocked = busy || Boolean(workspace?.pendingPlanVersionId);
  async function detach({ documentId, documentVersionId, confirmationId, slot }: MaterialSelectionEntry) {
    if (!state || !scope || !planning || workspace?.pendingPlanVersionId || busy) return;
    const entry = { documentId, documentVersionId, confirmationId, slot };
    const key = JSON.stringify({ scope, entry });
    if (detachMutation.current?.key !== key) detachMutation.current = { key, id: `detach-${crypto.randomUUID()}` };
    setBusy(true); setMessage(null); setPreview(null);
    try {
      const result = await state.runScoped(signal => state.client.request("detachAdoptedMaterial", { scope, entry, mutationId: detachMutation.current!.id }, signal));
      if (!result) return;
      setMessage("This material is no longer used for the current goal.");
    } catch { setMessage("Removal is unconfirmed. Check the refreshed materials and path."); }
    finally { setBusy(false); }
    state.retryRestore();
    await planning.retry();
  }
  async function propose() {
    if (!state || !scope || !preview || preview.key !== scopeKey || !planning || busy) return;
    setBusy(true); setMessage(null);
    if (mutation.current?.key !== preview.reference.contextVersionId) mutation.current = { key: preview.reference.contextVersionId, id: `replan-${crypto.randomUUID()}` };
    try {
      const result = await state.runScoped(signal => state.client.request("materialReplan", { scope, ...preview.reference, mutationId: mutation.current!.id }, signal));
      if (!result) return;
      if (result.outcome === "no-change") setMessage(result.message);
      await planning.retry();
    } catch { setMessage("Materials or the plan have changed. Reload and review the preview."); }
    finally { setBusy(false); }
  }
  return <aside className="material-workspace-entry"><button className="text-action" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>Private materials and planning evidence</button>
    {open && <div><MaterialLibrary ownerId={ownerId} capabilities={state.capabilities} client={state.client}
      currentUse={scope && state.ready && state.refs.adopted ? { entries: state.refs.adopted.entries, disabled: selectionLocked, key: JSON.stringify(scope), detach } : undefined}
      onSelect={!state.ready || !canPlan || selectionLocked ? undefined : (kind, ref) => {
      if (kind === "supplement") {
        const others = state.refs.supplements.filter(item => item.documentId !== ref.documentId);
        if (others.length >= 3) { setMessage("You can use up to three supplementary materials. Remove one before adding another."); return; }
        state.setSupplements([...others, ref]);
      } else state.setSlot(kind, ref);
      setPreview(null); setMessage("The confirmed version is selected. Review its impact on the current path.");
    }} />
    {workspace && (canPlan || state.capabilities.hasDocuments) && !state.ready && (state.restoreFailed
      ? <div role="alert">{state.restoreConflict === "version" ? <><p>The saved draft and current path use different versions. Choose which conflicting versions to use; other selections are retained.</p>
        <button type="button" onClick={() => state.retryRestore("current")}>Use conflicting versions from the current path</button>
        <button type="button" onClick={() => state.retryRestore("draft")}>Use conflicting versions from the saved draft</button></>
        : state.restoreConflict === "capacity" ? <><p>The current plan and saved draft contain more than three supplementary materials. Choose whether to restart from the current path.</p>
          <button type="button" onClick={() => state.retryRestore("reset")}>Discard local selections and restore the current path</button></>
        : <p>Materials used by the current path could not be checked. Retry or refresh the path.</p>}
        <button type="button" onClick={() => state.retryRestore()}>Retry loading adopted materials</button></div>
      : <p role="status">Loading materials used by the current path…</p>)}
    {canPlan && (!workspace || !sourceContext) && <MaterialSelectionSummary disabled={selectionLocked} />}
    {workspace && scope && sourceContext && <>{canPlan && <MaterialContextReview scope={scope} availableSkills={sourceContext.blueprint.skills} disabled={selectionLocked} input={{
      source: sourceContext.reference.source === "research" ? { source: "research", researchRunId: sourceContext.reference.researchRunId } : { source: "flagship", roleId: "ai-native-full-stack-engineer" },
      audit: workspace.audit, availability: workspace.availability, target: workspace.target,
      planningDate: planningDateForInstant(new Date().toISOString(), workspace.availability.timeZone),
      selectedScope: workspace.pathVersions.find(path => path.id === workspace.activePathVersionId)?.scopeMode ?? null,
    }} onPreview={value => setPreview(value ? { ...value, key: scopeKey } : null)} />}
    {canPlan && preview && <button type="button" disabled={selectionLocked || preview.key !== scopeKey} onClick={() => void propose()}>Create a proposal for the current path</button>}
    <MaterialHistory key={workspace.revision} ownerId={ownerId} goalId={workspace.goalId} /></>}
    {workspace?.pendingPlanVersionId ? <p role="status">The proposal is ready. Compare it on your path, then accept it or keep the current schedule.</p> : message && <p role="status">{message}</p>}</div>}
  </aside>;
}
