import { expect, vi } from "vitest";
import { UnauthenticatedError } from "../../app/server/auth/session";
import type { CloudRouteDependencies } from "../../app/server/http/cloud-route-factories";

export const requestId = "00000000-0000-4000-8000-000000000001";

export function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createRouteHarness(service: Record<string, ReturnType<typeof vi.fn>>) {
  const requireUser = vi.fn().mockResolvedValue({
    id: "user-owner",
    name: "Arc Learner",
    email: "learner@example.com",
  });
  const reserve = vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  const recordEvent = vi.fn().mockResolvedValue(undefined);
  const deps = {
    requireUser,
    createService: () => service,
    rateLimiter: { reserve },
    recordEvent,
    createRequestId: () => requestId,
    now: () => 1_785_196_800_000,
  } as unknown as CloudRouteDependencies;

  return { deps, requireUser, reserve, recordEvent, service };
}

export function makeAnonymous(harness: ReturnType<typeof createRouteHarness>) {
  harness.requireUser.mockRejectedValue(new UnauthenticatedError());
}

export function denyRateLimit(harness: ReturnType<typeof createRouteHarness>) {
  harness.reserve.mockResolvedValue({ allowed: false, retryAfterSeconds: 17 });
}

export async function expectApiError(
  response: Response,
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("x-request-id")).toBe(requestId);
  await expect(response.json()).resolves.toEqual({
    error: expect.objectContaining({ code, requestId }),
  });
}
