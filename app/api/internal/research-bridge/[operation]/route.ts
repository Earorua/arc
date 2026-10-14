import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db/d1";
import { createProductionSiteBridgeHandler } from "../../../../server/research/site-bridge-factory";

export const dynamic = "force-dynamic";

export const POST = (request: Request) => createProductionSiteBridgeHandler({ environment: env, getD1 })(request);

