import { env } from "cloudflare:workers";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { getD1 } from "../../../db/d1";
import {
  accounts,
  authRateLimits,
  sessions,
  users,
  verifications,
} from "../../../db/schema";
import { readAuthPolicy, type AuthEnvironment } from "./policy";
import { createAccountLinkAuthHooks } from "../account-link/auth-hooks";
import { D1AccountLinkRepository } from "../account-link/d1-repository";
import {
  accountLinkProviderSchema,
  type AccountLinkProvider,
} from "../account-link/contracts";

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
  const accountLinkHooks = createAccountLinkAuthHooks({
    secret: source.BETTER_AUTH_SECRET,
    getRepository: () => new D1AccountLinkRepository(getD1()),
    listAccountsForUser: async (userId) => {
      const rows = await database
        .select({ providerId: accounts.providerId })
        .from(accounts)
        .where(eq(accounts.userId, userId));
      const providers: AccountLinkProvider[] = [];
      for (const row of rows) {
        const provider = accountLinkProviderSchema.safeParse(row.providerId);
        if (provider.success && !providers.includes(provider.data)) {
          providers.push(provider.data);
        }
      }
      return providers;
    },
  });

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
        allowDifferentEmails: true,
        updateUserInfoOnLink: false,
      },
    },
    hooks: accountLinkHooks.hooks,
    databaseHooks: accountLinkHooks.databaseHooks,
    verification: { storeIdentifier: "hashed" },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 30,
      storage: "database",
      modelName: "authRateLimit",
    },
    logger: {
      level: "warn",
      log: (level) => {
        // Better Auth can pass raw OAuth exceptions here. Never forward their
        // messages or attached objects into the public runtime log stream.
        const marker = `[Arc Auth] ${level.toUpperCase()}`;
        if (level === "error") {
          console.error(marker);
        } else if (level === "warn") {
          console.warn(marker);
        } else {
          console.log(marker);
        }
      },
    },
    trustedOrigins: [policy.origin],
    advanced: {
      cookiePrefix: "arc",
      useSecureCookies: source.ARC_ENVIRONMENT === "production",
      ipAddress: {
        // Sites runs at Cloudflare's edge, which owns this header. Do not add a
        // client-controlled forwarded-header fallback without a trusted chain.
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    socialProviders: buildSocialProviders(source),
  };
}

let authRuntime: ReturnType<typeof betterAuth> | undefined;

export function getAuth(): ReturnType<typeof betterAuth> {
  authRuntime ??= betterAuth(buildAuthOptions(readRuntimeEnvironment(), getDb()));
  return authRuntime;
}
