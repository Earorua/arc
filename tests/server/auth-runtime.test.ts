import { describe, expect, it, vi } from "vitest";
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
    expect(options.databaseHooks?.account?.create?.after).toBeTypeOf("function");
    expect(options.trustedOrigins).toEqual(["https://arc.example.com"]);
    expect(options.advanced).toMatchObject({
      cookiePrefix: "arc",
      useSecureCookies: true,
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    });
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      storage: "database",
      modelName: "authRateLimit",
      window: 60,
      max: 30,
    });
  });

  it("redacts Better Auth warning and error details before writing runtime logs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const options = buildAuthOptions(productionEnvironment, {} as never);
    const log = options.logger?.log;

    expect(log).toBeTypeOf("function");
    log?.("warn", "OAuth warning for learner@example.com", { accessToken: "warn-token" });
    log?.("error", "Token exchange failed", new Error("error-token"));

    expect(warn).toHaveBeenCalledWith("[Arc Auth] WARN");
    expect(error).toHaveBeenCalledWith("[Arc Auth] ERROR");
    expect(JSON.stringify([...warn.mock.calls, ...error.mock.calls])).not.toMatch(
      /learner@example\.com|warn-token|error-token/,
    );

    warn.mockRestore();
    error.mockRestore();
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
    const select = vi.fn(() => {
      throw new Error("account lookup must remain lazy");
    });
    const options = buildAuthOptions(productionEnvironment, { select } as never);

    expect(select).not.toHaveBeenCalled();

    await expect(options.hooks?.before?.({
      path: "/get-session",
      context: {},
    } as never)).resolves.toBeUndefined();
    await expect(options.hooks?.after?.({
      path: "/get-session",
      context: {},
    } as never)).resolves.toBeUndefined();
    expect(select).not.toHaveBeenCalled();
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
