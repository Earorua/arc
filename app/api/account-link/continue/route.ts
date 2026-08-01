import {
  createAccountLinkHandlers,
  createProductionAccountLinkDependencies,
} from "../../../server/account-link/http";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return createAccountLinkHandlers(createProductionAccountLinkDependencies()).continue(request);
}
