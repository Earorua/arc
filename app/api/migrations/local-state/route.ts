import {
  createMigrationHandler,
  productionCloudRouteDependencies,
} from "../../../server/http/cloud-route-factories";

export const dynamic = "force-dynamic";

export const POST = createMigrationHandler(productionCloudRouteDependencies);
