"use client";

import { SetupDisclosure } from "./setup-disclosure";
import type { RoleBlueprint } from "../../contracts/intelligence";
import { skillEvidenceSchema, type EvidenceKind, type SkillSelfLevel } from "../../contracts/planning";

const categories = ["foundations", "frontend", "backend", "data", "quality", "cloud", "ai", "product"] as const;
const categoryLabels = { foundations: "Foundations", frontend: "Frontend", backend: "Backend", data: "Data", quality: "Quality", cloud: "Cloud", ai: "AI", product: "Product" };
const evidenceLabels = { repository: "Repository", deployment: "Deployment", project: "Project", document: "Document", other: "Other" };
const levels: { value: SkillSelfLevel; label: string }[] = [
  { value: "unseen", label: "Not started" }, { value: "conceptual", label: "Understand concepts" },
  { value: "guided", label: "Need guidance" }, { value: "independent", label: "Independent" },
  { value: "uncertain", label: "Uncertain" },
];

export type SkillEvidenceDraft = { id: string; kind: EvidenceKind; url: string; note: string };
export type SkillAuditDraft = {
  levels: Record<string, SkillSelfLevel>;
  evidence: Record<string, SkillEvidenceDraft[]>;
};

export function createSkillAuditDraft(blueprint: RoleBlueprint): SkillAuditDraft {
  return {
    levels: Object.fromEntries(blueprint.skills.map(({ id }) => [id, "unseen"])),
    evidence: Object.fromEntries(blueprint.skills.map(({ id }) => [id, []])),
  };
}

export function isSkillAuditDraftValid(blueprint: RoleBlueprint, draft: SkillAuditDraft): boolean {
  const allIds = blueprint.skills.flatMap((skill) => (draft.evidence[skill.id] ?? []).map(({ id }) => id));
  return new Set(allIds).size === allIds.length && blueprint.skills.every((skill) => {
    if (!levels.some(({ value }) => value === draft.levels[skill.id])) return false;
    return (draft.evidence[skill.id] ?? []).every((item) => skillEvidenceSchema.safeParse({ ...item, skillId: skill.id }).success);
  });
}

function evidenceErrors(skillId: string, item: SkillEvidenceDraft) {
  const urlValid = skillEvidenceSchema.safeParse({ ...item, skillId, note: "Evidence" }).success;
  const noteValid = item.note.trim().length >= 1 && item.note.trim().length <= 300;
  return { url: urlValid ? null : "Enter a public HTTPS link.", note: noteValid ? null : "Briefly describe the content at this link." };
}

export function SkillAuditStep({ blueprint, value, onChange }: {
  blueprint: RoleBlueprint; value: SkillAuditDraft; onChange: (next: SkillAuditDraft) => void;
}) {
  const updateLevel = (skillId: string, level: SkillSelfLevel) => onChange({
    ...value, levels: { ...value.levels, [skillId]: level },
  });
  const updateEvidence = (skillId: string, index: number, patch: Partial<SkillEvidenceDraft>) => {
    const rows = [...(value.evidence[skillId] ?? [])];
    rows[index] = { ...rows[index]!, ...patch };
    onChange({ ...value, evidence: { ...value.evidence, [skillId]: rows } });
  };
  const addEvidence = (skillId: string) => {
    const rows = value.evidence[skillId] ?? [];
    if (rows.length >= 3) return;
    const used = new Set(blueprint.skills.flatMap((skill) => (value.evidence[skill.id] ?? []).map(({ id }) => id)));
    let suffix = 1;
    while (used.has(`evidence-${skillId}-${suffix}`)) suffix += 1;
    onChange({ ...value, evidence: { ...value.evidence, [skillId]: [...rows, { id: `evidence-${skillId}-${suffix}`, kind: "project", url: "", note: "" }] } });
  };

  const groups = categories.flatMap((category) => {
    const skills = blueprint.skills.filter((skill) => skill.category === category);
    return Array.from({ length: Math.ceil(skills.length / 4) }, (_, index) => ({ category, skills: skills.slice(index * 4, index * 4 + 4), offset: index * 4, total: skills.length }));
  });
  return <div className="audit-ledger">
    <p className="setup-disclosure" id="audit-disclosure">This is your self-assessment, not an Arc verification. Choose what you can do today and optionally add evidence links. Uncertain skills start with a calibration task; completing it does not establish mastery or remove later learning.</p>
    {groups.map(({ category, skills, offset, total }, groupIndex) => {
      const defaultOpen = groupIndex === 0 || groups.slice(0, groupIndex + 1).reduce((sum, group) => sum + group.skills.length, 0) <= 4;
      const range = total > 4 ? ` · ${offset + 1}–${offset + skills.length}` : "";
      return <SetupDisclosure className="audit-category-disclosure" key={`${category}:${offset}`} defaultOpen={defaultOpen} title={<>{categoryLabels[category]} skills{range} <span>{skills.length} {skills.length === 1 ? "skill" : "skills"}</span></>}>
        <fieldset className="audit-category">
        <legend className="sr-only">{categoryLabels[category]} skills</legend>
        <SetupDisclosure className="audit-bulk-disclosure" title={`${categoryLabels[category]} bulk settings${range}`}>
        <div className="category-actions" aria-label={`${categoryLabels[category]} bulk settings`}>
          {levels.map(({ value: level, label }) => <button key={level} onClick={() => onChange({
            ...value,
            levels: { ...value.levels, ...Object.fromEntries(skills.map(({ id }) => [id, level])) },
          })} type="button">Set {categoryLabels[category]} to {label}</button>)}
        </div>
        </SetupDisclosure>
        {skills.map((skill) => <div className="audit-skill" key={skill.id}>
          <fieldset aria-describedby="audit-disclosure" className="audit-levels">
            <legend>{skill.name} self-assessment</legend>
            <p>{skill.why}</p>
            <div className="audit-radio-row">
              {levels.map(({ value: level, label }) => <label key={level}>
                <input checked={value.levels[skill.id] === level} name={`level-${skill.id}`} onChange={() => updateLevel(skill.id, level)} type="radio" value={level} />
                <span>{label}</span>
              </label>)}
            </div>
          </fieldset>
          <SetupDisclosure className="audit-evidence-disclosure" defaultOpen={(value.evidence[skill.id]?.length ?? 0) > 0} title="Add evidence (optional)">
          {(value.evidence[skill.id] ?? []).map((item, index) => {
            const errors = evidenceErrors(skill.id, item);
            const urlErrorId = `evidence-url-error-${skill.id}-${index}`;
            const noteErrorId = `evidence-note-error-${skill.id}-${index}`;
            return <fieldset className="evidence-row" key={item.id}>
              <legend>Evidence link {index + 1}</legend>
              <label>Type<select aria-label={`${skill.name} Evidence type ${index + 1}`} onChange={(event) => updateEvidence(skill.id, index, { kind: event.target.value as EvidenceKind })} value={item.kind}>
                {(["repository", "deployment", "project", "document", "other"] as const).map((kind) => <option key={kind} value={kind}>{evidenceLabels[kind]}</option>)}
              </select></label>
              <label>Public link<input aria-describedby={errors.url ? urlErrorId : undefined} aria-invalid={Boolean(errors.url)} aria-label={`${skill.name} Evidence link ${index + 1}`} onChange={(event) => updateEvidence(skill.id, index, { url: event.target.value })} type="url" value={item.url} /></label>
              <label>Description<input aria-describedby={errors.note ? noteErrorId : undefined} aria-invalid={Boolean(errors.note)} aria-label={`${skill.name} Evidence note ${index + 1}`} maxLength={300} onChange={(event) => updateEvidence(skill.id, index, { note: event.target.value })} value={item.note} /></label>
              <button className="text-action" onClick={() => onChange({ ...value, evidence: { ...value.evidence, [skill.id]: (value.evidence[skill.id] ?? []).filter((_, itemIndex) => itemIndex !== index) } })} type="button">Remove {skill.name} evidence {index + 1}</button>
              {errors.url && <p id={urlErrorId} role="alert">{errors.url}</p>}
              {errors.note && <p id={noteErrorId} role="alert">{errors.note}</p>}
            </fieldset>;
          })}
          <button className="text-action" disabled={(value.evidence[skill.id]?.length ?? 0) >= 3} onClick={() => addEvidence(skill.id)} type="button">Add evidence link for {skill.name}</button>
          </SetupDisclosure>
        </div>)}
      </fieldset></SetupDisclosure>;
    })}
  </div>;
}
