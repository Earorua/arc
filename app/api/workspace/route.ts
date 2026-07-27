import {
  createWorkspaceHandlers,
  productionCloudRouteDependencies,
} from "../../server/http/cloud-route-factories";

export const dynamic = "force-dynamic";

const handlers = createWorkspaceHandlers(productionCloudRouteDependencies);

export const GET = handlers.GET;
export const PUT = handlers.PUT;
