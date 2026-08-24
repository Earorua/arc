import type { PlanningWorkspace } from "../../contracts/planning";
import type {
  ProofReviewEvent,
  ProofVersion,
  SkillEvidenceProjection,
  SkillEvidenceStatus,
} from "../../contracts/proof-ledger";

export type CompletedSkillEvidence = Readonly<{
  unitId: string;
  skillId: string;
  occurredAt: string;
}>;

export type ProjectSkillEvidenceInput = Readonly<{
  skillIds: readonly string[];
  completedSkillIds: ReadonlySet<string>;
  completedUnits?: readonly CompletedSkillEvidence[];
  versions: readonly ProofVersion[];
  reviews: readonly ProofReviewEvent[];
  visibility: "internal" | "public";
}>;

type ActiveContribution = Readonly<{
  version: ProofVersion;
  review: ProofReviewEvent;
  status: Extract<SkillEvidenceStatus, "demonstrated" | "verified">;
}>;

const statusRank: Record<SkillEvidenceStatus, number> = {
  exploring: 0,
  practicing: 1,
  demonstrated: 2,
  verified: 3,
};

export function completedSkillIdsFromPlanning(workspace: PlanningWorkspace): Set<string> {
  return new Set(completedSkillEvidenceFromPlanning(workspace).map(({ skillId }) => skillId));
}

export function completedSkillEvidenceFromPlanning(
  workspace: PlanningWorkspace,
): CompletedSkillEvidence[] {
  const units = new Map(
    workspace.dailyUnits.map((unit) => [`${unit.planVersionId}:${unit.id}`, unit]),
  );
  const completed = new Map<string, CompletedSkillEvidence>();
  for (const event of workspace.events) {
    if (event.kind !== "completed") continue;
    const unit = units.get(`${event.targetPlanVersionId}:${event.unitId}`);
    if (!unit) continue;
    const current = completed.get(unit.id);
    if (!current || instant(event.occurredAt) > instant(current.occurredAt)) {
      completed.set(unit.id, {
        unitId: unit.id,
        skillId: unit.skillId,
        occurredAt: event.occurredAt,
      });
    }
  }
  return [...completed.values()].sort((left, right) => left.unitId.localeCompare(right.unitId));
}

export function projectSkillEvidence(input: ProjectSkillEvidenceInput): SkillEvidenceProjection[] {
  const activeVersions = latestVersionsByProof(input.versions);
  const terminalReviews = terminalReviewsByVersion(input.reviews);
  const contributions = activeVersions.flatMap((version): ActiveContribution[] => {
    const review = terminalReviews.get(version.id);
    if (!review || (review.stateAfter !== "demonstrated" && review.stateAfter !== "verified")) {
      return [];
    }
    if (input.visibility === "public" && review.visibilityAfter !== "public") return [];
    return [{ version, review, status: review.stateAfter }];
  });
  const completedUnits = input.visibility === "internal" ? input.completedUnits ?? [] : [];

  return input.skillIds.map((skillId) => {
    const skillUnits = completedUnits.filter((unit) => unit.skillId === skillId);
    const candidates = contributions
      .filter(({ version }) => version.skillIds.includes(skillId))
      .sort(compareContributions);
    const strongest = candidates[0] ?? null;
    const practicing = input.visibility === "internal"
      && (input.completedSkillIds.has(skillId) || skillUnits.length > 0);
    const status = strongest?.status ?? (practicing ? "practicing" : "exploring");
    const latestUsedAt = latestTimestamp([
      ...skillUnits.map(({ occurredAt }) => occurredAt),
      ...candidates.map(({ review }) => review.occurredAt),
    ]);

    return {
      skillId,
      audience: input.visibility,
      status,
      completedUnitIds: [...new Set(skillUnits.map(({ unitId }) => unitId))].sort(),
      strongestProofId: strongest?.version.proofId ?? null,
      strongestVersionId: strongest?.version.id ?? null,
      latestUsedAt,
    };
  });
}

function latestVersionsByProof(versions: readonly ProofVersion[]): ProofVersion[] {
  const latest = new Map<string, ProofVersion>();
  for (const version of versions) {
    const current = latest.get(version.proofId);
    if (!current
      || version.versionNumber > current.versionNumber
      || (version.versionNumber === current.versionNumber && version.id.localeCompare(current.id) > 0)) {
      latest.set(version.proofId, version);
    }
  }
  return [...latest.values()].sort((left, right) => left.proofId.localeCompare(right.proofId));
}

function terminalReviewsByVersion(
  reviews: readonly ProofReviewEvent[],
): Map<string, ProofReviewEvent> {
  const terminal = new Map<string, ProofReviewEvent>();
  for (const review of [...reviews].sort(compareReviews)) terminal.set(review.versionId, review);
  return terminal;
}

function compareReviews(left: ProofReviewEvent, right: ProofReviewEvent): number {
  return left.sequence - right.sequence
    || instant(left.occurredAt) - instant(right.occurredAt)
    || left.id.localeCompare(right.id);
}

function compareContributions(left: ActiveContribution, right: ActiveContribution): number {
  return statusRank[right.status] - statusRank[left.status]
    || instant(right.review.occurredAt) - instant(left.review.occurredAt)
    || left.version.proofId.localeCompare(right.version.proofId)
    || left.version.id.localeCompare(right.version.id);
}

function latestTimestamp(values: readonly string[]): string | null {
  return values.reduce<string | null>((latest, value) => (
    latest === null || instant(value) > instant(latest) ? value : latest
  ), null);
}

function instant(value: string): number {
  return Date.parse(value);
}
