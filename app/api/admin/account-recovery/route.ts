import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db/d1";
import { createAccountRecoveryHandler } from "../../../server/account-recovery/http";
import { applyAccountRecovery, inspectAccountRecovery } from "../../../server/account-recovery/service";

export const dynamic = "force-dynamic";
export const POST = (request: Request) => createAccountRecoveryHandler({
  configuration: env.ARC_ACCOUNT_RECOVERY,
  inspect: (identity) => inspectAccountRecovery(getD1(), identity),
  apply: (identity, now) => applyAccountRecovery(getD1(), identity, now),
})(request);
