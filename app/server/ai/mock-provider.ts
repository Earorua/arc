import type { AiProvider, RoleResearchRequest } from "./contracts";

export class MockAiProvider implements AiProvider {
  async run(request: RoleResearchRequest) {
    return {
      role: request.role,
      mode: "deterministic-preview" as const,
      dimensions: [
        "Role outcomes and product judgment",
        "Typed frontend and backend systems",
        "Data, deployment, quality, and observability",
        "Evidence-backed AI integration",
      ],
      notice: "Deterministic foundation preview; no paid model was called.",
    };
  }

  async repair(request: RoleResearchRequest) {
    return this.run(request);
  }
}
