import { validResearchCandidate } from "./valid-candidate";

export function candidateWithConfidenceInjection() {
  return {
    ...validResearchCandidate,
    skills: validResearchCandidate.skills.map((skill, index) => index === 0
      ? { ...skill, confidence: 0.99 }
      : skill),
  };
}

export function candidateWithMissingCitations() {
  return {
    ...validResearchCandidate,
    evidence: validResearchCandidate.evidence.filter(({ skillId }) => skillId !== "experimentation"),
  };
}

export function candidateWithDependencyCycle() {
  return {
    ...validResearchCandidate,
    prerequisiteEdges: [
      ...validResearchCandidate.prerequisiteEdges,
      { skillId: "data-modeling", prerequisiteSkillId: "experimentation" },
    ],
  };
}

export function candidateWithMinuteMismatch() {
  return {
    ...validResearchCandidate,
    unitTemplates: validResearchCandidate.unitTemplates.map((template, index) => index === 0
      ? { ...template, estimatedMinutes: template.estimatedMinutes + 1 }
      : template),
  };
}

export function candidateWithPaidOnlyPrimary() {
  return {
    ...validResearchCandidate,
    resources: validResearchCandidate.resources.map((resource) => (
      resource.id === "dbt-modeling-guide" || resource.id === "kimball-dimensional-modeling"
        ? { ...resource, cost: "paid" as const }
        : resource
    )),
  };
}

export function candidateWithHtmlPayload() {
  return {
    ...validResearchCandidate,
    role: {
      ...validResearchCandidate.role,
      summary: "Leads data products. <script>globalThis.stolen = document.cookie</script>",
    },
  };
}

export function candidateWithOversizedText() {
  return {
    ...validResearchCandidate,
    role: { ...validResearchCandidate.role, summary: "x".repeat(501) },
  };
}

export const invalidResearchCandidates = {
  confidenceInjection: candidateWithConfidenceInjection(),
  missingCitations: candidateWithMissingCitations(),
  missingSkillSource: candidateWithMissingCitations(),
  dependencyCycle: candidateWithDependencyCycle(),
  minuteMismatch: candidateWithMinuteMismatch(),
  paidOnlyPrimary: candidateWithPaidOnlyPrimary(),
  htmlPayload: candidateWithHtmlPayload(),
  oversizedText: candidateWithOversizedText(),
} as const;
