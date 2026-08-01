import { describe, expect, it } from "vitest";
import {
  AuthUnavailableError,
  buildAuthOptions,
  buildSocialProviders,
} from "../../app/server/auth/runtime";
import {
  UnauthenticatedError,
  getArcUser,
  requireArcUser,
} from "../../app/server/auth/session";
import type { AuthEnvironment } from "../../app/server/auth/policy";

const productionEnvironment: AuthEnvironment = {
  ARC_ENVIRONMENT: "production",
  BETTER_AUTH_URL: "https://arc.example.com",
  BETTER_AUTH_SECRET: "s".repeat(32),
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GITHUB_CLIENT_ID: "github-id",
  GITHUB_CLIENT_SECRET: "github-secret",
};

describe("Arc auth runtime", () => {
  it("builds an independent social-only production policy", () => {
    const options = buildAuthOptions(productionEnvironment, {} as never);

    expect(options.emailAndPassword).toEqual({ enabled: false });
    expect(Object.keys(options.socialProviders ?? {})).toEqual(["google", "github"]);
    expect(options.account).toMatchObject({
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        trustedProviders: ["google", "github"],
        allowDifferentEmails: true,
        updateUserInfoOnLink: false,
      },
    });
    expect(options.hooks?.before).toBeTypeOf("function");
    expect(options.hooks?.after).toBeTypeOf("function");
    expect(options.databaseHooks?.account?.create?.before).toBeTypeOf("function");
    expect(options.trustedOrigins).toEqual(["https://arc.example.com"]);
    expect(options.advanced).toMatchObject({ cookiePrefix: "arc", useSecureCookies: true });
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      storage: "database",
      modelName: "authRateLimit",
      window: 60,
      max: 30,
    });
  });

  it("includes only providers with complete credentials", () => {
    expect(buildSocialProviders({
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GITHUB_CLIENT_ID: "github-id",
    })).toEqual({
      google: { clientId: "google-id", clientSecret: "google-secret" },
    });
  });

  it("fails closed when the runtime is not ready", () => {
    expect(() => buildAuthOptions({ BETTER_AUTH_URL: "https://arc.example.com" }, {} as never))
      .toThrow(AuthUnavailableError);
  });

  it("constructs options without reading the D1 binding for ordinary requests", async () => {
    const options = buildAuthOptions(productionEnvironment, {} as never);

    await expect(options.hooks?.before?.({
      path: "/get-session",
      context: {},
    } as never)).resolves.toBeUndefined();
  });

  it("returns only the Arc user identity fields from a server session", async () => {
    const user = await getArcUser(new Headers(), async () => ({
      user: { id: "user-1", name: "Arc Learner", email: "learner@example.com", image: "ignored" },
      session: { token: "ignored" },
    }));

    expect(user).toEqual({ id: "user-1", name: "Arc Learner", email: "learner@example.com" });
  });

  it("rejects an absent server session with a stable error", async () => {
    await expect(requireArcUser(new Headers(), async () => null))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED" } satisfies Partial<UnauthenticatedError>);
  });
});
