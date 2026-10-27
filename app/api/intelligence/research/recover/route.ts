import { createResearchRecoverHandler, productionResearchRouteDependencies } from "../../../../server/http/research-route-factories";

export const dynamic = "force-dynamic";

export const POST = createResearchRecoverHandler(productionResearchRouteDependencies);
