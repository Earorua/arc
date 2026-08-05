import { beforeEach, describe, expect, it, vi } from "vitest";

const { authPost, toNextJsHandler, getAuth } = vi.hoisted(() => {
  const authPost = vi.fn();
  return {
    authPost,
    toNextJsHandler: vi.fn(() => ({ GET: vi.fn(), POST: authPost })),
    getAuth: vi.fn(() => ({ api: {} })),
  };
});

vi.mock("better-auth/next-js", () => ({ toNextJsHandler }));
vi.mock("../../app/server/auth/runtime", () => ({ getAuth }));

import {
  isDirectAccountLinkRequest,
  POST,
} from "../../app/api/auth/[...all]/route";

describe("Better Auth direct account-link bypass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches only the exact normalized public link-social pathname", () => {
    expect(isDirectAccountLinkRequest(new Request("https://arc.example/api/auth/link-social"))).toBe(true);
    expect(isDirectAccountLinkRequest(new Request("https://arc.example/api/auth/link-social?provider=google"))).toBe(true);
    expect(isDirectAccountLinkRequest(new Request("https://arc.example/api/auth/ignored/../link-social"))).toBe(true);
    expect(isDirectAccountLinkRequest(new Request("https://arc.example/api/auth/link-social/"))).toBe(false);
    expect(isDirectAccountLinkRequest(new Request("https://arc.example/api/auth/%6cink-social"))).toBe(false);
    expect(isDirectAccountLinkRequest(new Request("https://arc.example/api/auth/link-social-else"))).toBe(false);
  });

  it("returns 403 without constructing or calling the Better Auth handler", async () => {
    const response = await POST(new Request("https://arc.example/api/auth/link-social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", proof: "browser-forgery" }),
    }));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("Forbidden");
    expect(getAuth).not.toHaveBeenCalled();
    expect(toNextJsHandler).not.toHaveBeenCalled();
    expect(authPost).not.toHaveBeenCalled();
  });

  it("forwards unrelated POST paths through the existing Better Auth handler", async () => {
    const forwarded = new Response("forwarded", { status: 202 });
    authPost.mockResolvedValue(forwarded);
    const request = new Request("https://arc.example/api/auth/sign-in/social", { method: "POST" });

    await expect(POST(request)).resolves.toBe(forwarded);
    expect(getAuth).toHaveBeenCalledOnce();
    expect(toNextJsHandler).toHaveBeenCalledOnce();
    expect(authPost).toHaveBeenCalledWith(request);
  });
});
