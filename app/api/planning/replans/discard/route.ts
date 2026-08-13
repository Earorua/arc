import { createPlanningReplanHandler, productionPlanningRouteDependencies } from "../../../../server/http/planning-route-factories";

export const dynamic = "force-dynamic";
export const POST = createPlanningReplanHandler(productionPlanningRouteDependencies, "discard");
