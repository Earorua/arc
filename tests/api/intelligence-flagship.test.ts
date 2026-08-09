import { describe, expect, it, vi } from "vitest";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { createFlagshipIntelligenceHandler } from "../../app/api/intelligence/flagship/route";
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
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
    expect(getBlueprint).toHaveBeenCalledWith();
    await expect(response.json()).resolves.toMatchObject({
      blueprint: {
        id: flagshipBlueprint.id,
        version: flagshipBlueprint.version,
      },
    });
  });

  it("returns NOT_FOUND without exposing internals", async () => {
    const GET = createFlagshipIntelligenceHandler({
      getBlueprint: vi.fn().mockResolvedValue(null),
      createRequestId: () => requestId,
    });

    await expectApiError(await GET(), 404, "NOT_FOUND");
  });

  it("maps integrity failures to a stable unavailable response", async () => {
    const privateDetail = "private graph detail https://internal.invalid/source";
    const GET = createFlagshipIntelligenceHandler({
      getBlueprint: vi.fn().mockRejectedValue(new Error(privateDetail)),
      createRequestId: () => requestId,
    });

    const response = await GET();
    const responseCopy = response.clone();
    await expectApiError(response, 503, "UNAVAILABLE");
    const responseText = await responseCopy.text();
    expect(responseText).not.toContain(privateDetail);
    expect(responseText).not.toContain("Error:");
  });
});
