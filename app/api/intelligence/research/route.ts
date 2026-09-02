import {
  createResearchStartHandler,
  productionResearchRouteDependencies,
} from "../../../server/http/research-route-factories";

export const dynamic = "force-dynamic";
export const POST = createResearchStartHandler(productionResearchRouteDependencies);
