import { createPlanningEventHandler, productionPlanningRouteDependencies } from "../../../server/http/planning-route-factories";

export const dynamic = "force-dynamic";
export const POST = createPlanningEventHandler(productionPlanningRouteDependencies);
