"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { createMaterialContextRequestSchema, materialContextPreviewSchema, MaterialPlanningReference, MaterialSkillMappingChoice } from "../../contracts/material-planning";
import type { MaterialSelectionEntry, MaterialScope } from "../../contracts/documents";
import { useMaterialSetup, MaterialSelectionSummary } from "./material-setup-provider";

export type MaterialPreview = z.infer<typeof materialContextPreviewSchema>;
export type MaterialPreviewInputs = Omit<z.infer<typeof createMaterialContextRequestSchema>, "selectionRef" | "scope" | "mutationId" | "skillMappings">;
export function materialEntries(state: ReturnType<typeof useMaterialSetup>): MaterialSelectionEntry[] {
  if (!state) return [];
  const primary: MaterialSelectionEntry[] = (["resume", "jd"] as const).flatMap(slot => {
    const ref = state.refs.slots[slot];
    return ref?.confirmationId ? [{ slot, documentId: ref.documentId, documentVersionId: ref.documentVersionId, confirmationId: ref.confirmationId }] : [];
  });
  return [...primary, ...state.refs.supplements.flatMap(ref => ref.confirmationId ? [{ slot: "supplement" as const, documentId: ref.documentId, documentVersionId: ref.documentVersionId, confirmationId: ref.confirmationId }] : [])];
}
export function MaterialContextReview({ input, availableSkills = [], previousGoalId = null, scope: scopeOverride, disabled = false, recovering = false, onPreview }: {
  input: MaterialPreviewInputs; previousGoalId?: string | null; scope?: MaterialScope; disabled?: boolean; recovering?: boolean;
  availableSkills?: readonly { id: string; name: string }[];
  onPreview: (value: { reference: MaterialPlanningReference; preview: MaterialPreview } | null) => void;
}) {
  const state = useMaterialSetup(); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<MaterialPreview | null>(null); const [message, setMessage] = useState<string | null>(null);
  const [mappingDraft, setMappingDraft] = useState<{ key: string; value: MaterialSkillMappingChoice[] } | null>(null);
  const attempt = useRef<{ key: string; selectionMutation: string; contextMutation: string } | null>(null);
  const entries = materialEntries(state);
  const selectedCount = state ? Object.keys(state.refs.slots).length + state.refs.supplements.length : 0;
  const key = JSON.stringify({ input, entries, previousGoalId, draftId: state?.refs.draftId, scopeOverride });
  const skillMappings = mappingDraft?.key === key ? mappingDraft.value : [];
  const requestKey = JSON.stringify({ key, skillMappings });
  const currentKey = useRef(requestKey);
  const previewCallback = useRef(onPreview);
  useLayoutEffect(() => { currentKey.current = requestKey; previewCallback.current = onPreview; }, [requestKey, onPreview]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) { setPreview(null); previewCallback.current(null); } });
    return () => { active = false; };
  }, [key]);
  const recoveryRef = state?.refs.preview; const client = state?.client;
  useEffect(() => {
    if (!recovering || !recoveryRef || !client) return;
    const controller = new AbortController();
    void client.request("readMaterialContext", { contextVersionId: recoveryRef.contextVersionId }, controller.signal).then(result => {
      if (!controller.signal.aborted) { setPreview(result.preview); previewCallback.current({ reference: recoveryRef, preview: result.preview }); }
    }).catch(() => { if (!controller.signal.aborted) setMessage("原预览已不可恢复，请返回路线确认保存结果。"); });
    return () => controller.abort();
  }, [client, recovering, recoveryRef, key]);
  if (!state?.capabilities?.documentsEnabled || !selectedCount) return null;
  async function review() {
    if (!state || busy || disabled || entries.length !== selectedCount) return;
    const epochKey = requestKey; setBusy(true); setMessage(null);
    if (attempt.current?.key !== requestKey) attempt.current = { key: requestKey, selectionMutation: `selection-${crypto.randomUUID()}`, contextMutation: `context-${crypto.randomUUID()}` };
    const mutation = attempt.current;
    try {
      const result = await state.runScoped(async signal => {
        const scope = scopeOverride ?? { kind: "draft" as const, draftId: state.refs.draftId, previousGoalId };
        const scopeKey = JSON.stringify(scope);
        const existing = state.refs.selection && await state.client.request("readMaterialSelection", { selectionId: state.refs.selection.selectionId }, signal);
        const sameScope = existing && existing.selection.state === "active" && JSON.stringify(existing.selection.scope) === scopeKey;
        const selection = sameScope
          ? JSON.stringify(existing.selection.entries) === JSON.stringify(entries)
            ? { selectionId: existing.selection.selectionId, selectionRevision: existing.selection.selectionRevision }
            : await state.client.request("updateMaterialSelection", { selectionId: existing.selection.selectionId, expectedRevision: existing.selection.selectionRevision, entries, mutationId: mutation.selectionMutation }, signal)
          : await state.client.request("createMaterialSelection", { scope, entries, mutationId: mutation.selectionMutation }, signal);
        if (epochKey !== currentKey.current) return null;
        state.setSelection(selection);
        const context = await state.client.request("createMaterialContext", { ...input, scope, selectionRef: selection, mutationId: mutation.contextMutation, ...(skillMappings.length ? { skillMappings } : {}) }, signal);
        return { reference: { selectionRef: selection, contextVersionId: context.contextVersionId, previewToken: context.previewToken }, preview: context.preview };
      });
      if (result && epochKey === currentKey.current) {
        state.setPreview(result.reference); setPreview(result.preview); previewCallback.current(result);
      }
    } catch { if (epochKey === currentKey.current) setMessage("暂时无法核对资料影响。请检查已确认资料或重新生成预览。"); }
    finally { setBusy(false); }
  }
  function chooseSkill(confirmationId: string, itemId: string, skillId: string) {
    if (!state || disabled || busy || recovering || (skillId && !availableSkills.some(skill => skill.id === skillId))) return;
    const next = skillMappings.filter(mapping => mapping.confirmationId !== confirmationId || mapping.itemId !== itemId);
    if (skillId) next.push({ confirmationId, itemId, skillId });
    setMappingDraft({ key, value: next }); state.setPreview(null); previewCallback.current(null);
    setMessage("技能对应已修改，请重新核对资料对路线的影响后采用。");
  }
  const mappingDirty = !recovering && JSON.stringify(skillMappings) !== JSON.stringify(preview?.skillMappings ?? []);
  return <section className="material-context-review"><MaterialSelectionSummary disabled={disabled} />
    {!state.capabilities.planningEnabled ? <p>资料辅助规划暂未开放。可移除本次选择，继续普通规划。</p> : <>
    {entries.length !== selectedCount && <p role="alert">请先核对并确认每份资料的事实，或移除未采用的资料。</p>}
    <button type="button" disabled={busy || disabled || entries.length !== selectedCount} onClick={() => void review()}>{busy ? "正在核对资料影响…" : "核对资料对路线的影响"}</button>
    {preview && <div className="material-preview"><p role="status">{mappingDirty ? "技能对应待重新预览，当前结果暂不可采用。" : "资料预览已就绪。创建路线时将再次校验所选版本。"}</p>
      <h3>确认的事实与要求</h3><ul>{preview.confirmedItems.map((item, index) => {
        const reference = preview.itemReferences?.find(reference => reference.id === item.id);
        const choice = reference && (recovering ? preview.skillMappings ?? [] : skillMappings).find(mapping => mapping.confirmationId === reference.confirmationId && mapping.itemId === reference.itemId);
        return <li key={item.id}>{item.text}{reference && item.kind !== "constraint" && availableSkills.length > 0 && <label>对应的已有技能<select
          aria-label={`事实 ${index + 1} 对应的已有技能`} disabled={disabled || busy || recovering} value={choice?.skillId ?? ""}
          onChange={event => chooseSkill(reference.confirmationId, reference.itemId, event.target.value)}>
          <option value="">自动对应；未匹配时保留未覆盖</option>
          {availableSkills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
        </select></label>}</li>;
      })}</ul>
      {availableSkills.length > 0 && <p>如有未覆盖或对应不准确的事实，可明确选择当前蓝图已有技能；不会新增课程或改变能力自评。</p>}
      <p>已映射 {preview.priorities.length} 项技能；资料没有提到的能力仍以你的自我评估为准。</p>
      {preview.issues.length > 0 && <p>有 {preview.issues.length} 项需注意：歧义映射、未覆盖内容或自评冲突会保留为提醒，不会擅自增加技能。</p>}
      {preview.uncoveredLabels.length > 0 && <p>当前蓝图未覆盖：{preview.uncoveredLabels.join("、")}</p>}
      {preview.planning && <p>全量预计完成：{preview.planning.fullScope.estimatedCompletionDate}；目标日期方案：{preview.planning.targetDate?.estimatedCompletionDate ?? "不可行"}。{preview.planning.infeasibleReason}</p>}
    </div>}</>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
