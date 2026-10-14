import { env } from "cloudflare:workers";
import { getD1 } from "../../../db/d1";
import { getArcUser } from "../auth/session";
import { D1RateLimiter } from "../http/rate-limit";
import { createProductionPlanningService } from "../http/planning-route-factories";
import { OpenRouterAgentProvider } from "./openrouter-provider";
import { D1AgentRepository } from "./repository";
import { LearningAgentService } from "./service";
import { createAgentHandlers } from "./http";
import { agentConfiguration } from "./configuration";

function environment() { return env as unknown as Record<string, unknown>; }
function configuredOrigin() {
  try { return new URL(String(environment().BETTER_AUTH_URL)).origin; } catch { return null; }
}
export const agentHandlers = createAgentHandlers({
  getUser: headers => getArcUser(headers),
  origin: configuredOrigin(),
  rateLimit: async owner => (await new D1RateLimiter(getD1()).reserve({
    scope: "learning-agents", subject: owner, limit: 120, windowSeconds: 60 })).allowed,
  createService: () => {
    const config = agentConfiguration(environment());
    return new LearningAgentService({
      config, planning: createProductionPlanningService(), repository: new D1AgentRepository(getD1()),
      provider: new OpenRouterAgentProvider({ apiKey: String(environment().OPENROUTER_API_KEY ?? "").trim(), ...config }),
    });
  },
});
