import { env } from "cloudflare:workers";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getDb } from "../../../db";
import {
  accounts,
  authRateLimits,
  sessions,
  users,
  verifications,
} from "../../../db/schema";
import { readAuthPolicy, type AuthEnvironment } from "./policy";

export class AuthUnavailableError extends Error {
  readonly code = "AUTH_UNAVAILABLE";

  constructor() {
    super("Arc authentication is not configured for this runtime.");
    this.name = "AuthUnavailableError";
  }
}

export function readRuntimeEnvironment(): AuthEnvironment {
  return {
    ARC_ENVIRONMENT: env.ARC_ENVIRONMENT,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
  };
}

export function buildSocialProviders(source: AuthEnvironment) {
  return {
    ...(source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: source.GOOGLE_CLIENT_ID, clientSecret: source.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(source.GITHUB_CLIENT_ID && source.GITHUB_CLIENT_SECRET
      ? { github: { clientId: source.GITHUB_CLIENT_ID, clientSecret: source.GITHUB_CLIENT_SECRET } }
      : {}),
  };
}

const authSchema = {
  users,
  sessions,
  accounts,
  verifications,
  authRateLimits,
};

export function buildAuthOptions(
  source: AuthEnvironment,
  database: ReturnType<typeof getDb>,
): BetterAuthOptions {
  const policy = readAuthPolicy(source);
  if (!policy.isReady || !source.BETTER_AUTH_SECRET) throw new AuthUnavailableError();

  return {
    baseURL: policy.origin,
    secret: source.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema: authSchema,
      usePlural: true,
    }),
    emailAndPassword: { enabled: false },
    account: {
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        trustedProviders: ["google", "github"],
        allowDifferentEmails: false,
      },
    },
    verification: { storeIdentifier: "hashed" },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      storage: "database",
      modelName: "authRateLimit",
    },
    trustedOrigins: [policy.origin],
    advanced: {
      cookiePrefix: "arc",
      useSecureCookies: source.ARC_ENVIRONMENT === "production",
    },
    socialProviders: buildSocialProviders(source),
  };
}

let authRuntime: ReturnType<typeof betterAuth> | undefined;

export function getAuth(): ReturnType<typeof betterAuth> {
  authRuntime ??= betterAuth(buildAuthOptions(readRuntimeEnvironment(), getDb()));
  return authRuntime;
}
