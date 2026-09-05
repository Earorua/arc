"use client";

import type { RoleBlueprint } from "../../contracts/intelligence";
import { skillEvidenceSchema, type EvidenceKind, type SkillSelfLevel } from "../../contracts/planning";

const categories = ["foundations", "frontend", "backend", "data", "quality", "cloud", "ai", "product"] as const;
const levels: { value: SkillSelfLevel; label: string }[] = [
  { value: "unseen", label: "Unseen" }, { value: "conceptual", label: "Conceptual" },
  { value: "guided", label: "Guided" }, { value: "independent", label: "Independent" },
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
    if (!draft.levels[skill.id]) return false;
    return (draft.evidence[skill.id] ?? []).every((item) => skillEvidenceSchema.safeParse({ ...item, skillId: skill.id }).success);
  });
}

function evidenceErrors(skillId: string, item: SkillEvidenceDraft) {
  const urlValid = skillEvidenceSchema.safeParse({ ...item, skillId, note: "Evidence" }).success;
  const noteValid = item.note.trim().length >= 1 && item.note.trim().length <= 300;
  return { url: urlValid ? null : "Enter a public HTTPS URL.", note: noteValid ? null : "Add a short note describing this link." };
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

  return <div className="audit-ledger">
    <p className="setup-disclosure" id="audit-disclosure">Self-assessment, not Arc verification. Choose the level you can work at today; links are optional context.</p>
    {categories.map((category) => {
      const skills = blueprint.skills.filter((skill) => skill.category === category);
      if (skills.length === 0) return null;
      return <fieldset className="audit-category" key={category}>
        <legend>{category[0]!.toUpperCase() + category.slice(1)} skills</legend>
        <div className="category-actions" aria-label={`${category} quick set`}>
          {levels.map(({ value: level, label }) => <button key={level} onClick={() => onChange({
            ...value,
            levels: { ...value.levels, ...Object.fromEntries(skills.map(({ id }) => [id, level])) },
          })} type="button">Set {category[0]!.toUpperCase() + category.slice(1)} to {label}</button>)}
        </div>
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
          {(value.evidence[skill.id] ?? []).map((item, index) => {
            const errors = evidenceErrors(skill.id, item);
            const urlErrorId = `evidence-url-error-${skill.id}-${index}`;
            const noteErrorId = `evidence-note-error-${skill.id}-${index}`;
            return <fieldset className="evidence-row" key={item.id}>
              <legend>Evidence link {index + 1}</legend>
              <label>Type<select aria-label={`${skill.name} evidence type ${index + 1}`} onChange={(event) => updateEvidence(skill.id, index, { kind: event.target.value as EvidenceKind })} value={item.kind}>
                {(["repository", "deployment", "project", "document", "other"] as const).map((kind) => <option key={kind}>{kind}</option>)}
              </select></label>
              <label>Public link<input aria-describedby={errors.url ? urlErrorId : undefined} aria-invalid={Boolean(errors.url)} aria-label={`${skill.name} evidence URL ${index + 1}`} onChange={(event) => updateEvidence(skill.id, index, { url: event.target.value })} type="url" value={item.url} /></label>
              <label>Note<input aria-describedby={errors.note ? noteErrorId : undefined} aria-invalid={Boolean(errors.note)} aria-label={`${skill.name} evidence note ${index + 1}`} maxLength={300} onChange={(event) => updateEvidence(skill.id, index, { note: event.target.value })} value={item.note} /></label>
              <button className="text-action" onClick={() => onChange({ ...value, evidence: { ...value.evidence, [skill.id]: (value.evidence[skill.id] ?? []).filter((_, itemIndex) => itemIndex !== index) } })} type="button">Remove evidence {index + 1} for {skill.name}</button>
              {errors.url && <p id={urlErrorId} role="alert">{errors.url}</p>}
              {errors.note && <p id={noteErrorId} role="alert">{errors.note}</p>}
            </fieldset>;
          })}
          <button className="text-action" disabled={(value.evidence[skill.id]?.length ?? 0) >= 3} onClick={() => addEvidence(skill.id)} type="button">Add evidence link for {skill.name}</button>
        </div>)}
      </fieldset>;
    })}
  </div>;
}
