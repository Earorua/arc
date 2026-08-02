import { createProductionAccountLinkHandlers } from "../../../server/account-link/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return createProductionAccountLinkHandlers().status(request);
}
