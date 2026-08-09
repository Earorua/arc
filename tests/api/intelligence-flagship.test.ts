import { describe, expect, it, vi } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import {
  GET as productionGET,
  createFlagshipIntelligenceHandler,
} from "../../app/api/intelligence/flagship/route";
import { expectApiError, requestId } from "./cloud-route-test-helpers";

describe("GET /api/intelligence/flagship", () => {
  it("is guest-safe and returns the canonical version", async () => {
    const getBlueprint = vi.fn().mockResolvedValue(flagshipBlueprint);
    const GET = createFlagshipIntelligenceHandler({
      getBlueprint,
      createRequestId: () => requestId,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeNull();
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(getBlueprint).toHaveBeenCalledWith();
    await expect(response.json()).resolves.toEqual({
      blueprint: flagshipBlueprint,
    });
  });

  it("wires the production GET to the canonical validated flagship", async () => {
    const response = await productionGET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
    expect(response.headers.get("x-request-id")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    await expect(response.json()).resolves.toEqual({
      blueprint: flagshipBlueprint,
    });
  });

  it("returns NOT_FOUND without exposing internals", async () => {
    const GET = createFlagshipIntelligenceHandler({
      getBlueprint: vi.fn().mockResolvedValue(null),
      createRequestId: () => requestId,
    });

    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    await expectApiError(response, 404, "NOT_FOUND");
  });

  it("maps integrity failures to a stable unavailable response", async () => {
    const privateDetail = "private graph detail https://internal.invalid/source";
    const GET = createFlagshipIntelligenceHandler({
      getBlueprint: vi.fn().mockRejectedValue(new Error(privateDetail)),
      createRequestId: () => requestId,
    });

    const response = await GET();
    const responseCopy = response.clone();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    await expectApiError(response, 503, "UNAVAILABLE");
    const responseText = await responseCopy.text();
    expect(responseText).not.toContain(privateDetail);
    expect(responseText).not.toContain("Error:");
  });

  it("returns a controlled unavailable response when request ID creation fails", async () => {
    const privateDetail = "private request ID failure";
    const getBlueprint = vi.fn().mockResolvedValue(flagshipBlueprint);
    const GET = createFlagshipIntelligenceHandler({
      getBlueprint,
      createRequestId: () => {
        throw new Error(privateDetail);
      },
    });

    const response = await GET();
    const fallbackRequestId = response.headers.get("x-request-id");
    const responseCopy = response.clone();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(fallbackRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(getBlueprint).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAVAILABLE",
        message: "Flagship role intelligence is temporarily unavailable.",
        requestId: fallbackRequestId,
      },
    });
    expect(await responseCopy.text()).not.toContain(privateDetail);
  });
});
