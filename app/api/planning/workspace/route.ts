import { createPlanningWorkspaceHandler, productionPlanningRouteDependencies } from "../../../server/http/planning-route-factories";

export const dynamic = "force-dynamic";
export const GET = createPlanningWorkspaceHandler(productionPlanningRouteDependencies);
