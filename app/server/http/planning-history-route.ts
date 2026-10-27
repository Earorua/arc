import { historyIdSchema, historyOffsetSchema, planningHistorySchema } from "../../contracts/planning-history";
import { planningWorkspaceResponseSchema } from "../../contracts/planning-api";
import { getD1 } from "../../../db/d1";
import { D1PlanningHistoryReader } from "../planning/history-reader";
import { PlanningInvalidInputError, PlanningUnavailableError } from "../planning/service";
import { createProductionPlanningService, productionPlanningRouteDependencies, runPlanningRoute, type PlanningRouteDependencies } from "./planning-route-factories";

type HistoryDependencies = Omit<PlanningRouteDependencies, "createService"> & {
  createService(): Pick<D1PlanningHistoryReader, "list" | "load">;
};

export function createPlanningHistoryHandler(deps: HistoryDependencies) {
  return (request: Request) => runPlanningRoute(request, deps,
    { route: "/api/planning/history", scope: "planning:read", limit: 120, windowSeconds: 60 }, async (service, ownerId) => {
      const query = new URL(request.url).searchParams;
      if ([...query.keys()].some(key => key !== "goal" && key !== "offset")
        || query.getAll("goal").length > 1 || query.getAll("offset").length > 1
        || query.has("goal") && query.has("offset")) throw new PlanningInvalidInputError();
      if (query.has("goal")) {
        const goal = historyIdSchema.safeParse(query.get("goal"));
        if (!goal.success) throw new PlanningInvalidInputError();
        const result = planningWorkspaceResponseSchema.safeParse(await service.load(ownerId, goal.data));
        if (!result.success) throw new PlanningUnavailableError();
        return { body: result.data };
      }
      const rawOffset = query.get("offset") ?? "0";
      if (!/^(0|[1-9][0-9]*)$/.test(rawOffset)) throw new PlanningInvalidInputError();
      const offset = historyOffsetSchema.safeParse(Number(rawOffset));
      if (!offset.success) throw new PlanningInvalidInputError();
      const result = planningHistorySchema.safeParse(await service.list(ownerId, offset.data));
      if (!result.success) throw new PlanningUnavailableError();
      return { body: result.data };
    });
}

export const productionPlanningHistoryDependencies: HistoryDependencies = {
  ...productionPlanningRouteDependencies,
  createService: () => new D1PlanningHistoryReader(getD1(), createProductionPlanningService()),
};
