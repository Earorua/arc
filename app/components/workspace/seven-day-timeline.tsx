import type { RoleBlueprint } from "../../contracts/intelligence";
import type { UnitRegistry } from "../../contracts/planning";
import { parsePlanningWorkspaceAtRepositoryBoundary } from "../../contracts/planning";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { PlanningVersionBoundary } from "./planning-version-boundary";

export function SevenDayTimeline({ workspace: value, blueprint = flagshipBlueprint, registry = flagshipUnitRegistry }: { workspace: unknown; blueprint?: RoleBlueprint; registry?: UnitRegistry }) {
  const resolved = resolveTimeline(value, blueprint, registry);
  if (!resolved) return <PlanningVersionBoundary />;
  const { plan, units, templates, exceptions } = resolved;
  return <section className="seven-day-plan" aria-labelledby="seven-day-title">
    <div className="seven-day-heading"><p className="section-index">Seven-day plan</p><h2 id="seven-day-title">One continuous week.</h2></div>
    <ol aria-label="Seven consecutive learning days" className="seven-day-timeline">
      {plan.days.map((day) => {
        const primary = day.primaryUnitId ? units.get(day.primaryUnitId) : undefined;
        const stretch = day.stretchUnitId ? units.get(day.stretchUnitId) : undefined;
        const exception = exceptions.get(day.date);
        return <li key={day.date}>
          <time dateTime={day.date}>{day.date}</time>
          <div><strong>{day.status === "rest" ? "Rest" : primary ? templates.get(primary.templateId)?.title ?? primary.objective : "Open"}</strong>
            <p>{day.budgetMinutes} minutes{exception && <><span> · </span><span>{exception.reason ? `Exception: ${exception.reason}` : "Exception · No reason provided"}</span></>}</p>
            {stretch && <small>Optional stretch · {templates.get(stretch.templateId)?.title ?? stretch.objective}</small>}
          </div>
        </li>;
      })}
    </ol>
  </section>;
}

function resolveTimeline(value: unknown, blueprint: RoleBlueprint, registry: UnitRegistry) {
  try {
    const workspace = parsePlanningWorkspaceAtRepositoryBoundary(value);
    const plan = workspace.planVersions.find(({ id }) => id === workspace.activePlanVersionId);
    const path = workspace.pathVersions.find(({ id }) => id === workspace.activePathVersionId);
    if (!plan || !path || plan.pathVersionId !== path.id
      || path.blueprintId !== blueprint.id || path.blueprintVersion !== blueprint.version
      || path.registryId !== registry.id || path.registryVersion !== registry.version
      || registry.blueprintId !== blueprint.id || registry.blueprintVersion !== blueprint.version
      || !areConsecutive(plan.days.map(({ date }) => date))) throw new Error("Invalid plan lineage");
    const units = new Map(workspace.dailyUnits.filter(({ planVersionId }) => planVersionId === plan.id).map((unit) => [unit.id, unit]));
    const templates = new Map(registry.tracks.flatMap((track) => track.templates).map((template) => [template.id, template]));
    const exceptions = new Map(workspace.availability.exceptions.map((exception) => [exception.date, exception]));
    return { plan, units, templates, exceptions };
  } catch { return null; }
}

function areConsecutive(dates: string[]): boolean {
  if (dates.length !== 7) return false;
  return dates.every((date, index) => index === 0 || dayNumber(date) - dayNumber(dates[index - 1]!) === 1);
}
function dayNumber(date: string): number { return Date.parse(`${date}T00:00:00Z`) / 86_400_000; }
