import { describe, expect, it, vi } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { createDemoState } from "../../app/lib/demo-store";
import { createLearningEventHandler } from "../../app/server/http/cloud-route-factories";
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
  revision: "completion-mutation-1",
};

function completionBody() {
  return {
    mutationId: "completion-mutation-1",
    unitId: flagshipRole.today.id,
    title: flagshipRole.today.title,
    deliverable: flagshipRole.today.deliverable,
    skillIds: flagshipRole.today.skillIds,
  };
}

function setup() {
  return createRouteHarness({
    recordCompletion: vi.fn().mockResolvedValue(snapshot),
  });
}

describe("POST /api/learning/events", () => {
  it("returns 401 for an anonymous completion", async () => {
    const harness = setup();
    makeAnonymous(harness);
    const POST = createLearningEventHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/learning/events", "POST", completionBody()));

    await expectApiError(response, 401, "UNAUTHENTICATED");
    expect(harness.service.recordCompletion).not.toHaveBeenCalled();
  });

  it("rejects malformed or owner-selecting input", async () => {
    const harness = setup();
    const POST = createLearningEventHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/learning/events", "POST", {
      ...completionBody(),
      skillIds: Array.from({ length: 33 }, () => "skill"),
      userId: "attacker-selected-owner",
    }));

    await expectApiError(response, 400, "INVALID_INPUT");
    expect(harness.service.recordCompletion).not.toHaveBeenCalled();
  });

  it("records only against the authenticated owner", async () => {
    const harness = setup();
    const POST = createLearningEventHandler(harness.deps);
    const body = completionBody();

    const response = await POST(jsonRequest("https://arc.example/api/learning/events", "POST", body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ snapshot });
    expect(harness.service.recordCompletion).toHaveBeenCalledWith("user-owner", body);
  });

  it("replays duplicate completion mutations", async () => {
    const harness = setup();
    const POST = createLearningEventHandler(harness.deps);
    const body = completionBody();

    const first = await POST(jsonRequest("https://arc.example/api/learning/events", "POST", body));
    const replay = await POST(jsonRequest("https://arc.example/api/learning/events", "POST", body));

    expect(await first.json()).toEqual(await replay.json());
    expect(harness.service.recordCompletion).toHaveBeenCalledTimes(2);
  });

  it("returns 429 before recording a completion", async () => {
    const harness = setup();
    denyRateLimit(harness);
    const POST = createLearningEventHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/learning/events", "POST", completionBody()));

    await expectApiError(response, 429, "RATE_LIMITED");
    expect(harness.service.recordCompletion).not.toHaveBeenCalled();
  });

  it("sanitizes unexpected persistence failures", async () => {
    const harness = setup();
    harness.service.recordCompletion.mockRejectedValue(new Error("fileBody=private-proof token=private-token"));
    const POST = createLearningEventHandler(harness.deps);

    const response = await POST(jsonRequest("https://arc.example/api/learning/events", "POST", completionBody()));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).not.toContain("private-proof");
    expect(serialized).not.toContain("private-token");
  });
});
