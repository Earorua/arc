import { describe, expect, it, vi } from "vitest";
import { createDemoState } from "../../app/lib/demo-store";
import { createWorkspaceHandlers } from "../../app/server/http/cloud-route-factories";
import {
  createRouteHarness,
  denyRateLimit,
  expectApiError,
  jsonRequest,
  makeAnonymous,
} from "./cloud-route-test-helpers";

const snapshot = {
  state: createDemoState(),
  activeGoalId: "goal-owner",
  revision: "revision-1",
};

function setup() {
  const service = {
    getWorkspace: vi.fn().mockResolvedValue(snapshot),
    saveSetup: vi.fn().mockResolvedValue(snapshot),
  };
  return createRouteHarness(service);
}

describe("/api/workspace", () => {
  it("returns 401 before reading an anonymous workspace", async () => {
    const harness = setup();
    makeAnonymous(harness);
    const { GET } = createWorkspaceHandlers(harness.deps);

    const response = await GET(new Request("https://arc.example/api/workspace"));

    await expectApiError(response, 401, "UNAUTHENTICATED");
    expect(harness.service.getWorkspace).not.toHaveBeenCalled();
  });

  it("returns the owner-scoped snapshot and no raw owner identifier", async () => {
    const harness = setup();
    const { GET } = createWorkspaceHandlers(harness.deps);

    const response = await GET(new Request("https://arc.example/api/workspace"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ snapshot });
    expect(harness.service.getWorkspace).toHaveBeenCalledWith("user-owner");
    expect(JSON.stringify(harness.recordEvent.mock.calls)).not.toContain("user-owner");
  });

  it("rejects malformed setup writes before calling the service", async () => {
    const harness = setup();
    const { PUT } = createWorkspaceHandlers(harness.deps);

    const response = await PUT(jsonRequest("https://arc.example/api/workspace", "PUT", {
      mutationId: "short",
      setup: createDemoState().setup,
    }));

    await expectApiError(response, 400, "INVALID_INPUT");
    expect(harness.service.saveSetup).not.toHaveBeenCalled();
  });

  it("passes only the authenticated owner and replays duplicate mutations", async () => {
    const harness = setup();
    const { PUT } = createWorkspaceHandlers(harness.deps);
    const mutation = {
      mutationId: "setup-mutation-1",
      setup: createDemoState().setup,
    };

    const first = await PUT(jsonRequest("https://arc.example/api/workspace", "PUT", mutation));
    const replay = await PUT(jsonRequest("https://arc.example/api/workspace", "PUT", mutation));

    expect(await first.json()).toEqual(await replay.json());
    expect(harness.service.saveSetup).toHaveBeenNthCalledWith(1, "user-owner", mutation);
    expect(harness.service.saveSetup).toHaveBeenNthCalledWith(2, "user-owner", mutation);
  });

  it("returns 429 with retry guidance before a write", async () => {
    const harness = setup();
    denyRateLimit(harness);
    const { PUT } = createWorkspaceHandlers(harness.deps);

    const response = await PUT(jsonRequest("https://arc.example/api/workspace", "PUT", {
      mutationId: "setup-mutation-1",
      setup: createDemoState().setup,
    }));

    await expectApiError(response, 429, "RATE_LIMITED");
    expect(response.headers.get("retry-after")).toBe("17");
    expect(harness.service.saveSetup).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected failures", async () => {
    const harness = setup();
    harness.service.getWorkspace.mockRejectedValue(new Error("secret token=owner-provider-token"));
    const { GET } = createWorkspaceHandlers(harness.deps);

    const response = await GET(new Request("https://arc.example/api/workspace"));
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).toContain("INTERNAL");
    expect(body).not.toContain("owner-provider-token");
  });
});
