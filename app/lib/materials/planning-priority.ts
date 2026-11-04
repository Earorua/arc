import type { SkillAuditVersion } from "../../contracts/planning";

export const MATERIAL_PLANNING_POLICY_VERSION = "2026.11.1" as const;
export type MaterialOverlay = Readonly<{
  skillRanks: Readonly<Record<string, number>>;
  mandatorySkillIds: readonly string[];
  semanticFingerprint: string;
  policyVersion: string;
}>;
export type PriorityNode = Readonly<{ id: string; prerequisiteIds: readonly string[]; rank: number; originalIndex: number }>;

/** Priority only breaks ties among executable nodes; urgency propagates to prerequisites. */
export function prioritizeReadyNodes(nodes: readonly PriorityNode[], completed: ReadonlySet<string> = new Set()): string[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error("DUPLICATE_NODE");
  const ranks = new Map(nodes.map(node => [node.id, node.rank]));
  for (const node of nodes) {
    if (!Number.isInteger(node.rank) || node.rank < 0 || node.rank > 5) throw new Error("INVALID_RANK");
    for (const dependency of node.prerequisiteIds) if (!byId.has(dependency) && !completed.has(dependency)) throw new Error("MISSING_DEPENDENCY");
  }
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const node of nodes) for (const dependency of node.prerequisiteIds) {
      if (!byId.has(dependency)) continue;
      const rank = Math.min(ranks.get(dependency)!, ranks.get(node.id)!);
      if (rank !== ranks.get(dependency)) { ranks.set(dependency, rank); changed = true; }
    }
    if (!changed) break;
  }
  const seen = new Set(completed), remaining = new Map(byId), result: string[] = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter(node => node.prerequisiteIds.every(id => seen.has(id))).sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)! || a.originalIndex - b.originalIndex || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const next = ready[0];
    if (!next) throw new Error("DEPENDENCY_CYCLE");
    result.push(next.id); seen.add(next.id); remaining.delete(next.id);
  }
  return result;
}

export function createMaterialOverlay(input: Readonly<{
  audit: SkillAuditVersion; knownSkillIds: readonly string[]; semanticFingerprint: string;
  requirements: readonly { skillId: string; level: "must" | "preferred" | "unspecified" }[];
  practiceSkillIds: readonly string[];
}>): MaterialOverlay {
  const known = new Set(input.knownSkillIds), answers = new Map(input.audit.answers.map(a => [a.skillId, a.level]));
  const skillRanks: Record<string, number> = Object.fromEntries(input.knownSkillIds.map(id => [id, 5]));
  const mandatorySkillIds = new Set<string>();
  for (const skillId of input.practiceSkillIds) if (known.has(skillId)) skillRanks[skillId] = 3;
  for (const requirement of input.requirements) {
    if (!known.has(requirement.skillId)) continue;
    const level = answers.get(requirement.skillId);
    if (requirement.level === "must") mandatorySkillIds.add(requirement.skillId);
    const rank = requirement.level === "must" ? level === "independent" ? 2 : level === "uncertain" ? 1 : 0 : requirement.level === "preferred" ? 4 : 5;
    skillRanks[requirement.skillId] = Math.min(skillRanks[requirement.skillId]!, rank);
  }
  return { skillRanks, mandatorySkillIds: [...mandatorySkillIds].sort(), semanticFingerprint: input.semanticFingerprint, policyVersion: MATERIAL_PLANNING_POLICY_VERSION };
}
