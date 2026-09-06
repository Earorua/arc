import assert from "node:assert/strict";

import { createDemoState } from "../../app/lib/demo-store";
import { D1ProofRepository } from "../../app/server/proof/d1-proof-repository";
import {
  createPublicProofView,
  sanitizeStoredPublicProofView,
} from "../../app/server/proof/public-view";
import { createOfflineComposition } from "./composition";
import { offlinePlanningRequest } from "./planning-fixture";

const origin = "http://127.0.0.1:4179";

export async function createRetainedPlanFixture(db: D1Database, mutationPrefix: string) {
  const app = await createOfflineComposition(db, origin);
  try {
    const { owner, state, generated, unit } = await createAdditionalPlanFixture(app, "owner-a", mutationPrefix);
    return { app, owner, state, generated, unit };
  } catch (error) {
    await app.dispose();
    throw error;
  }
}

export async function createAdditionalPlanFixture(
  app: Awaited<ReturnType<typeof createOfflineComposition>>,
  owner: "owner-a" | "owner-b",
  mutationPrefix: string,
) {
  const state = createDemoState();
  await app.cloud.importLocalState(owner, {
    migrationId: `${mutationPrefix}-activation`, consent: true,
    conflictResolution: "reject", state,
  });
  const generated = await app.planning.generate(
    owner,
    offlinePlanningRequest(undefined, undefined, `${mutationPrefix}-plan`),
  );
  const unit = generated.workspace.dailyUnits[0];
  assert.ok(unit);
  return { owner, state, generated, unit };
}

export async function createRetainedV8Fixture(db: D1Database) {
  const app = await createOfflineComposition(db, origin);
  try {
    const owner = "owner-a";
    const run = await app.createResearch().start(owner, {
      role: "Data Product Manager", locale: "en-US", mutationId: "retained-research-start",
    }, { cohortEnabled: true, rateAllowed: true });
    assert.equal(run.state, "ready");
    assert.ok(run.planningData);
    const state = {
      setup: {
        roleId: run.planningData.blueprint.name,
        level: "beginner" as const,
        weeklyMinutes: 420,
        targetWeeks: 18,
      },
      completedUnitIds: [], proofs: [],
    };
    await app.cloud.importLocalState(owner, {
      migrationId: "retained-research-activation", intent: "research-setup",
      consent: true, conflictResolution: "reject", state,
    });
    const generated = await app.planning.generate(owner, offlinePlanningRequest(
      run.planningData.blueprint,
      { source: "research", researchRunId: run.id },
      "retained-research-plan",
    ));
    const unit = generated.workspace.dailyUnits[0];
    assert.ok(unit);
    const completionRequest = {
      mutationId: "retained-v8-completion",
      baseVersionId: generated.workspace.activePlanVersionId,
      event: {
        kind: "completed" as const,
        unitId: unit.id,
        actualMinutes: unit.estimatedMinutes,
        planningDate: new Date().toISOString().slice(0, 10),
      },
    };
    const completed = await app.planning.appendEvent(owner, completionRequest);
    const created = await app.proof.create(owner, {
      mutationId: "retained-proof-create", baseRevision: 0, intent: "submit",
      validatorKey: null, dailyUnitId: unit.id,
      title: "Retained v8 proof original", kind: "document",
      summary: "Synthetic retained compatibility evidence with a bounded public description.",
      artifactUrl: "https://example.com/retained-v8-proof", assetId: null,
      skillIds: [unit.skillId], completionCriteria: unit.completionCriteria, visibility: "public",
    });
    const proofId = created.workspace.versions[0]!.proofId;
    const revised = await app.proof.revise(owner, proofId, {
      mutationId: "retained-proof-revise", baseRevision: created.workspace.revision,
      intent: "submit", validatorKey: null, dailyUnitId: unit.id,
      title: "Retained v8 proof revised", kind: "document",
      summary: "Synthetic revised compatibility evidence with a newer immutable version.",
      artifactUrl: "https://example.com/retained-v8-proof-revised", assetId: null,
      skillIds: [unit.skillId], completionCriteria: unit.completionCriteria, visibility: "public",
    });
    return {
      app, owner, run, state, generated, unit, completed, created, revised, proofId,
      setPrivate: () => app.proof.setVisibility(owner, proofId, {
        mutationId: "retained-proof-private", baseRevision: revised.workspace.revision, visibility: "private",
      }),
      withdraw: (baseRevision: number) => app.proof.withdraw(owner, proofId, {
        mutationId: "retained-proof-withdraw", baseRevision,
      }),
    };
  } catch (error) {
    await app.dispose();
    throw error;
  }
}

export function buildCurrentPublicView(input: Parameters<typeof createPublicProofView>[0]) {
  return createPublicProofView(input);
}

export function sanitizeCurrentPublicView(input: unknown) {
  return sanitizeStoredPublicProofView(input);
}

export function currentProofRepository(db: D1Database) {
  return new D1ProofRepository(db, () => 1_800_000_000_000);
}

export async function verifyDisabledResearchAdmission(fixture: Awaited<ReturnType<typeof createRetainedV8Fixture>>) {
  const planningBefore = await fixture.app.planning.getWorkspaceResponse(fixture.owner);
  const proofBefore = await fixture.app.proof.getWorkspace(fixture.owner);
  const researchBefore = await fixture.app.createResearch().get(fixture.owner, fixture.run.id);
  const callsBefore = fixture.app.counters.fakeResearchCalls;
  fixture.app.configure({ disabled: true });
  const response = await fixture.app.dispatch(new Request(`${origin}/api/intelligence/research`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
      "x-arc-uat-owner": fixture.owner,
    },
    body: JSON.stringify({
      role: "Data Product Manager", locale: "en-US", mutationId: "retained-disabled-start",
    }),
  }));
  const body = await response.json() as { error?: { code?: string } };
  const planningAfter = await fixture.app.planning.getWorkspaceResponse(fixture.owner);
  const proofAfter = await fixture.app.proof.getWorkspace(fixture.owner);
  const researchAfter = await fixture.app.createResearch().get(fixture.owner, fixture.run.id);
  return {
    status: response.status,
    resultCode: body.error?.code ?? null,
    savedPlanningPreserved: JSON.stringify(planningAfter) === JSON.stringify(planningBefore),
    savedProofPreserved: JSON.stringify(proofAfter) === JSON.stringify(proofBefore),
    savedResearchPreserved: JSON.stringify(researchAfter) === JSON.stringify(researchBefore),
    additionalFakeProviderCalls: fixture.app.counters.fakeResearchCalls - callsBefore,
  };
}
