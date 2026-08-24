import { describe, expect, it } from "vitest";
import {
  PROOF_LEDGER_SCHEMA_VERSION,
  createProofRequestSchema,
  parseProofLedgerWorkspaceAtRepositoryBoundary,
  proofLedgerWorkspaceSchema,
  proofReviewEventSchema,
  proofVersionSchema,
  skillEvidenceStatusSchema,
} from "../../app/contracts/proof-ledger";

describe("proof ledger contracts", () => {
  it.each(["exploring", "practicing", "demonstrated", "verified"])(
    "accepts the canonical %s skill status",
    (status) => {
      expect(skillEvidenceStatusSchema.parse(status)).toBe(status);
    },
  );

  it.each(["completed", "mastered", "verified_by_ai"])(
    "rejects the non-canonical %s skill status",
    (status) => {
      expect(skillEvidenceStatusSchema.safeParse(status).success).toBe(false);
    },
  );

  it("accepts a strict immutable version and rejects unknown keys", () => {
    const version = proofVersion({});

    expect(proofVersionSchema.parse(version)).toEqual(version);
    expect(proofVersionSchema.safeParse({ ...version, ownerId: "owner-private" }).success)
      .toBe(false);
  });

  it("rejects duplicate skills and non-public artifact URLs", () => {
    expect(proofVersionSchema.safeParse(proofVersion({ skillIds: ["react", "react"] })).success)
      .toBe(false);
    expect(proofVersionSchema.safeParse(proofVersion({ artifactUrl: "http://localhost:3000/proof" })).success)
      .toBe(false);
  });

  it("requires a revision to supersede an earlier version of the same proof", () => {
    const first = proofVersion({});
    const invalidRevision = proofVersion({
      id: "proof-version-2",
      proofId: "proof-other",
      versionNumber: 2,
      supersedesVersionId: first.id,
    });

    expect(proofLedgerWorkspaceSchema.safeParse(workspace({
      versions: [first, invalidRevision],
    })).success).toBe(false);
  });

  it("rejects reviews and strongest projections that do not resolve", () => {
    const value = workspace({
      reviews: [{
        id: "review-1",
        proofId: "proof-1",
        versionId: "missing-version",
        sequence: 1,
        mutationId: "mutation-1",
        kind: "structural_passed",
        stateAfter: "demonstrated",
        visibilityAfter: "private",
        validatorKey: null,
        outcome: "passed",
        reasonCodes: [],
        occurredAt: "2026-08-25T00:00:00.000Z",
      }],
      projections: [{
        skillId: "react",
        audience: "internal",
        status: "demonstrated",
        completedUnitIds: [],
        strongestProofId: "proof-1",
        strongestVersionId: "missing-version",
        latestUsedAt: "2026-08-25T00:00:00.000Z",
      }],
    });

    expect(proofLedgerWorkspaceSchema.safeParse(value).success).toBe(false);
  });

  it("accepts strict create intent and rejects owner-controlled scope", () => {
    const request = {
      mutationId: "mutation-1",
      baseRevision: 0,
      intent: "submit",
      validatorKey: null,
      dailyUnitId: "unit-1",
      title: "Accessible request trace",
      kind: "document",
      summary: "A request and event trace linked to the completion criteria.",
      artifactUrl: "https://github.com/arc/example",
      assetId: null,
      skillIds: ["react"],
      completionCriteria: ["The native event and response are shown in order."],
      visibility: "private",
    } as const;

    expect(createProofRequestSchema.parse(request)).toEqual(request);
    expect(createProofRequestSchema.safeParse({ ...request, userId: "other-owner" }).success)
      .toBe(false);
    expect(createProofRequestSchema.safeParse({
      ...request,
      skillIds: ["react", "react"],
    }).success).toBe(false);
    expect(createProofRequestSchema.safeParse({
      ...request,
      assetId: "asset-1",
    }).success).toBe(false);
  });

  it("enforces deterministic review state transitions", () => {
    expect(proofReviewEventSchema.parse(reviewEvent({
      kind: "validator_passed",
      stateAfter: "verified",
      validatorKey: "proof.test-report.v1",
      outcome: "passed",
    })).stateAfter).toBe("verified");

    expect(proofReviewEventSchema.safeParse(reviewEvent({
      kind: "validator_passed",
      stateAfter: "demonstrated",
      validatorKey: "proof.test-report.v1",
      outcome: "passed",
    })).success).toBe(false);
    expect(proofReviewEventSchema.safeParse(reviewEvent({
      kind: "submitted",
      stateAfter: "verified",
    })).success).toBe(false);
  });

  it("rejects duplicate record keys at the repository boundary", () => {
    const version = proofVersion({});
    const duplicated = workspace({ versions: [version, { ...version }] });

    expect(() => parseProofLedgerWorkspaceAtRepositoryBoundary(duplicated)).toThrow();
  });

  it("rejects a repository payload larger than four MiB", () => {
    expect(() => parseProofLedgerWorkspaceAtRepositoryBoundary(`{"padding":"${"x".repeat(4 * 1024 * 1024)}"}`))
      .toThrow(/four MiB/iu);
  });
});

function proofVersion(overrides: Record<string, unknown>) {
  return {
    id: "proof-version-1",
    proofId: "proof-1",
    versionNumber: 1,
    schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
    dailyUnitId: "unit-1",
    title: "Accessible request trace",
    kind: "document",
    summary: "A request and event trace linked to the completion criteria.",
    artifactUrl: "https://github.com/arc/example",
    assetId: null,
    skillIds: ["react"],
    completionCriteria: ["The native event and response are shown in order."],
    visibility: "private",
    createdAt: "2026-08-25T00:00:00.000Z",
    supersedesVersionId: null,
    ...overrides,
  };
}

function workspace(overrides: Record<string, unknown>) {
  return {
    id: "proof-workspace-1",
    goalId: "goal-1",
    schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
    revision: 0,
    versions: [],
    reviews: [],
    projections: [],
    ...overrides,
  };
}

function reviewEvent(overrides: Record<string, unknown>) {
  return {
    id: "review-1",
    proofId: "proof-1",
    versionId: "proof-version-1",
    sequence: 1,
    mutationId: "mutation-1",
    kind: "submitted",
    stateAfter: "pending_review",
    visibilityAfter: "private",
    validatorKey: null,
    outcome: null,
    reasonCodes: [],
    occurredAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}
