import type { AgentConfiguration } from "./service";

export function agentConfiguration(values: Record<string, unknown>): AgentConfiguration {
  const amount = (key: string, fallback: number) => {
    const raw = values[key]; if (raw === undefined || raw === "") return fallback;
    const value = Number(raw); return Number.isSafeInteger(value) && value > 0 ? value : 0;
  };
  const model = (key: string) => values[key] === undefined || values[key] === "" ? "openai/gpt-6-astra" : String(values[key]);
  const config = {
    enabled: values.ARC_LEARNING_AGENTS_ENABLED === "true" && typeof values.OPENROUTER_API_KEY === "string" && values.OPENROUTER_API_KEY.trim().length > 0,
    plannerModel: model("ARC_AGENT_PLANNER_MODEL"), tutorModel: model("ARC_AGENT_TUTOR_MODEL"),
    siteDailyMicros: amount("ARC_AGENT_SITE_DAILY_BUDGET_MICROS", 20000000),
    siteMonthlyMicros: amount("ARC_AGENT_SITE_MONTHLY_BUDGET_MICROS", 200000000),
    userDailyMicros: amount("ARC_AGENT_USER_DAILY_BUDGET_MICROS", 5000000),
    plannerReserveMicros: amount("ARC_AGENT_PLANNER_MAX_COST_MICROS", 2000000),
    tutorReserveMicros: amount("ARC_AGENT_TUTOR_MAX_COST_MICROS", 500000),
    inputMicrosPerToken: amount("ARC_AGENT_INPUT_MICROS_PER_TOKEN", 13),
    outputMicrosPerToken: amount("ARC_AGENT_OUTPUT_MICROS_PER_TOKEN", 50),
  };
  config.enabled = config.enabled && [config.plannerModel, config.tutorModel].every(value => /^[a-z0-9-]+\/[a-zA-Z0-9._:-]+$/.test(value)) && Object.values(config).filter(value => typeof value === "number").every(value => value > 0);
  return config;
}
