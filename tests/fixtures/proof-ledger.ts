import type { ProofLedgerMutationResult } from "../../app/contracts/proof-ledger";

export function proofResultFixture(): ProofLedgerMutationResult {
  const occurredAt = "2026-08-17T00:00:00.000Z";
  return {
    outcome: "demonstrated",
    workspace: {
      id: "workspace-1", goalId: "goal-1", schemaVersion: "2026.08.1", revision: 1,
      versions: [{
        id: "version-1", proofId: "proof-1", versionNumber: 1, schemaVersion: "2026.08.1",
        dailyUnitId: null, title: "Architecture map", kind: "document", summary: "Trace the boundary.",
        artifactUrl: "https://example.com/proof", assetId: null, skillIds: ["testing"],
        completionCriteria: ["Trace is complete"], visibility: "private", createdAt: occurredAt,
        supersedesVersionId: null,
      }],
      reviews: [
        { id: "review-1", proofId: "proof-1", versionId: "version-1", sequence: 1,
          mutationId: "mutation-1", kind: "submitted", stateAfter: "pending_review",
          visibilityAfter: "private", validatorKey: null, outcome: null, reasonCodes: [], occurredAt },
        { id: "review-2", proofId: "proof-1", versionId: "version-1", sequence: 2,
          mutationId: "mutation-1", kind: "structural_passed", stateAfter: "demonstrated",
          visibilityAfter: "private", validatorKey: null, outcome: "passed", reasonCodes: [], occurredAt },
      ],
      projections: [
        { skillId: "testing", audience: "internal", status: "demonstrated", completedUnitIds: [],
          strongestProofId: "proof-1", strongestVersionId: "version-1", latestUsedAt: occurredAt },
        { skillId: "testing", audience: "public", status: "exploring", completedUnitIds: [],
          strongestProofId: null, strongestVersionId: null, latestUsedAt: null },
      ],
    },
  };
}
