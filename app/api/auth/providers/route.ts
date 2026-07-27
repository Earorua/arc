import type { AuthEnvironment } from "../../../server/auth/policy";
import { readAuthPolicy } from "../../../server/auth/policy";
import { readRuntimeEnvironment } from "../../../server/auth/runtime";

export function createAuthProvidersHandler(
  readEnvironment: () => AuthEnvironment = readRuntimeEnvironment,
) {
  return async function GET() {
    const policy = readAuthPolicy(readEnvironment());
    return Response.json(
      { providers: policy.enabledProviders },
      { headers: { "Cache-Control": "no-store" } },
    );
  };
}

export const GET = createAuthProvidersHandler();
