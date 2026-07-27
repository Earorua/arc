export type SkillCategory =
  | "foundations"
  | "frontend"
  | "backend"
  | "data"
  | "quality"
  | "cloud"
  | "ai"
  | "product";

export type SkillImportance = "core" | "strong" | "advantage";

export interface SkillSource { title: string; url: string; observedAt: string; }
export interface SkillNode {
  id: string; name: string; category: SkillCategory; importance: SkillImportance;
  why: string; confidence: number; prerequisiteIds: string[]; sources: SkillSource[];
}
export interface PlanPhase { id: string; name: string; weeks: number; outcome: string; skillIds: string[]; }
export interface LearningUnit {
  id: string; title: string; minutes: number; skillIds: string[];
  steps: Array<{ id: string; label: string }>; deliverable: string;
}
export interface ProofItem {
  id: string; title: string; kind: "completion" | "commit" | "project" | "note" | "upload";
  skillIds: string[]; verified: boolean;
}
export interface RoleProfile {
  id: string; name: string; summary: string; version: string; updatedAt: string;
  skills: SkillNode[]; phases: PlanPhase[]; today: LearningUnit;
}
