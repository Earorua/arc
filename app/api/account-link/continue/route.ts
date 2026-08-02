import { createProductionAccountLinkHandlers } from "../../../server/account-link/http";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return createProductionAccountLinkHandlers().continue(request);
}
