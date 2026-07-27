import { describe, expect, it } from "vitest";
import { createAuthProvidersHandler } from "../../app/api/auth/providers/route";

describe("GET /api/auth/providers", () => {
  it("returns only fully configured public provider names", async () => {
    const GET = createAuthProvidersHandler(() => ({
      BETTER_AUTH_URL: "https://arc.example.com",
      BETTER_AUTH_SECRET: "s".repeat(32),
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GITHUB_CLIENT_ID: "incomplete-github",
    }));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ providers: ["google"] });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns an empty list rather than failing when credentials are absent", async () => {
    const GET = createAuthProvidersHandler(() => ({
      BETTER_AUTH_URL: "https://arc.example.com",
    }));

    const response = await GET();

    expect(await response.json()).toEqual({ providers: [] });
  });
});
