"use client";

import type { RoleBlueprint } from "../../contracts/intelligence";
import type { PathBuildResult, PlanningTarget } from "../../contracts/planning";

function skillNames(ids: string[], blueprint: RoleBlueprint): string {
  const byId = new Map(blueprint.skills.map((skill) => [skill.id, skill.name]));
  return ids.map((id) => byId.get(id) ?? id).join(", ");
}

export function TargetStep({ blueprint, target, selectedScope, onTargetChange, onScopeChange, result: paths, error }: {
  blueprint: RoleBlueprint;
  target: PlanningTarget; selectedScope: "full-scope" | "target-date" | null;
  onTargetChange: (weeks: number) => void; onScopeChange: (scope: "full-scope" | "target-date") => void;
  result: PathBuildResult | null; error?: string;
}) {
  const targetValid = Number.isInteger(target.targetWeeks) && target.targetWeeks >= 4 && target.targetWeeks <= 52;
  const equivalent = paths?.targetDate !== null && paths?.targetDate?.deferredSkills.length === 0
    && paths.targetDate.estimatedCompletionDate === paths.fullScope.estimatedCompletionDate;
  return <div className="target-ledger">
    <label className="ledger-field">Target weeks<input aria-describedby={!targetValid ? "target-weeks-error" : undefined} aria-invalid={!targetValid} aria-label="Target weeks" min="4" max="52" step="1" type="number" value={Number.isNaN(target.targetWeeks) ? "" : target.targetWeeks} onChange={(event) => onTargetChange(event.target.value === "" ? Number.NaN : Number(event.target.value))} /></label>
    {!targetValid && <p id="target-weeks-error" role="alert">Enter a whole number from 4 to 52.</p>}
    {error && <p role="alert">{error}</p>}
    {paths && equivalent && <div className="scope-summary"><strong>You have time to cover every skill.</strong><span>Expected completion: {paths.fullScope.estimatedCompletionDate}. No skills need to be deferred.</span></div>}
    {paths && !equivalent && <fieldset className="scope-choices">
      <legend>Choose your learning scope</legend>
      <label><input checked={selectedScope === "full-scope"} name="scope" onChange={() => onScopeChange("full-scope")} type="radio" /><span><strong>Full scope</strong> · Expected completion: {paths.fullScope.estimatedCompletionDate}<small>Deferred skills: none.</small></span></label>
      <label><input checked={selectedScope === "target-date"} disabled={!paths.targetDate} name="scope" onChange={() => onScopeChange("target-date")} type="radio" /><span><strong>By target date</strong>{paths.targetDate ? ` · Expected completion: ${paths.targetDate.estimatedCompletionDate}` : " · Unavailable"}<small>{paths.targetDate ? `Deferred skills: ${skillNames(paths.targetDate.deferredSkills.map(({ skillId }) => skillId), blueprint) || "none"}.` : paths.infeasibleReason}</small></span></label>
    </fieldset>}
  </div>;
}
