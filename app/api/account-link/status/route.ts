import {
  createAccountLinkHandlers,
  createProductionAccountLinkDependencies,
} from "../../../server/account-link/http";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return createAccountLinkHandlers(createProductionAccountLinkDependencies()).status(request);
}
