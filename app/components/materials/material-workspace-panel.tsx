"use client";
import { useRef, useState } from "react";
import { authClient } from "../../lib/auth-client";
import type { usePlanningWorkspace } from "../../lib/use-planning-workspace";
import type { MaterialPlanningReference } from "../../contracts/material-planning";
import { planningDateForInstant } from "../../lib/planning/calendar";
import { MaterialSetupProvider, useMaterialSetup } from "./material-setup-provider";
import { MaterialLibrary } from "./material-library";
import { MaterialContextReview, type MaterialPreview } from "./material-context-review";
import { MaterialHistory } from "./material-history";

type PlanningController = ReturnType<typeof usePlanningWorkspace>;
export function MaterialWorkspaceEntry({ planning }: { planning?: PlanningController }) {
  const session = authClient.useSession(); const ownerId = session.data?.user.id;
  if (session.isPending || !ownerId) return null;
  return <MaterialSetupProvider ownerId={ownerId} scopeKey={`workspace:${planning?.workspace?.goalId ?? "library"}`}>
    <MaterialWorkspacePanel ownerId={ownerId} planning={planning} />
  </MaterialSetupProvider>;
}
function MaterialWorkspacePanel({ ownerId, planning }: { ownerId: string; planning?: PlanningController }) {
  const state = useMaterialSetup(); const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ reference: MaterialPlanningReference; preview: MaterialPreview; key: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const mutation = useRef<{ key: string; id: string } | null>(null);
  const workspace = planning?.source === "cloud" ? planning.workspace : null; const sourceContext = planning?.sourceContext;
  const scope = workspace ? { kind: "goal" as const, goalId: workspace.goalId, workspaceId: workspace.id, baseVersionId: workspace.activePlanVersionId, revision: workspace.revision } : null;
  const scopeKey = JSON.stringify({ scope, slots: state?.refs.slots, supplements: state?.refs.supplements });
  if (!state?.capabilities || (!state.capabilities.documentsEnabled && !state.capabilities.hasDocuments)) return null;
  async function propose() {
    if (!state || !scope || !preview || preview.key !== scopeKey || !planning || busy) return;
    setBusy(true); setMessage(null);
    if (mutation.current?.key !== preview.reference.contextVersionId) mutation.current = { key: preview.reference.contextVersionId, id: `replan-${crypto.randomUUID()}` };
    try {
      const result = await state.runScoped(signal => state.client.request("materialReplan", { scope, ...preview.reference, mutationId: mutation.current!.id }, signal));
      if (!result) return;
      setMessage(result.outcome === "no-change" ? result.message : "调整建议已生成。请在路线中比较，并明确接受后生效。");
      await planning.retry();
    } catch { setMessage("资料或计划已变化，请重新读取并核对预览。"); }
    finally { setBusy(false); }
  }
  return <aside className="material-workspace-entry"><button className="text-action" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>私人资料与规划依据</button>
    {open && <div><MaterialLibrary ownerId={ownerId} capabilities={state.capabilities} client={state.client} onSelect={(kind, ref) => {
      if (kind === "supplement") {
        const others = state.refs.supplements.filter(item => item.documentId !== ref.documentId);
        if (others.length >= 3) { setMessage("最多采用三份补充资料，请先移除一份。"); return; }
        state.setSupplements([...others, ref]);
      } else state.setSlot(kind, ref);
      setPreview(null); setMessage("已选择该确认版本，请核对对当前路线的影响。");
    }} />
    {state.refs.supplements.map(ref => <p key={ref.documentId}>已选择补充资料<button className="text-action" type="button" onClick={() => state.setSupplements(state.refs.supplements.filter(item => item.documentId !== ref.documentId))}>移除这份补充资料</button></p>)}
    {workspace && scope && sourceContext && <><MaterialContextReview scope={scope} availableSkills={sourceContext.blueprint.skills} disabled={busy || Boolean(workspace.pendingPlanVersionId)} input={{
      source: sourceContext.reference.source === "research" ? { source: "research", researchRunId: sourceContext.reference.researchRunId } : { source: "flagship", roleId: "ai-native-full-stack-engineer" },
      audit: workspace.audit, availability: workspace.availability, target: workspace.target,
      planningDate: planningDateForInstant(new Date().toISOString(), workspace.availability.timeZone),
      selectedScope: workspace.pathVersions.find(path => path.id === workspace.activePathVersionId)?.scopeMode ?? null,
    }} onPreview={value => setPreview(value ? { ...value, key: scopeKey } : null)} />
    {preview && <button type="button" disabled={busy || preview.key !== scopeKey || Boolean(workspace.pendingPlanVersionId)} onClick={() => void propose()}>生成当前路线调整建议</button>}
    <MaterialHistory ownerId={ownerId} goalId={workspace.goalId} /></>}
    {message && <p role="status">{message}</p>}</div>}
  </aside>;
}
