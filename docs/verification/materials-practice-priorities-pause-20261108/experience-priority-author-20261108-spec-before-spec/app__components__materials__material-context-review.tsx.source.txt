"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { createMaterialContextRequestSchema, materialContextPreviewSchema, MaterialPlanningReference, MaterialSkillMappingChoice, MaterialTermMappingChoice, MaterialLearningIntentChoice } from "../../contracts/material-planning";
import type { MaterialSelectionEntry, MaterialScope } from "../../contracts/documents";
import { useMaterialSetup, MaterialSelectionSummary } from "./material-setup-provider";

export type MaterialPreview = z.infer<typeof materialContextPreviewSchema>;
export type MaterialPreviewInputs = Omit<z.infer<typeof createMaterialContextRequestSchema>, "selectionRef" | "scope" | "mutationId" | "skillMappings" | "termMappings" | "learningIntents">;
type Choices = { skillMappings: MaterialSkillMappingChoice[]; termMappings: MaterialTermMappingChoice[]; learningIntents: MaterialLearningIntentChoice[] };
const emptyChoices: Choices = { skillMappings: [], termMappings: [], learningIntents: [] };
const choicesFromPreview = (preview: MaterialPreview | null): Choices => ({
  skillMappings: preview?.skillMappings ?? [], termMappings: preview?.termMappings ?? [], learningIntents: preview?.learningIntents ?? [],
});
const choicesKey = (key: string, choices: Choices) => JSON.stringify({ key, ...choices });
const sameItem = (choice: MaterialLearningIntentChoice, confirmationId: string, itemId: string) => choice.confirmationId === confirmationId && choice.itemId === itemId;
const OMIT_TERM = "__omit__", SAVED_CHOICE = "__saved__";

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
  const [savedPreview, setSavedPreview] = useState<{ key: string; value: MaterialPreview } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [choiceDraft, setChoiceDraft] = useState<{ key: string; value: Choices } | null>(null);
  const attempt = useRef<{ key: string; selectionMutation: string; contextMutation: string } | null>(null);
  const entries = materialEntries(state);
  const selectedCount = state ? Object.keys(state.refs.slots).length + state.refs.supplements.length : 0;
  const recoveryRef = state?.refs.preview; const client = state?.client;
  const key = JSON.stringify({ input, entries, selectedCount, previousGoalId, draftId: state?.refs.draftId, scopeOverride, recovering,
    ...(recovering ? { recoveryRef } : {}),
  });
  const [draftKey, setDraftKey] = useState(key);
  if (draftKey !== key) {
    setDraftKey(key); setChoiceDraft(null); setSavedPreview(null); setMessage(null);
  }
  const preview = savedPreview?.key === key ? savedPreview.value : null;
  const choices = choiceDraft?.key === key ? choiceDraft.value : emptyChoices;
  const requestKey = choicesKey(key, choices);
  const currentKey = useRef(requestKey);
  const currentChoices = useRef({ key, value: choices });
  const previewCallback = useRef(onPreview);
  useLayoutEffect(() => {
    currentKey.current = requestKey; currentChoices.current = { key, value: choices }; previewCallback.current = onPreview;
  }, [requestKey, key, choices, onPreview]);
  const setPreviewReference = state?.setPreview;
  useLayoutEffect(() => {
    attempt.current = null;
    previewCallback.current(null);
    if (!recovering) setPreviewReference?.(null);
    return () => { attempt.current = null; currentKey.current = ""; };
  }, [key, recovering, setPreviewReference]);
  useEffect(() => {
    if (!recovering || !recoveryRef || !client) return;
    const controller = new AbortController(); const epochKey = requestKey;
    void client.request("readMaterialContext", { contextVersionId: recoveryRef.contextVersionId }, controller.signal).then(result => {
      if (!controller.signal.aborted && epochKey === currentKey.current) {
        setSavedPreview({ key, value: result.preview }); previewCallback.current({ reference: recoveryRef, preview: result.preview });
      }
    }).catch(() => { if (!controller.signal.aborted && epochKey === currentKey.current) setMessage("原预览已不可恢复，请返回路线确认保存结果。"); });
    return () => controller.abort();
  }, [client, recovering, recoveryRef, key, requestKey]);
  if (!state?.capabilities?.documentsEnabled || !selectedCount) return null;

  async function review() {
    if (!state || busy || disabled || recovering || entries.length !== selectedCount) return;
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
        if (epochKey !== currentKey.current || attempt.current !== mutation) return null;
        state.setSelection(selection);
        const context = await state.client.request("createMaterialContext", { ...input, scope, selectionRef: selection, mutationId: mutation.contextMutation,
          ...(choices.skillMappings.length ? { skillMappings: choices.skillMappings } : {}),
          ...(choices.termMappings.length ? { termMappings: choices.termMappings } : {}),
          ...(choices.learningIntents.length ? { learningIntents: choices.learningIntents } : {}),
        }, signal);
        return { reference: { selectionRef: selection, contextVersionId: context.contextVersionId, previewToken: context.previewToken }, preview: context.preview };
      });
      if (result && epochKey === currentKey.current && attempt.current === mutation) {
        const savedChoices = choicesFromPreview(result.preview);
        currentChoices.current = { key, value: savedChoices }; currentKey.current = choicesKey(key, savedChoices);
        setChoiceDraft({ key, value: savedChoices }); state.setPreview(result.reference);
        setSavedPreview({ key, value: result.preview }); previewCallback.current(result);
      }
    } catch { if (epochKey === currentKey.current && attempt.current === mutation) setMessage("暂时无法核对资料影响。请检查已确认资料或重新生成预览。"); }
    finally { setBusy(false); }
  }
  function changeChoices(next: Choices) {
    if (!state) return;
    // Invalidate before React renders or flushes effects, so an outstanding response cannot revive the old reference.
    currentKey.current = choicesKey(key, next); currentChoices.current = { key, value: next }; attempt.current = null;
    setChoiceDraft({ key, value: next }); state.setPreview(null); previewCallback.current(null);
    setMessage("资料采用方式已修改，请重新核对资料对路线的影响后采用。");
  }
  function chooseSkill(confirmationId: string, itemId: string, skillId: string, skillLabel?: string) {
    if (!state || disabled || busy || recovering || (skillId && !(skillLabel !== undefined && skillId === OMIT_TERM) && !availableSkills.some(skill => skill.id === skillId))) return;
    const current = currentChoices.current.key === key ? currentChoices.current.value : emptyChoices;
    const skillMappings = current.skillMappings.filter(mapping => !sameItem(mapping, confirmationId, itemId));
    if (skillLabel === undefined) {
      if (skillId) skillMappings.push({ confirmationId, itemId, skillId });
      changeChoices({ ...current, skillMappings });
    } else {
      const termMappings = current.termMappings.filter(mapping => !sameItem(mapping, confirmationId, itemId) || mapping.skillLabel !== skillLabel);
      if (skillId) termMappings.push({ confirmationId, itemId, skillLabel, skillIds: skillId === OMIT_TERM ? [] : [skillId] });
      changeChoices({ ...current, skillMappings, termMappings });
    }
  }
  function chooseLearningIntent(confirmationId: string, itemId: string, adopted: boolean, isConstraint: boolean) {
    if (!state || disabled || busy || recovering) return;
    const current = currentChoices.current.key === key ? currentChoices.current.value : emptyChoices;
    const learningIntents = current.learningIntents.filter(choice => !sameItem(choice, confirmationId, itemId));
    if (adopted) learningIntents.push({ confirmationId, itemId });
    changeChoices({ ...current, learningIntents,
      ...(!adopted && isConstraint ? {
        termMappings: current.termMappings.filter(choice => !sameItem(choice, confirmationId, itemId)),
        skillMappings: current.skillMappings.filter(choice => !sameItem(choice, confirmationId, itemId)),
      } : {}),
    });
  }
  const displayedChoices = recovering ? choicesFromPreview(preview) : choices;
  const mappingDirty = !recovering && (!state.refs.preview || JSON.stringify(choices) !== JSON.stringify(choicesFromPreview(preview)));
  const issues = preview?.issues ?? [];
  const issueCount = issues.reduce((total, issue) => total + Math.max(1, issue.itemIds.length), 0);
  const mappedSkillCount = preview?.mappingDetails === undefined ? null
    : new Set(preview.mappingDetails.filter(row => row.status === "mapped").flatMap(row => row.skillIds)).size;
  const skillNames = (ids: readonly string[]) => ids.map(id => availableSkills.find(skill => skill.id === id)?.name ?? id).join("、");
  const basisLabels = { literal: "名称或已登记别名", contextual: "上下文对应", manual: "手动选择" };
  function mappingResult(itemId: string, termIndex: number) {
    const detail = preview?.mappingDetails?.find(row => row.itemId === itemId && row.termIndexes.includes(termIndex));
    if (!detail) return <p>历史预览未记录逐词对应结果。</p>;
    const status = detail.status === "mapped" ? `已对应：${skillNames(detail.skillIds)}`
      : detail.status === "ambiguous" ? `对应待核对：${skillNames(detail.skillIds)}`
      : detail.status === "uncovered" ? "当前蓝图未覆盖"
      : detail.status === "omitted" ? "已明确不用于本轮映射" : "未用于本轮学习排序";
    return <p>{mappingDirty && "上次预览："}{status}{detail.basis && ` · 依据：${basisLabels[detail.basis]}`}</p>;
  }
  function mappingSelect(confirmationId: string, itemId: string, label: string, blocked: boolean, skillLabel?: string) {
    const termChoice = skillLabel === undefined ? undefined : displayedChoices.termMappings.find(choice => sameItem(choice, confirmationId, itemId) && choice.skillLabel === skillLabel);
    const ids = skillLabel === undefined ? displayedChoices.skillMappings.filter(choice => sameItem(choice, confirmationId, itemId)).map(choice => choice.skillId) : termChoice?.skillIds;
    const saved = Boolean(ids && (ids.length > 1 || ids.length === 1 && !availableSkills.some(skill => skill.id === ids[0])));
    const value = saved ? SAVED_CHOICE : ids?.length ? ids[0] : termChoice ? OMIT_TERM : "";
    return <label>对应的已有技能<select aria-label={label} disabled={disabled || busy || recovering || blocked} value={value}
      onChange={event => chooseSkill(confirmationId, itemId, event.target.value, skillLabel)}>
      <option value="">自动对应；未匹配时保留未覆盖</option>
      {skillLabel !== undefined && <option value={OMIT_TERM}>不用于本轮映射</option>}
      {saved && <option value={SAVED_CHOICE}>已保存：{skillNames(ids!)}</option>}
      {availableSkills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
    </select></label>;
  }
  return <section className="material-context-review"><MaterialSelectionSummary disabled={disabled || busy || recovering} />
    {!state.capabilities.planningEnabled ? <p>资料辅助规划暂未开放。可移除本次选择，继续普通规划。</p> : <>
    {entries.length !== selectedCount && <p role="alert">请先核对并确认每份资料的事实，或移除未采用的资料。</p>}
    <button type="button" disabled={busy || disabled || recovering || entries.length !== selectedCount} onClick={() => void review()}>{busy ? "正在核对资料影响…" : "核对资料对路线的影响"}</button>
    {preview && <div className="material-preview"><p role="status">{mappingDirty ? "资料采用方式待重新预览，当前结果暂不可采用。" : "资料预览已就绪。创建路线时将再次校验所选版本。"}</p>
      <h3>确认的事实与要求</h3><ul>{preview.confirmedItems.map((item, index) => {
        const reference = preview.itemReferences?.find(reference => reference.id === item.id);
        const eligible = reference?.learningIntentEligible === true;
        const adopted = Boolean(reference && displayedChoices.learningIntents.some(choice => sameItem(choice, reference.confirmationId, reference.itemId)));
        const mappingBlocked = item.kind === "constraint" && !adopted;
        const historicalSkillIds = item.skillLabels !== undefined && reference
          ? displayedChoices.skillMappings.filter(choice => sameItem(choice, reference.confirmationId, reference.itemId)).map(choice => choice.skillId) : [];
        return <li key={item.id}><span>{item.text}</span>{Boolean(item.skillLabels?.length) && <small> · {item.kind === "constraint" ? "约束主题" : "已确认技能词"} {item.skillLabels!.join("、")}</small>}
          {eligible && reference && <><label><input type="checkbox" aria-label={`事实 ${index + 1} 作为本轮学习重点`} checked={adopted} disabled={disabled || busy || recovering}
            onChange={event => chooseLearningIntent(reference.confirmationId, reference.itemId, event.target.checked, item.kind === "constraint")} />作为本轮学习重点</label>
            <p>{adopted ? "已选择作为本轮学习重点；确认预览后用于学习排序。" : "未采用为学习重点，不用于本轮学习排序。"}事实分类、能力自评和可用时间保持不变。</p></>}
          {historicalSkillIds.length > 0 ? <p>历史整条事实对应：{skillNames(historicalSkillIds)}。此快照未保存逐词对应关系。</p>
            : item.skillLabels?.length ? <ul>{item.skillLabels.map((skillLabel, termIndex) => <li key={skillLabel}><span>{skillLabel}</span>
            {mappingResult(item.id, termIndex)}
            {reference && availableSkills.length > 0 && mappingSelect(reference.confirmationId, reference.itemId, `事实 ${index + 1} 技能词 ${skillLabel} 对应的已有技能`, mappingBlocked, skillLabel)}
          </li>)}</ul> : item.skillLabels === undefined ? <>
            {preview.mappingDetails && mappingResult(item.id, -1)}
            {reference && availableSkills.length > 0 && (item.kind !== "constraint" || eligible) && mappingSelect(reference.confirmationId, reference.itemId, `事实 ${index + 1} 对应的已有技能`, mappingBlocked)}
          </> : <p>未保留可映射的技能词。</p>}
        </li>;
      })}</ul>
      {availableSkills.length > 0 && <p>如有未覆盖或对应不准确的词，可明确选择当前蓝图已有技能；不会新增课程或改变能力自评。</p>}
      <p>{mappedSkillCount !== null && <>已对应课程 {mappedSkillCount} 项技能；</>}参与当前排序 {preview.priorities.length} 项技能。</p>
      <p>否定、他人经历或未来计划中的主题也可对应课程，但不代表已有实践或能力等级；能力仍以你的自我评估为准。</p>
      {issueCount > 0 && <p>有 {issueCount} 项需注意：歧义映射、未覆盖内容或自评冲突会保留为提醒，不会擅自增加技能。</p>}
      {preview.uncoveredLabels.length > 0 && <p>当前蓝图未覆盖：{preview.uncoveredLabels.join("、")}</p>}
      {preview.planning && <p>全量预计完成：{preview.planning.fullScope.estimatedCompletionDate}；目标日期方案：{preview.planning.targetDate?.estimatedCompletionDate ?? "不可行"}。{preview.planning.infeasibleReason}</p>}
    </div>}</>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
