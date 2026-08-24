import { createProofCreateHandler, productionProofRouteDependencies } from "../../server/http/proof-route-factories";

export const dynamic = "force-dynamic";
export const POST = createProofCreateHandler(productionProofRouteDependencies);
