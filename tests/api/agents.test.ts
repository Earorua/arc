import { describe, expect, it, vi } from "vitest";
import { createAgentHandlers } from "../../app/server/agents/http";
import type { LearningAgentService } from "../../app/server/agents/service";
describe("learning agent HTTP boundary", () => {
  const service = { startPlanner: vi.fn(), workspace: vi.fn() } as unknown as LearningAgentService;
  const dependencies = { getUser: async () => null, createService: () => service,
    rateLimit: async () => true, origin: "https://arc.example" };
  it("rejects unauthenticated writes", async () => {
    const handlers = createAgentHandlers(dependencies);
    const result = await handlers.planner(new Request("https://arc.example/api/agents/planner",
      { method: "POST", headers: { origin: "https://arc.example" }, body: "{}" }));
    expect(result.status).toBe(401);
    expect(service.startPlanner).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes before parsing or invoking a model", async () => {
    const handlers = createAgentHandlers({ ...dependencies, getUser: async () => ({ id: "alice" }) });
    const result = await handlers.planner(new Request("https://arc.example/api/agents/planner",
      { method: "POST", headers: { origin: "https://other.example" }, body: "{}" }));
    expect(result.status).toBe(403);
  });
});
