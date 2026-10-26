import { describe, expect, it } from "vitest";
import { agentConfiguration } from "../../app/server/agents/configuration";

describe("learning agent configuration", () => {
  it("uses only the server OpenRouter key and namespaced model defaults", () => {
    expect(agentConfiguration({ ARC_LEARNING_AGENTS_ENABLED: "true", OPENROUTER_API_KEY: "test" })).toMatchObject({
      enabled: true, plannerModel: "openai/gpt-6-astra", tutorModel: "openai/gpt-6-astra" });
    expect(agentConfiguration({ ARC_LEARNING_AGENTS_ENABLED: "true", OPENAI_API_KEY: "test" }).enabled).toBe(false);
    expect(agentConfiguration({ ARC_LEARNING_AGENTS_ENABLED: "true", OPENROUTER_API_KEY: " " }).enabled).toBe(false);
  });
  it("fails closed on invalid models or budgets instead of silently switching models", () => {
    const base = { ARC_LEARNING_AGENTS_ENABLED: "true", OPENROUTER_API_KEY: "test" };
    expect(agentConfiguration({ ...base, ARC_AGENT_PLANNER_MODEL: "gpt-6-astra" }).enabled).toBe(false);
    expect(agentConfiguration({ ...base, ARC_AGENT_TUTOR_MODEL: "openai/gpt-6-sol" }).tutorModel).toBe("openai/gpt-6-sol");
    expect(agentConfiguration({ ...base, ARC_AGENT_SITE_DAILY_BUDGET_MICROS: "bad" }).enabled).toBe(false);
  });
});
