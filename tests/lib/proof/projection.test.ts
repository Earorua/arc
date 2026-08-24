import { describe, expect, it } from "vitest";
import type { PlanningWorkspace } from "../../../app/contracts/planning";
import { PROOF_LEDGER_SCHEMA_VERSION } from "../../../app/contracts/proof-ledger";
import {
  completedSkillIdsFromPlanning,
  projectSkillEvidence,
} from "../../../app/lib/proof/projection";

describe("proof skill projection", () => {
  it("never turns a completion into verification", () => {
    const result = projectSkillEvidence({
      skillIds: ["react"],
      completedSkillIds: new Set(["react"]),
      versions: [],
      reviews: [],
      visibility: "internal",
    });

    expect(result).toEqual([{
      skillId: "react",
      audience: "internal",
      status: "practicing",
      completedUnitIds: [],
      strongestProofId: null,
      strongestVersionId: null,
      latestUsedAt: null,
    }]);
  });

  it("resolves completed units through their target plan version", () => {
    const workspace = {
      dailyUnits: [
        { id: "unit-shared", planVersionId: "plan-old", skillId: "typescript" },
        { id: "unit-shared", planVersionId: "plan-new", skillId: "react" },
      ],
      events: [
        { kind: "completed", unitId: "unit-shared", targetPlanVersionId: "plan-new" },
        { kind: "delayed", unitId: "unit-shared", targetPlanVersionId: "plan-old" },
      ],
    } as PlanningWorkspace;

    expect(completedSkillIdsFromPlanning(workspace)).toEqual(new Set(["react"]));
  });

  it("promotes a structurally accepted active version to demonstrated", () => {
    const result = projectSkillEvidence({
      skillIds: ["react"],
      completedSkillIds: new Set(),
      versions: [version({})],
      reviews: [review({ kind: "structural_passed", stateAfter: "demonstrated", outcome: "passed" })],
      visibility: "internal",
    });

    expect(result[0]).toMatchObject({
      status: "demonstrated",
      strongestProofId: "proof-1",
      strongestVersionId: "version-1",
      latestUsedAt: "2026-08-25T00:00:00.000Z",
    });
  });

  it("requires a named validator pass for verified", () => {
    const reviews = [
      review({ kind: "structural_passed", stateAfter: "demonstrated", outcome: "passed" }),
      review({
        id: "review-2",
        sequence: 2,
        kind: "validator_passed",
        stateAfter: "verified",
        validatorKey: "proof.test-report.v1",
        outcome: "passed",
        occurredAt: "2026-08-25T00:01:00.000Z",
      }),
    ];

    expect(projectSkillEvidence({
      skillIds: ["react"],
      completedSkillIds: new Set(),
      versions: [version({})],
      reviews,
      visibility: "internal",
    })[0]?.status).toBe("verified");
  });

  it("keeps unavailable validation demonstrated and removes failed validation", () => {
    const unavailable = review({
      id: "review-2",
      sequence: 2,
      kind: "validator_unavailable",
      stateAfter: "demonstrated",
      validatorKey: "proof.unknown.v1",
      outcome: "unavailable",
    });
    const failed = review({
      id: "review-2",
      sequence: 2,
      kind: "validator_failed",
      stateAfter: "rejected",
      validatorKey: "proof.test-report.v1",
      outcome: "failed",
    });
    const base = review({ kind: "structural_passed", stateAfter: "demonstrated", outcome: "passed" });
    const input = {
      skillIds: ["react"],
      completedSkillIds: new Set<string>(),
      versions: [version({})],
      visibility: "internal" as const,
    };

    expect(projectSkillEvidence({ ...input, reviews: [base, unavailable] })[0]?.status)
      .toBe("demonstrated");
    expect(projectSkillEvidence({ ...input, reviews: [base, failed] })[0]?.status)
      .toBe("exploring");
  });

  it("downgrades when a revision replaces stronger evidence", () => {
    const first = version({});
    const replacement = version({
      id: "version-2",
      versionNumber: 2,
      supersedesVersionId: first.id,
    });
    const reviews = [
      review({ kind: "validator_passed", stateAfter: "verified", validatorKey: "proof.test-report.v1", outcome: "passed" }),
      review({
        id: "review-2",
        versionId: replacement.id,
        sequence: 2,
        kind: "validator_failed",
        stateAfter: "rejected",
        validatorKey: "proof.test-report.v1",
        outcome: "failed",
      }),
    ];

    expect(projectSkillEvidence({
      skillIds: ["react"],
      completedSkillIds: new Set(["react"]),
      versions: [first, replacement],
      reviews,
      visibility: "internal",
    })[0]).toMatchObject({ status: "practicing", strongestVersionId: null });
  });

  it("withdraws one proof without discarding remaining demonstrated evidence", () => {
    const withdrawn = version({});
    const remaining = version({ id: "version-other", proofId: "proof-other" });
    const reviews = [
      review({ kind: "structural_passed", stateAfter: "demonstrated", outcome: "passed" }),
      review({ id: "review-2", sequence: 2, kind: "withdrawn", stateAfter: "withdrawn" }),
      review({
        id: "review-other",
        proofId: "proof-other",
        versionId: "version-other",
        kind: "structural_passed",
        stateAfter: "demonstrated",
        outcome: "passed",
      }),
    ];

    expect(projectSkillEvidence({
      skillIds: ["react"],
      completedSkillIds: new Set(),
      versions: [withdrawn, remaining],
      reviews,
      visibility: "internal",
    })[0]).toMatchObject({ status: "demonstrated", strongestProofId: "proof-other" });
  });

  it("reprojects public status after deterministic visibility changes", () => {
    const demonstrated = review({
      kind: "structural_passed",
      stateAfter: "demonstrated",
      outcome: "passed",
    });
    const madePublic = review({
      id: "review-2",
      sequence: 2,
      kind: "visibility_changed",
      stateAfter: "demonstrated",
      visibilityAfter: "public",
    });
    const madePrivate = review({
      id: "review-3",
      sequence: 3,
      kind: "visibility_changed",
      stateAfter: "demonstrated",
      visibilityAfter: "private",
    });
    const input = {
      skillIds: ["react"],
      completedSkillIds: new Set(["react"]),
      versions: [version({})],
      visibility: "public" as const,
    };

    expect(projectSkillEvidence({ ...input, reviews: [madePublic, demonstrated] })[0]?.status)
      .toBe("demonstrated");
    expect(projectSkillEvidence({ ...input, reviews: [madePublic, demonstrated, madePrivate] })[0]?.status)
      .toBe("exploring");
  });

  it("is deterministic for out-of-order reviews and preserves canonical skill order", () => {
    const demonstrated = review({ kind: "structural_passed", stateAfter: "demonstrated", outcome: "passed" });
    const verified = review({
      id: "review-2",
      sequence: 2,
      kind: "validator_passed",
      stateAfter: "verified",
      validatorKey: "proof.test-report.v1",
      outcome: "passed",
    });
    const input = {
      skillIds: ["typescript", "react"],
      completedSkillIds: new Set(["typescript"]),
      versions: [version({})],
      visibility: "internal" as const,
    };

    const ordered = projectSkillEvidence({ ...input, reviews: [demonstrated, verified] });
    const reversed = projectSkillEvidence({ ...input, reviews: [verified, demonstrated] });

    expect(reversed).toEqual(ordered);
    expect(ordered.map(({ skillId }) => skillId)).toEqual(["typescript", "react"]);
    expect(ordered.map(({ status }) => status)).toEqual(["practicing", "verified"]);
  });

  it("records unique completed units and their latest use for internal projection", () => {
    const result = projectSkillEvidence({
      skillIds: ["react"],
      completedSkillIds: new Set(["react"]),
      completedUnits: [
        { unitId: "unit-1", skillId: "react", occurredAt: "2026-08-24T00:00:00.000Z" },
        { unitId: "unit-1", skillId: "react", occurredAt: "2026-08-25T00:00:00.000Z" },
        { unitId: "unit-2", skillId: "react", occurredAt: "2026-08-24T12:00:00.000Z" },
      ],
      versions: [],
      reviews: [],
      visibility: "internal",
    });

    expect(result[0]).toMatchObject({
      status: "practicing",
      completedUnitIds: ["unit-1", "unit-2"],
      latestUsedAt: "2026-08-25T00:00:00.000Z",
    });
  });
});

function version(overrides: Record<string, unknown>) {
  return {
    id: "version-1",
    proofId: "proof-1",
    versionNumber: 1,
    schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
    dailyUnitId: "unit-1",
    title: "Accessible request trace",
    kind: "document" as const,
    summary: "A request and event trace linked to the completion criteria.",
    artifactUrl: "https://github.com/arc/example",
    assetId: null,
    skillIds: ["react"],
    completionCriteria: ["The native event and response are shown in order."],
    visibility: "private" as const,
    createdAt: "2026-08-25T00:00:00.000Z",
    supersedesVersionId: null,
    ...overrides,
  };
}

function review(overrides: Record<string, unknown>) {
  return {
    id: "review-1",
    proofId: "proof-1",
    versionId: "version-1",
    sequence: 1,
    mutationId: "mutation-1",
    kind: "submitted" as const,
    stateAfter: "pending_review" as const,
    visibilityAfter: "private" as const,
    validatorKey: null,
    outcome: null,
    reasonCodes: [],
    occurredAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}
