import { createPlanningGenerateHandler, productionPlanningRouteDependencies } from "../../../server/http/planning-route-factories";

export const dynamic = "force-dynamic";
export const POST = createPlanningGenerateHandler(productionPlanningRouteDependencies);
