import {
  createResearchRetryHandler,
  productionResearchRouteDependencies,
} from "../../../../../server/http/research-route-factories";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return createResearchRetryHandler(productionResearchRouteDependencies, id)(request);
}
