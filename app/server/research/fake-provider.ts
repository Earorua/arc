import type { ResearchCandidate } from "../../contracts/research";
import { candidateFromContent, parseProviderRepairRequest, parseProviderRequest, ResearchProviderError,
  type ProviderRepairRequest, type ProviderResearchRequest, type ProviderResearchResult, type ResearchProvider } from "./provider";

/** Local server composition only. No HTTP/client mode selector and no provider network calls. */
export class FakeResearchProvider implements ResearchProvider {
  private readonly mode: "ready" | "needs-review" | "failed" | "repair";
  constructor(options: { mode?: "ready" | "needs-review" | "failed" | "repair" } = {}) {
    this.mode = options.mode ?? "ready";
    if (!["ready", "needs-review", "failed", "repair"].includes(this.mode)) throw new ResearchProviderError("unavailable", false, false);
  }
  async research(request: ProviderResearchRequest): Promise<ProviderResearchResult> {
    parseProviderRequest(request);
    if (this.mode === "failed") throw new ResearchProviderError("unavailable", true, false);
    const candidate = structuredClone(PREVIEW_CANDIDATE);
    if (this.mode === "needs-review") candidate.unitTemplates = candidate.unitTemplates.filter((unit) => unit.kind !== "reinforce");
    const content = JSON.stringify(candidate);
    return result(this.mode === "repair" ? content.slice(0, -1) : content);
  }
  async repair(request: ProviderRepairRequest): Promise<ProviderResearchResult> {
    const original = parseProviderRepairRequest(request);
    if (this.mode === "failed") throw new ResearchProviderError("unavailable", true, false);
    const complete = JSON.stringify(PREVIEW_CANDIDATE);
    // Only close the known preview's missing final brace; never replace arbitrary facts.
    if ((original.originalContent !== complete.slice(0, -1) && original.originalContent !== complete)
      || JSON.stringify(original.annotations) !== JSON.stringify(ANNOTATIONS)) throw new ResearchProviderError("invalid-transport", false, false);
    return result(complete);
  }
}

function result(content: string): ProviderResearchResult {
  return { content, candidate: candidateFromContent(content), annotations: structuredClone(ANNOTATIONS), actualModel: "fake/research-v1", usage: null };
}

// A compact, authored non-Flagship preview; intentionally not imported from test fixtures.
// This sample is deterministic offline evidence, not a claim of live provider research.
const PREVIEW_CANDIDATE: ResearchCandidate = {
  role: { id: "data-product-manager", name: "Data Product Manager", summary: "Define trustworthy data products through explicit measurement models, evidence, and accountable decisions." },
  skills: [{ id: "data-modeling", name: "Data modeling", category: "data", importance: "core",
    why: "Trustworthy data products require shared entities, explicit grain, and consistent metric definitions.",
    masteryCriteria: ["Define entities and metrics with explicit grain and ownership.", "Review a model for ambiguity, lineage, and change risk."], resourceIds: ["dbt-modeling"] }],
  prerequisiteEdges: [],
  resources: [{ id: "dbt-modeling", title: "How we structure our dbt projects", url: "https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview",
    provider: "dbt Labs", language: "en", cost: "free", format: "documentation", sourceTier: "primary", purpose: "primary", estimatedMinutes: 60, skillIds: ["data-modeling"] }],
  stages: [{ id: "measurement-foundations", name: "Measurement foundations", weeks: 2, outcome: "Build a product measurement model with explicit grain, definitions, and ownership.", skillIds: ["data-modeling"] }],
  unitTemplates: (["learn", "calibrate", "reinforce"] as const).map((kind) => {
    const brief = {
      learn: "Draft a product measurement model with entities, grain, and metric ownership.",
      calibrate: "Diagnose ambiguous grain and ownership in a sample order measurement model.",
      reinforce: "Extend the order model to refunds while preserving metric definitions and lineage.",
    }[kind];
    const id = `data-modeling-${kind}`;
    return { id, skillId: "data-modeling", kind, title: brief, objective: brief,
      whyNow: kind === "learn" ? "Establish explicit measurement definitions before using product evidence." : "Test and transfer measurement definitions to an independent case.",
      primaryResourceId: "dbt-modeling", alternativeResourceIds: [],
      steps: [...(kind === "learn" ? [{ id: `${id}-study`, label: "Review the modeling documentation", minutes: 60 }] : []), { id: `${id}-practice`, label: brief, minutes: 60 }],
      checkpoints: kind === "learn" ? [
        { id: `${id}-study-review`, label: "Summarize the modeling guidance", stepIds: [`${id}-study`], estimatedMinutes: 60 },
        { id: `${id}-review`, label: "Review grain and metric definitions", stepIds: [`${id}-practice`], estimatedMinutes: 60 },
      ] : [],
      buildTask: brief, completionCriteria: ["Every metric has an explicit grain and owner.", "Entity relationships are unambiguous."],
      proofRequirement: "Submit the annotated model and explain how one ambiguity was resolved.", rubric: ["Definitions are consistent and assumptions are independently reviewable."], estimatedMinutes: kind === "learn" ? 120 : 60 };
  }),
  evidence: [{ id: "modeling-evidence", skillId: "data-modeling", resourceId: "dbt-modeling" }],
};
const ANNOTATIONS = PREVIEW_CANDIDATE.resources.map(({ url, title }) => ({ type: "url_citation" as const, url, title }));
