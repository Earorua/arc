import type { ResearchRunPublicView } from "../../contracts/research";
import type { ResearchGateContext } from "./orchestrator";

export interface ResearchService {
  start(ownerId: string, input: unknown, context: ResearchGateContext): Promise<ResearchRunPublicView>;
  get(ownerId: string, runId: string): Promise<ResearchRunPublicView | null>;
  retry(ownerId: string, runId: string, mutationId: string, context: ResearchGateContext): Promise<ResearchRunPublicView>;
  recover(ownerId: string, input: unknown): Promise<ResearchRunPublicView | null>;
}
