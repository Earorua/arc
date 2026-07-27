import {
  createLearningEventHandler,
  productionCloudRouteDependencies,
} from "../../../server/http/cloud-route-factories";

export const dynamic = "force-dynamic";

export const POST = createLearningEventHandler(productionCloudRouteDependencies);
