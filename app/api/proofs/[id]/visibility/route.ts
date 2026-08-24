import { createProofVisibilityHandler, productionProofRouteDependencies } from "../../../../server/http/proof-route-factories";

type RouteContext = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export const POST = async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  return createProofVisibilityHandler(productionProofRouteDependencies, id)(request);
};
