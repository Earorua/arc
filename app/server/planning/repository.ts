import type { MaterialPlanCommit } from "./material-commit";
import type { MaterialDetachment } from "../documents/detach-adopted-material";
import type { PlanningMutationResult, PlanningSourceContext, PlanningSourceReference } from "../../contracts/planning";

export type PlanningOwnerGoal = Readonly<{
  ownerId: string;
  goalId: string;
}>;

export type PlanningRepositoryPayload = PlanningOwnerGoal & Readonly<{
  payload: unknown;
  sourceReference?: PlanningSourceReference;
  // Ephemeral same-call reuse only. Persist only sourceReference.
  sourceContext?: PlanningSourceContext;
}>;

export type PlanningMutationLookup = PlanningOwnerGoal & Readonly<{
  mutationId: string;
  materialRequestDigest?: string;
  expectNoMaterials?: boolean;
}>;

export type SavePlanningGenerationCommand = PlanningMutationLookup & Readonly<{
  result: PlanningMutationResult;
  sourceReference: PlanningSourceReference;
  materialCommit?: MaterialPlanCommit;
  newGoal?: Readonly<{ previousGoalId: string; roleId: string }>;
}>;

export type SavePlanningEventCommand = SavePlanningGenerationCommand & Readonly<{
  materialDetachment?: MaterialDetachment;
  baseRevision: number;
  baseVersionId: string;
  previous: unknown;
}>;

export interface PlanningRepository {
  findActiveGoal(ownerId: string): Promise<PlanningOwnerGoal | null>;
  load(scope: PlanningOwnerGoal): Promise<PlanningRepositoryPayload | null>;
  findMutation(input: PlanningMutationLookup): Promise<PlanningRepositoryPayload | null>;
  saveGeneration(command: SavePlanningGenerationCommand): Promise<PlanningRepositoryPayload>;
  saveEvent(command: SavePlanningEventCommand): Promise<PlanningRepositoryPayload>;
}
