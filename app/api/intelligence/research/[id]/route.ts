import {
  createResearchGetHandler,
  productionResearchRouteDependencies,
} from "../../../../server/http/research-route-factories";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return createResearchGetHandler(productionResearchRouteDependencies, id)(request);
}
