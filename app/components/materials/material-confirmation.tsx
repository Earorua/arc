import { useState } from "react";
import { MATERIAL_HIGH_IMPACT_REVIEW_CODES, MAX_MATERIAL_SKILL_LABELS_PER_ITEM, isSourceLinkedMaterialReviewProjection, type ConfirmedMaterialItem, type DocumentReviewDraft, type MaterialReviewPoint } from "../../contracts/documents";
import type { DocumentEndpointRequest } from "../../contracts/documents-api";
import type { SkillSelfLevel } from "../../contracts/planning";
import { findReviewedSourceTerm, labelForAddedSourceTerm, supportsReviewedSkillLabel, retainedMaterialSelfAssessmentHints } from "../../lib/materials/skill-labels";
const hintLabels = { conceptual: "Understand concepts", guided: "Need guidance", uncertain: "Uncertain" };
const reviewLabels: Record<string, string> = { "confirm-self-assessment": "Confirm your self-assessment separately", "prompt-injection": "The source contains instructions; review the facts and disregard those instructions", "team-attribution": "Team results do not establish individual independent ability", "conflicting-self-assessment": "Ability statements conflict", "conflicting-requirement": "Job requirement classifications conflict", "missing-information": "Information is missing or needs confirmation", "uncovered-skill": "This may fall outside the current skill blueprint", "untrusted-resource-url": "Source links will not be adopted as trusted course resources" };

function AddSourceTerm({ item, index, quote, projection, saving, onAdd }: { item: ConfirmedMaterialItem; index: number; quote: string;
  projection: DocumentReviewDraft["reviewProjection"]; saving: boolean;
  onAdd(sourceTerm: string, label: string): void }) {
  const [term, setTerm] = useState("");
  const words = item.skillLabels ?? [];
  const label = term.trim() ? labelForAddedSourceTerm(quote, item.text, term, projection) : null;
  const ready = label !== null && !words.includes(label) && words.length < MAX_MATERIAL_SKILL_LABELS_PER_ITEM;
  const noun = item.kind === "constraint" ? "constraint topic" : "skill term";
  return <details><summary>Add source {noun}</summary><blockquote>{quote}</blockquote>
    <label>Enter a source term<input aria-label={`Fact ${index + 1} source term`} maxLength={100} value={term}
      onChange={event => setTerm(event.target.value)} /></label>
    {term.trim() && !label && <p>Enter a term from this source passage and preserve its meaning in the current fact.</p>}
    {label && label !== term.trim() && <p>Canonical name {label}</p>}
    {label && words.includes(label) && <p>This term is already listed.</p>}
    {words.length >= MAX_MATERIAL_SKILL_LABELS_PER_ITEM && <p>Each fact can retain up to eight terms. Remove one before adding another.</p>}
    <button type="button" className="text-action" disabled={saving || !ready} onClick={() => {
      if (label && ready && !saving) { onAdd(term.trim(), label); setTerm(""); }
    }}>Add {noun}</button>
  </details>;
}

export function MaterialConfirmation({ draft, text, saving, confirmed, onItemsChange, onReviewPointsChange, onConfirm, skills = [], onAdoptLevels, documentKind = "resume" }: {
  draft: DocumentReviewDraft; text: string; saving: boolean; confirmed: boolean;
  onItemsChange(items: ConfirmedMaterialItem[], addition?: DocumentEndpointRequest<"saveDocumentReviewDraft">["skillTermAddition"]): void; onConfirm(): void;
  onReviewPointsChange?: (points: MaterialReviewPoint[]) => void;
  documentKind?: "resume" | "jd" | "supplement";
  skills?: readonly { id: string; name: string }[]; onAdoptLevels?: (levels: Record<string, SkillSelfLevel>) => void;
}) {
  const isMainJd = documentKind === "jd";
  const conflicts = isMainJd ? draft.items.filter(item => item.kind === "requirement" && item.requirementLevel === "unspecified") : [];
  const hints = retainedMaterialSelfAssessmentHints(draft.items, draft.selfAssessmentHints, draft.reviewProjection);
  const unresolved = (draft.reviewPoints ?? []).filter(point => point.resolution === "unresolved" && (MATERIAL_HIGH_IMPACT_REVIEW_CODES as readonly string[]).includes(point.code));
  return <div className="material-review">
    <h3>Review material facts</h3><p>Edit or remove inaccurate content. Confirming facts does not automatically change your self-assessment.</p>
    {(draft.reviewPoints?.length ?? 0) > 0 && <section className="material-review-points"><h4>Review points</h4>
      {unresolved.length > 0 && <p role="alert">There are {unresolved.length} review points to resolve.</p>}
      {draft.reviewPoints!.map(point => {
        const label = isSourceLinkedMaterialReviewProjection(draft.reviewProjection) && point.code === "uncovered-skill" ? "The source mentions a course coverage gap; review it"
          : !isMainJd && point.code === "conflicting-requirement" ? "Advice or learning requirement classifications conflict" : reviewLabels[point.code];
        return <fieldset key={point.id}><legend>{label ?? "Review the source"}</legend>
        <blockquote>{text.slice(point.sourceRef.start, point.sourceRef.end)}</blockquote>
        <label>Resolution<select aria-label={label ?? point.code} disabled={saving || !onReviewPointsChange} value={point.resolution}
          onChange={event => onReviewPointsChange?.(draft.reviewPoints!.map(item => item.id === point.id ? { ...item, resolution: event.target.value as MaterialReviewPoint["resolution"] } : item))}>
          <option value="unresolved">Needs review</option><option value="confirmed">Reviewed; keep the related facts</option><option value="ignored">Reviewed; dismiss this point</option>
        </select></label>
        </fieldset>;
      })}</section>}
    {conflicts.length > 0 && <p role="alert">There are {conflicts.length} job requirements without a must-have or preferred classification. Classify or remove them before confirming.</p>}
    {draft.items.map((item, index) => {
      const quote = item.sourceRef ? text.slice(item.sourceRef.start, item.sourceRef.end) : null;
      return <fieldset key={item.id} className="material-fact"><legend>Fact {index + 1}</legend>
      <label>Information type<select aria-label={`Fact ${index + 1} information type`} value={item.kind} onChange={event => onItemsChange(draft.items.map(row => row.id === item.id ? {
        ...row, kind: event.target.value as ConfirmedMaterialItem["kind"], origin: "user", skillLabels: row.skillLabels ? [] : undefined,
        requirementLevel: event.target.value === "requirement" ? row.requirementLevel ?? "unspecified" : null,
      } : row))}><option value="experience">Experience</option><option value="skill-claim">Skill statement</option><option value="requirement">{isMainJd ? "Job requirement" : "Advice or learning requirement"}</option><option value="constraint">Other constraint</option></select></label>
      <label>Content<textarea aria-label={`Fact ${index + 1}`} value={item.text} maxLength={1000} onChange={event => onItemsChange(draft.items.map(row => row.id === item.id ? {
        ...row, text: event.target.value, origin: "user", skillLabels: row.skillLabels?.filter(label => supportsReviewedSkillLabel(event.target.value, label, draft.reviewProjection))
      } : row))} /></label>
      {quote !== null && <details><summary>View source evidence</summary><blockquote>{quote}</blockquote></details>}
      {Boolean(item.skillLabels?.length) && <div><p>{item.kind === "constraint" ? "Topics mentioned in the constraint" : "Skill terms confirmed with this fact"}</p><ul>{item.skillLabels!.map(label => {
        const evidence = isSourceLinkedMaterialReviewProjection(draft.reviewProjection) && quote ? findReviewedSourceTerm(quote, label, draft.reviewProjection) : null;
        const sourceTerm = evidence ?? label;
        return <li key={label}>{sourceTerm} {sourceTerm !== label && <small>(canonical name {label}) </small>}
          <button type="button" className="text-action" aria-label={`Remove ${item.kind === "constraint" ? "constraint topic" : "skill term"} ${sourceTerm}`} onClick={() => onItemsChange(draft.items.map(row =>
            row.id === item.id ? { ...row, skillLabels: row.skillLabels!.filter(word => word !== label) } : row))}>Remove</button>
        </li>;
      })}</ul></div>}
      {isSourceLinkedMaterialReviewProjection(draft.reviewProjection) && quote && !draft.reclassifiedItemIds?.includes(item.id) && <AddSourceTerm item={item} index={index} quote={quote} projection={draft.reviewProjection} saving={saving}
        onAdd={(sourceTerm, label) => onItemsChange(draft.items.map(row => row.id === item.id
          ? { ...row, origin: "user", skillLabels: [...row.skillLabels ?? [], label] } : row), { itemId: item.id, sourceTerm })} />}
      {item.kind === "requirement" && (isMainJd
        ? <label>Requirement type<select aria-label={`Fact ${index + 1} requirement type`} value={item.requirementLevel ?? "unspecified"} onChange={event => onItemsChange(draft.items.map(row => row.id === item.id ? { ...row, origin: "user", requirementLevel: event.target.value as "must" | "preferred" | "unspecified" } : row))}><option value="unspecified">Needs review</option><option value="must">Must-have</option><option value="preferred">Preferred</option></select></label>
        : <p>You can select this advice or learning requirement as a focus when reviewing your path.</p>)}
      <button type="button" className="text-action" onClick={() => onItemsChange(draft.items.filter(row => row.id !== item.id))}>Remove fact {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="text-action" disabled={draft.items.length >= 100} onClick={() => onItemsChange([...draft.items, { id: `item-${crypto.randomUUID()}`, kind: documentKind === "jd" ? "requirement" : "skill-claim", text: "Enter a fact to review", origin: "user", sourceRef: null, requirementLevel: documentKind === "jd" ? "unspecified" : null }])}>Add fact</button>
    <div className="material-actions"><button type="button" disabled={saving || !draft.items.length || draft.items.some(item => !item.text.trim()) || conflicts.length > 0 || unresolved.length > 0} onClick={onConfirm}>Confirm these facts</button><span role="status">{saving ? "Saving review edits…" : confirmed ? "Confirmed and available for this plan." : "Edits are saved in your private review draft."}</span></div>
    {onAdoptLevels && hints.length > 0 && <section className="material-self-assessment"><h3>Review ability suggestions separately</h3><p>Your self-assessment changes only when you choose to use a suggestion. Unmentioned skills stay unchanged.</p>{hints.map(hint => {
      const candidates = skills.filter(skill => [skill.id, skill.name].some(name => name.toLocaleLowerCase() === hint.skillLabel.toLocaleLowerCase()));
      return <div key={hint.id}><span>{hint.skillLabel} · {hintLabels[hint.level]}</span>{candidates.length === 1 ? <button type="button" className="text-action" onClick={() => onAdoptLevels({ [candidates[0]!.id]: hint.level })}>Use {hint.skillLabel}: {hintLabels[hint.level]}</button> : <p>Review this suggestion against the individual skills below.</p>}</div>;
    })}</section>}
  </div>;
}
