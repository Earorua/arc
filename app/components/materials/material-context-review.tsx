"use client";
import { COURSE_TASK_EVIDENCE, COURSE_TASK_REMAINING_LABELS } from "../../lib/materials/course-task-evidence";
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
    }).catch(() => { if (!controller.signal.aborted && epochKey === currentKey.current) setMessage("The original preview cannot be recovered. Return to your path to check whether it was saved."); });
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
    } catch { if (epochKey === currentKey.current && attempt.current === mutation) setMessage("Material impact could not be reviewed. Check the confirmed materials or create a new preview."); }
    finally { setBusy(false); }
  }
  function changeChoices(next: Choices) {
    if (!state) return;
    // Invalidate before React renders or flushes effects, so an outstanding response cannot revive the old reference.
    currentKey.current = choicesKey(key, next); currentChoices.current = { key, value: next }; attempt.current = null;
    setChoiceDraft({ key, value: next }); state.setPreview(null); previewCallback.current(null);
    setMessage("Material choices changed. Review their impact on your path again before using them.");
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
  const skillNames = (ids: readonly string[]) => ids.map(id => availableSkills.find(skill => skill.id === id)?.name ?? id).join(", ");
  const basisLabels = { literal: "Name or registered alias", contextual: "Contextual match", manual: "Manual choice" };
  function mappingResult(itemId: string, termIndex: number) {
    const detail = preview?.mappingDetails?.find(row => row.itemId === itemId && row.termIndexes.includes(termIndex));
    if (!detail) return <p>This historical preview did not record individual term matches.</p>;
    const status = detail.status === "mapped" ? `Matched: ${skillNames(detail.skillIds)}`
      : detail.status === "ambiguous" ? `Match needs review: ${skillNames(detail.skillIds)}`
      : detail.status === "uncovered" ? "Outside the current blueprint"
      : detail.status === "omitted" ? "Explicitly excluded from this mapping" : "Not used to prioritize this plan";
    const coverage = detail.taskCoverage;
    return <><p>{mappingDirty && "Previous preview: "}{status}{detail.basis && ` · Basis: ${basisLabels[detail.basis]}`}</p>
      {coverage ? <p>{mappingDirty && "Previous preview: "}Task coverage: {{ full: "Full (recognized narrow task only)", partial: "Partial", none: "Unverified", "not-applicable": "Not applicable" }[coverage.status]}
        {coverage.support.length > 0 && ` · Supported: ${coverage.support.map(id => COURSE_TASK_EVIDENCE[id].label).join(", ")}`}
        {coverage.remaining && ` · ${COURSE_TASK_REMAINING_LABELS[coverage.remaining]}`}.</p>
        : <p>Task coverage was not checked in this historical preview. A course-topic match does not establish full teaching coverage.</p>}</>;
  }
  function mappingSelect(confirmationId: string, itemId: string, label: string, blocked: boolean, skillLabel?: string) {
    const termChoice = skillLabel === undefined ? undefined : displayedChoices.termMappings.find(choice => sameItem(choice, confirmationId, itemId) && choice.skillLabel === skillLabel);
    const ids = skillLabel === undefined ? displayedChoices.skillMappings.filter(choice => sameItem(choice, confirmationId, itemId)).map(choice => choice.skillId) : termChoice?.skillIds;
    const saved = Boolean(ids && (ids.length > 1 || ids.length === 1 && !availableSkills.some(skill => skill.id === ids[0])));
    const value = saved ? SAVED_CHOICE : ids?.length ? ids[0] : termChoice ? OMIT_TERM : "";
    return <label>Matching existing skill<select aria-label={label} disabled={disabled || busy || recovering || blocked} value={value}
      onChange={event => chooseSkill(confirmationId, itemId, event.target.value, skillLabel)}>
      <option value="">Match automatically; retain unmatched scope</option>
      {skillLabel !== undefined && <option value={OMIT_TERM}>Exclude from this mapping</option>}
      {saved && <option value={SAVED_CHOICE}>Saved: {skillNames(ids!)}</option>}
      {availableSkills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
    </select></label>;
  }
  return <section className="material-context-review"><MaterialSelectionSummary disabled={disabled || busy || recovering} />
    {!state.capabilities.planningEnabled ? <p>Material-assisted planning is not available yet. Remove this selection to continue without materials.</p> : <>
    {entries.length !== selectedCount && <p role="alert">Review and confirm the facts in each material, or remove materials you do not want to use.</p>}
    <button type="button" disabled={busy || disabled || recovering || entries.length !== selectedCount} onClick={() => void review()}>{busy ? "Reviewing material impact…" : "Review material impact on the path"}</button>
    {preview && <div className="material-preview"><p role="status">{mappingDirty ? "Material choices need a new preview. The current result cannot be used yet." : "The material preview is ready. Selected versions will be checked again when the path is created."}</p>
      <h3>Confirmed facts and requirements</h3><ul>{preview.confirmedItems.map((item, index) => {
        const reference = preview.itemReferences?.find(reference => reference.id === item.id);
        const eligible = reference?.learningIntentEligible === true;
        const adopted = Boolean(reference && displayedChoices.learningIntents.some(choice => sameItem(choice, reference.confirmationId, reference.itemId)));
        const mappingBlocked = item.kind === "constraint" && !adopted;
        const historicalSkillIds = item.skillLabels !== undefined && reference
          ? displayedChoices.skillMappings.filter(choice => sameItem(choice, reference.confirmationId, reference.itemId)).map(choice => choice.skillId) : [];
        return <li key={item.id}><span>{item.text}</span>{Boolean(item.skillLabels?.length) && <small> · {item.kind === "constraint" ? "Constraint topic" : "Confirmed skill term"} {item.skillLabels!.join(", ")}</small>}
          {eligible && reference && <><label><input type="checkbox" aria-label={`Fact ${index + 1} as a focus for this plan`} checked={adopted} disabled={disabled || busy || recovering}
            onChange={event => chooseLearningIntent(reference.confirmationId, reference.itemId, event.target.checked, item.kind === "constraint")} />Use as a focus for this plan</label>
            <p>{adopted ? "Selected as a focus for this plan; used for prioritization after the preview is confirmed." : "Not selected as a focus; it does not affect this plan's priorities."}{" "}Fact classification, self-assessment and available time stay unchanged.</p></>}
          {historicalSkillIds.length > 0 ? <p>Historical whole-fact match: {skillNames(historicalSkillIds)}. This snapshot did not save individual term matches.</p>
            : item.skillLabels?.length ? <ul>{item.skillLabels.map((skillLabel, termIndex) => <li key={skillLabel}><span>{skillLabel}</span>
            {mappingResult(item.id, termIndex)}
            {reference && availableSkills.length > 0 && mappingSelect(reference.confirmationId, reference.itemId, `Fact ${index + 1} skill term ${skillLabel} matching existing skill`, mappingBlocked, skillLabel)}
          </li>)}</ul> : item.skillLabels === undefined ? <>
            {preview.mappingDetails && mappingResult(item.id, -1)}
            {reference && availableSkills.length > 0 && (item.kind !== "constraint" || eligible) && mappingSelect(reference.confirmationId, reference.itemId, `Fact ${index + 1} matching existing skill`, mappingBlocked)}
          </> : <p>No skill terms were retained for mapping.</p>}
        </li>;
      })}</ul>
      {availableSkills.length > 0 && <p>For an unmatched or inaccurate term, you can choose an existing blueprint skill. This does not add courses or change your self-assessment.</p>}
      <p>{mappedSkillCount !== null && <>Skills matched to courses: {mappedSkillCount}; </>}Skills prioritized: {preview.priorities.length}.</p>
      <p>Topics in negative statements, other people&apos;s experience or future plans may match courses, but do not establish personal practice or ability. Your self-assessment remains the source of ability levels.</p>
      <p>Task coverage describes the scope supported by existing course content. It does not establish ability, experience or an adopted priority.</p>
      {issueCount > 0 && <p>There are {issueCount} items to review. Ambiguous matches, uncovered scope and self-assessment conflicts remain visible; no skills are added automatically.</p>}
      {preview.uncoveredLabels.length > 0 && <p>Outside the current blueprint: {preview.uncoveredLabels.join(", ")}</p>}
      {preview.planning && <p>Full-scope estimated finish: {preview.planning.fullScope.estimatedCompletionDate}; target-date plan: {preview.planning.targetDate?.estimatedCompletionDate ?? "Not feasible"}. {preview.planning.infeasibleReason}</p>}
    </div>}</>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
