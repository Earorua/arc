import { createProofWorkspaceHandler, productionProofRouteDependencies } from "../../../server/http/proof-route-factories";

export const dynamic = "force-dynamic";
export const GET = createProofWorkspaceHandler(productionProofRouteDependencies);
