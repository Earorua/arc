import { z } from "zod";

const id = z.string().trim().min(1).max(256);
export const agentRequestSchema = z.object({
  requestId: z.string().uuid(), goalId: id, baseVersionId: id, revision: z.number().int().nonnegative(),
  message: z.string().trim().min(1).max(6000), deep: z.boolean().default(false),
  page: z.enum(["today", "path", "stack", "proof", "coach", "site"]).default("site"),
}).strict();
export type AgentRequest = z.infer<typeof agentRequestSchema>;

export const plannerAdviceSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  rationale: z.string().trim().min(1).max(4000),
  milestones: z.array(z.object({
    title: z.string().min(1).max(160),
    unitIds: z.array(id).min(1).max(2000),
    successCriteria: z.string().min(1).max(1000),
  }).strict()).min(1).max(12),
  unitOrder: z.array(id).min(1).max(2000),
}).strict();
export type PlannerAdvice = z.infer<typeof plannerAdviceSchema>;
export type AgentKind = "planner" | "tutor";
export type AgentRunStatus = "starting" | "running" | "complete" | "failed" | "cancelled";
export type PublicAgentRun = {
  id: string; kind: AgentKind; status: AgentRunStatus; message: string; answer: string;
  advice: PlannerAdvice | null; createdAt: number; baseVersionId: string; revision: number;
  model: string; effort: string; error: string | null;
};
export type AgentLearningContext = {
  source: "research" | "flagship"; date: string; timeZone: string;
  completedUnits: number; totalUnits: number;
  task: { id: string; title: string; scheduledDate: string } | null;
  resources: { id: string; title: string; url: string; provider: string }[];
};
export type AgentWorkspace = {
  enabled: boolean; authenticated: boolean; reason: string | null;
  goalId: string | null; baseVersionId: string | null; revision: number | null;
  roleName: string; currentTask: string | null; history: PublicAgentRun[];
  plannerModel: string; tutorModel: string;
  learningContext?: AgentLearningContext;
  availability?: "ready" | "disabled" | "needs_setup";
};
export type AgentStreamEvent =
  | { type: "started"; run: PublicAgentRun }
  | { type: "heartbeat" }
  | { type: "delta"; text: string }
  | { type: "done"; run: PublicAgentRun }
  | { type: "error"; message: string };
