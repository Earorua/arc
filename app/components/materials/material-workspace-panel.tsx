"use client";
import { useRef, useState } from "react";
import { authClient } from "../../lib/auth-client";
import type { usePlanningWorkspace } from "../../lib/use-planning-workspace";
import type { MaterialPlanningReference } from "../../contracts/material-planning";
import type { MaterialSelectionEntry } from "../../contracts/documents";
import { planningDateForInstant } from "../../lib/planning/calendar";
import { MaterialSetupProvider, useMaterialSetup } from "./material-setup-provider";
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
  async function detach({ documentId, documentVersionId, confirmationId, slot }: MaterialSelectionEntry) {
    if (!state || !scope || !planning || workspace?.pendingPlanVersionId || busy) return;
    const entry = { documentId, documentVersionId, confirmationId, slot };
    const key = JSON.stringify({ scope, entry });
    if (detachMutation.current?.key !== key) detachMutation.current = { key, id: `detach-${crypto.randomUUID()}` };
    setBusy(true); setMessage(null); setPreview(null);
    try {
      const result = await state.runScoped(signal => state.client.request("detachAdoptedMaterial", { scope, entry, mutationId: detachMutation.current!.id }, signal));
      if (!result) return;
      setMessage("已从当前目标取消使用。");
    } catch { setMessage("未能确认取消结果，请核对刷新后的资料及路线。"); }
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
      setMessage(result.outcome === "no-change" ? result.message : "调整建议已生成。请在路线中比较，并明确接受后生效。");
      await planning.retry();
    } catch { setMessage("资料或计划已变化，请重新读取并核对预览。"); }
    finally { setBusy(false); }
  }
  return <aside className="material-workspace-entry"><button className="text-action" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>私人资料与规划依据</button>
    {open && <div><MaterialLibrary ownerId={ownerId} capabilities={state.capabilities} client={state.client}
      currentUse={scope && state.ready && state.refs.adopted ? { entries: state.refs.adopted.entries, disabled: busy || Boolean(workspace?.pendingPlanVersionId), key: JSON.stringify(scope), detach } : undefined}
      onSelect={!state.ready || !canPlan ? undefined : (kind, ref) => {
      if (kind === "supplement") {
        const others = state.refs.supplements.filter(item => item.documentId !== ref.documentId);
        if (others.length >= 3) { setMessage("最多采用三份补充资料，请先移除一份。"); return; }
        state.setSupplements([...others, ref]);
      } else state.setSlot(kind, ref);
      setPreview(null); setMessage("已选择该确认版本，请核对对当前路线的影响。");
    }} />
    {workspace && (canPlan || state.capabilities.hasDocuments) && !state.ready && (state.restoreFailed
      ? <div role="alert">{state.restoreConflict === "version" ? <><p>旧草稿与当前路线选用了不同版本。请选择冲突资料采用哪一边，其他选择会保留。</p>
        <button type="button" onClick={() => state.retryRestore("current")}>采用当前路线中的冲突版本</button>
        <button type="button" onClick={() => state.retryRestore("draft")}>采用旧草稿中的冲突版本</button></>
        : state.restoreConflict === "capacity" ? <><p>原计划和旧草稿合计超过三份补充资料。请选择是否从当前路线重新开始。</p>
          <button type="button" onClick={() => state.retryRestore("reset")}>放弃本地选择，按当前路线恢复</button></>
        : <p>暂时无法核对当前路线采用的资料，请重试或刷新路线。</p>}
        <button type="button" onClick={() => state.retryRestore()}>重试读取已采用资料</button></div>
      : <p role="status">正在读取当前路线采用的资料…</p>)}
    {canPlan && state.refs.supplements.map(ref => <p key={ref.documentId}>已选择补充资料<button className="text-action" type="button" onClick={() => state.setSupplements(state.refs.supplements.filter(item => item.documentId !== ref.documentId))}>从本次调整草稿移除这份补充资料</button></p>)}
    {workspace && scope && sourceContext && <>{canPlan && <MaterialContextReview scope={scope} availableSkills={sourceContext.blueprint.skills} disabled={busy || Boolean(workspace.pendingPlanVersionId)} input={{
      source: sourceContext.reference.source === "research" ? { source: "research", researchRunId: sourceContext.reference.researchRunId } : { source: "flagship", roleId: "ai-native-full-stack-engineer" },
      audit: workspace.audit, availability: workspace.availability, target: workspace.target,
      planningDate: planningDateForInstant(new Date().toISOString(), workspace.availability.timeZone),
      selectedScope: workspace.pathVersions.find(path => path.id === workspace.activePathVersionId)?.scopeMode ?? null,
    }} onPreview={value => setPreview(value ? { ...value, key: scopeKey } : null)} />}
    {canPlan && preview && <button type="button" disabled={busy || preview.key !== scopeKey || Boolean(workspace.pendingPlanVersionId)} onClick={() => void propose()}>生成当前路线调整建议</button>}
    <MaterialHistory ownerId={ownerId} goalId={workspace.goalId} /></>}
    {message && <p role="status">{message}</p>}</div>}
  </aside>;
}
