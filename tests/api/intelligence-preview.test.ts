import { describe, expect, it, vi } from "vitest";
import { UnauthenticatedError } from "../../app/server/auth/session";
import {
  createIntelligencePreviewHandler,
  type IntelligencePreviewDependencies,
} from "../../app/api/intelligence/preview/route";
import { expectApiError, jsonRequest, requestId } from "./cloud-route-test-helpers";

function setup() {
  const requireUser = vi.fn().mockResolvedValue({
    id: "user-owner",
    name: "Arc Learner",
    email: "learner@example.com",
  });
  const reserve = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  const research = vi.fn().mockResolvedValue({
    accepted: true,
    preview: {
      role: "AI Product Engineer",
      mode: "deterministic-preview",
      dimensions: ["Product judgment", "Typed systems"],
      notice: "Deterministic foundation preview; no paid model was called.",
    },
  });
  const deps = {
    requireUser,
    rateLimiter: { reserve },
    createGateway: () => ({ research }),
    createRequestId: () => requestId,
  } as unknown as IntelligencePreviewDependencies;
  return { deps, requireUser, reserve, research };
}

describe("POST /api/intelligence/preview", () => {
  it("requires an independent Arc session", async () => {
    const harness = setup();
    harness.requireUser.mockRejectedValue(new UnauthenticatedError());
    const POST = createIntelligencePreviewHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/intelligence/preview", "POST", {
      role: "AI Product Engineer",
    }));

    await expectApiError(response, 401, "UNAUTHENTICATED");
    expect(harness.reserve).not.toHaveBeenCalled();
  });

  it("rejects malformed role input", async () => {
    const harness = setup();
    const POST = createIntelligencePreviewHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/intelligence/preview", "POST", {
      role: "x",
      userId: "attacker-selected-owner",
    }));

    await expectApiError(response, 400, "INVALID_INPUT");
    expect(harness.research).not.toHaveBeenCalled();
  });

  it("reserves the shared endpoint rate limit before gateway entitlements", async () => {
    const harness = setup();
    harness.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 29 });
    const POST = createIntelligencePreviewHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/intelligence/preview", "POST", {
      role: "AI Product Engineer",
    }));

    await expectApiError(response, 429, "RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBe("29");
    expect(harness.research).not.toHaveBeenCalled();
  });

  it("returns deterministic structured output without a paid provider call", async () => {
    const harness = setup();
    const POST = createIntelligencePreviewHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/intelligence/preview", "POST", {
      role: "AI Product Engineer",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preview: { mode: "deterministic-preview", role: "AI Product Engineer" },
    });
    expect(harness.research).toHaveBeenCalledWith("user-owner", {
      requestId,
      role: "AI Product Engineer",
      locale: "zh-CN",
    });
    expect(harness.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      harness.research.mock.invocationCallOrder[0],
    );
  });

  it("maps exhausted global budget to a stable denial", async () => {
    const harness = setup();
    harness.research.mockResolvedValue({ accepted: false, reason: "budget" });
    const POST = createIntelligencePreviewHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/intelligence/preview", "POST", {
      role: "AI Product Engineer",
    }));

    await expectApiError(response, 429, "RATE_LIMITED");
  });
});
