import { z } from "zod";

export const authProviderSchema = z.enum(["google", "github"]);
export type AuthProvider = z.infer<typeof authProviderSchema>;

export type AuthEnvironment = Partial<Record<
  | "ARC_ENVIRONMENT"
  | "BETTER_AUTH_URL"
  | "BETTER_AUTH_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "GITHUB_CLIENT_ID"
  | "GITHUB_CLIENT_SECRET",
  string
>>;

export function readAuthPolicy(source: AuthEnvironment) {
  const origin = source.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "";

  if (source.ARC_ENVIRONMENT === "production" && !origin.startsWith("https://")) {
    throw new Error("Arc production authentication requires an HTTPS origin.");
  }

  const enabledProviders: AuthProvider[] = [];
  if (source.GOOGLE_CLIENT_ID && source.GOOGLE_CLIENT_SECRET) enabledProviders.push("google");
  if (source.GITHUB_CLIENT_ID && source.GITHUB_CLIENT_SECRET) enabledProviders.push("github");

  return {
    origin,
    enabledProviders,
    callbackUrls: {
      google: `${origin}/api/auth/callback/google`,
      github: `${origin}/api/auth/callback/github`,
    },
    isReady: Boolean(origin && (source.BETTER_AUTH_SECRET?.length ?? 0) >= 32 && enabledProviders.length > 0),
  };
}
