import type { PlanPhase } from "../../domain/learning";

export function PhaseRail({ phases }: { phases: ReadonlyArray<PlanPhase> }) {
  return (
    <ol aria-label="Learning phases" className="phase-rail" lang="en">
      {phases.map((phase, index) => (
        <li aria-current={index === 0 ? "step" : undefined} className={index === 0 ? "is-current" : ""} key={phase.id}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div><strong>{phase.name}</strong><p>{phase.outcome}</p><small>{phase.weeks} weeks</small></div>
        </li>
      ))}
    </ol>
  );
}
