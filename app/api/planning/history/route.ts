import { createPlanningHistoryHandler, productionPlanningHistoryDependencies } from "../../../server/http/planning-history-route";

export const dynamic = "force-dynamic";
export const GET = createPlanningHistoryHandler(productionPlanningHistoryDependencies);
