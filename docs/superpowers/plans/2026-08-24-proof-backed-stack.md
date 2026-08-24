# Arc v8 Proof-backed Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Today completions and immutable proof versions into truthful, owner-scoped skill evidence across Proof, Stack, and public snapshots without treating completion or AI feedback as verification.

**Architecture:** Add a strict proof-ledger contract and pure deterministic projector beside the v7 `ProofItem` model. Persist immutable versions and append-only review events in additive D1 tables, cache owner/goal-scoped skill projections, and keep `proof_items.verified` as a compatibility read only. A local repository and a cloud service expose the same workspace contract; Proof, Stack, and Today consume that contract while existing upload/share endpoints are adapted rather than replaced.

**Tech Stack:** TypeScript 5.9, React 19, Next 16/Vinext, Zod 4, Drizzle ORM, Cloudflare D1/R2, Vitest, Testing Library, Node SQLite, ESLint.

---

## Locked design decisions

- `completed` planning events promote a linked skill only to `practicing`.
- A submitted active proof version that passes structural checks promotes a skill to `demonstrated`.
- Only a named, server-owned deterministic validator returning `passed` can promote a skill to `verified`.
- AI feedback is not implemented in Goal 1 and can never be interpreted as verification by this contract.
- Rejected, withdrawn, or superseded versions are removed from the internal projection. Private versions remain valid internally but are excluded from the public projection.
- Revisions are new immutable rows. Existing version rows and review-event rows are never updated.
- New writes keep `proof_items.verified = false`. Existing `true` values are accepted only by the v7 compatibility reader and map to `practicing`, never `verified`.
- All new database relationships use owner-and-goal-scoped composite keys. No request body may choose another owner.
- Public shares are immutable allowlisted snapshots. They exclude email, owner IDs, goal IDs, internal object keys, raw validator payloads, completion criteria, and future AI inputs.
- Migration `0004_proof_backed_stack.sql` is additive only. This goal does not apply it to production and does not save or deploy a Sites version.

## Canonical state model

Use these names consistently in contracts, SQL enums, tests, UI copy, and analytics-safe response payloads:

```ts
export const proofArtifactKindSchema = z.enum([
  "repository", "commit", "pull_request", "deployment", "api",
  "document", "screenshot", "test_report", "code", "upload", "reflection",
]);

export const proofReviewStateSchema = z.enum([
  "draft", "pending_review", "demonstrated", "verified", "rejected", "withdrawn", "superseded",
]);

export const skillEvidenceStatusSchema = z.enum([
  "exploring", "practicing", "demonstrated", "verified",
]);

export const proofVisibilitySchema = z.enum(["private", "public"]);
export const deterministicReviewOutcomeSchema = z.enum(["passed", "failed", "unavailable"]);
export const proofReviewEventKindSchema = z.enum([
  "drafted", "submitted", "structural_passed", "validator_passed", "validator_failed",
  "validator_unavailable", "rejected", "withdrawn", "superseded", "visibility_changed",
]);
```

Every review event records `sequence`, `stateAfter`, and `visibilityAfter`. A visibility event carries the prior state forward and changes only `visibilityAfter`; a withdrawal or supersession event carries visibility forward and changes only the state. Projection precedence is `verified > demonstrated > practicing > exploring`. A version contributes only when it is the latest non-superseded version for its proof and its terminal state is `demonstrated` or `verified`. Public projection additionally requires the terminal `visibilityAfter === "public"`.

## Task 0: Reconfirm the approved remote and documentation baseline

**Files:**
- Read: `docs/operations/v8-resume-checkpoint.md`
- Read: `docs/superpowers/specs/2026-08-24-arc-v8-completion-program-design.md`

- [x] Run `git status --short --branch`; expect branch `codex/v8-proof-backed-stack` with no implementation changes at the start of execution.
- [x] Run `git fetch origin`; expect the remote reference refresh to succeed without modifying the worktree.
- [x] Run `git log --oneline --decorate -8`; confirm HEAD descends from approved local baseline `3db3fc9`.
- [x] Run `git log --oneline --left-right origin/master...master`; record the exact local/remote difference and confirm it matches the recovery checkpoint.
- [x] Re-read both listed documents and verify they agree that Phase 1 and Phase 2 are complete, public production is still v7.2 / Sites version 9, migrations `0002` and `0003` are not production-applied, and Goal 1 forbids deployment.
- [x] If Git history or external state differs, stop implementation, update only the recovery facts after investigation, and obtain user direction. Do not reset, rebase, merge, or deploy to force alignment.

## Task 1: Introduce the strict proof-ledger contract

**Files:**
- Create: `app/contracts/proof-ledger.ts`
- Create: `tests/contracts/proof-ledger.test.ts`

- [x] Write a failing contract test that accepts the four canonical skill statuses and rejects `completed`, `mastered`, and unknown keys.

```ts
import { describe, expect, it } from "vitest";
import { skillEvidenceStatusSchema } from "../../app/contracts/proof-ledger";

describe("proof ledger contracts", () => {
  it.each(["exploring", "practicing", "demonstrated", "verified"])("accepts %s", (status) => {
    expect(skillEvidenceStatusSchema.parse(status)).toBe(status);
  });

  it.each(["completed", "mastered", "verified_by_ai"])("rejects %s", (status) => {
    expect(skillEvidenceStatusSchema.safeParse(status).success).toBe(false);
  });
});
```

- [x] Run `npm run test:unit -- tests/contracts/proof-ledger.test.ts`; expect failure because the module does not exist.
- [x] Add the enums from the canonical state model and export inferred TypeScript types.
- [x] Add strict schemas for `ProofVersion`, `ProofReviewEvent`, `SkillEvidenceProjection`, and `ProofLedgerWorkspace`.

```ts
export const proofVersionSchema = z.object({
  id: idSchema,
  proofId: idSchema,
  versionNumber: z.number().int().positive(),
  schemaVersion: z.literal(PROOF_LEDGER_SCHEMA_VERSION),
  dailyUnitId: idSchema.nullable(),
  title: z.string().trim().min(1).max(180),
  kind: proofArtifactKindSchema,
  summary: z.string().trim().min(1).max(2000),
  artifactUrl: publicHttpsUrlSchema.nullable(),
  assetId: idSchema.nullable(),
  skillIds: z.array(idSchema).min(1).max(32),
  completionCriteria: z.array(z.string().trim().min(1).max(500)).max(8),
  visibility: proofVisibilitySchema,
  createdAt: timestampSchema,
  supersedesVersionId: idSchema.nullable(),
}).strict();
```

- [x] Add cross-record refinements: unique IDs, unique `(proofId, versionNumber)`, unique skill IDs, valid supersession within one proof, review version resolution, projection strongest-version resolution, and a 4 MiB serialized repository boundary.
- [x] Add request/response schemas for create, revise, withdraw, visibility, workspace, and deterministic review results. Create and revise requests contain `intent: "save_draft" | "submit"` plus a nullable closed-registry `validatorKey`; every mutation contains `mutationId` and `baseRevision`.
- [x] Add tests for duplicate versions, cross-proof supersession, unresolved review IDs, private/public visibility, invalid URLs, excessive payloads, and strict unknown-key rejection.
- [x] Run `npm run test:unit -- tests/contracts/proof-ledger.test.ts`; expect all contract tests to pass.
- [x] Stage with `git add app/contracts/proof-ledger.ts tests/contracts/proof-ledger.test.ts`.
- [x] Commit with `git commit -m "feat: define proof ledger contracts"`.

## Task 2: Build the deterministic skill projector

**Files:**
- Create: `app/lib/proof/projection.ts`
- Create: `tests/lib/proof/projection.test.ts`

- [ ] Write a failing test proving a planning completion yields `practicing`, including legacy completion evidence whose `verified` flag is `true`.

```ts
it("never turns completion into verification", () => {
  const result = projectSkillEvidence({
    skillIds: ["react"],
    completedSkillIds: new Set(["react"]),
    versions: [],
    reviews: [],
    visibility: "internal",
  });
  expect(result[0]).toMatchObject({ skillId: "react", status: "practicing" });
});
```

- [ ] Run `npm run test:unit -- tests/lib/proof/projection.test.ts`; expect a missing-module failure.
- [ ] Implement `completedSkillIdsFromPlanning(workspace)` by resolving every `completed` event through its `targetPlanVersionId` and matching Daily Unit `skillId`. Deduplicate repeats and ignore unresolved records rather than inventing evidence.
- [ ] Implement latest-version selection by `(proofId, versionNumber)` and apply terminal review events by sequence and timestamp.
- [ ] Implement pure projection with the locked precedence and separate `internal` and `public` modes.

```ts
const rank: Record<SkillEvidenceStatus, number> = {
  exploring: 0,
  practicing: 1,
  demonstrated: 2,
  verified: 3,
};

function contribution(state: ProofReviewState): SkillEvidenceStatus | null {
  if (state === "verified") return "verified";
  if (state === "demonstrated") return "demonstrated";
  return null;
}
```

- [ ] Add tests for: structural pass → demonstrated; named validator pass → verified; validator unavailable → demonstrated; validator fail → rejected; rejection and withdrawal downgrade; revision supersedes the prior version; private visibility changes only public projection; remaining evidence prevents an incorrect downgrade; output order follows canonical skill order.
- [ ] Add an invariant test that random review order cannot exceed the status produced by the same events sorted by their recorded sequence.
- [ ] Run `npm run test:unit -- tests/lib/proof/projection.test.ts`; expect all projector tests to pass.
- [ ] Stage with `git add app/lib/proof/projection.ts tests/lib/proof/projection.test.ts`.
- [ ] Commit with `git commit -m "feat: project deterministic skill evidence"`.

## Task 3: Add local proof-ledger persistence and v7 compatibility conversion

**Files:**
- Create: `app/lib/proof/local-repository.ts`
- Create: `app/lib/proof/legacy-adapter.ts`
- Modify: `app/lib/demo-store.ts`
- Create: `tests/lib/proof/local-repository.test.ts`
- Create: `tests/lib/proof/legacy-adapter.test.ts`
- Modify: `tests/lib/demo-store.test.ts`

- [ ] Write failing tests for an empty local workspace, persisted reload, optimistic revision conflict, idempotent mutation replay, and corrupt-storage quarantine.
- [ ] Implement the storage key `arc-proof-ledger-v1`, strict boundary parsing, and repository methods `load`, `createProof`, `reviseProof`, `withdrawProof`, and `setVisibility`.
- [ ] Keep the local mutation path atomic: calculate the next workspace, validate it, then write one serialized value. On quota or storage errors return the previous valid workspace unchanged.
- [ ] Implement a legacy adapter: every legacy `verified: true` row contributes at most `practicing`, regardless of kind; a legacy draft contributes no promotion. No legacy row can contribute `demonstrated` or `verified`.

```ts
export function legacyProofsToPracticingSkills(proofs: readonly ProofItem[]): Set<string> {
  return new Set(
    proofs.filter(({ kind, verified }) => kind === "completion" || verified)
      .flatMap(({ skillIds }) => skillIds),
  );
}
```

- [ ] Change `completeDemoUnit` so new legacy completion rows use `verified: false`. Preserve the existing strict migration reader so stored v7 rows with `verified: true` still load.
- [ ] Update demo-store tests to assert new completions are not verified and old stored rows remain readable.
- [ ] Run `npm run test:unit -- tests/lib/proof/local-repository.test.ts tests/lib/proof/legacy-adapter.test.ts tests/lib/demo-store.test.ts`; expect all tests to pass.
- [ ] Stage with `git add app/lib/proof app/lib/demo-store.ts tests/lib/proof tests/lib/demo-store.test.ts`.
- [ ] Commit with `git commit -m "feat: persist local proof ledger safely"`.

## Task 4: Add the additive proof-ledger database migration

**Files:**
- Modify: `db/schema.ts`
- Create: `drizzle/0004_proof_backed_stack.sql` via `npm run db:generate`
- Create: `drizzle/meta/0004_snapshot.json` via `npm run db:generate`
- Modify: `drizzle/meta/_journal.json` via `npm run db:generate`
- Create: `tests/db/proof-ledger-migration.test.ts`
- Modify: `tests/db/migration-safety.test.ts`
- Modify: `tests/db/schema.test.ts`

- [ ] Write a failing migration test expecting exactly `proof_versions`, `proof_review_events`, and `user_skill_projections` after applying migrations `0000` through `0004`.
- [ ] Extend migration safety tests so `0004` permits only one `CREATE TABLE` or `CREATE INDEX` per generated statement and rejects `ALTER`, `UPDATE`, `INSERT`, `DELETE`, `DROP`, and `REPLACE`.
- [ ] Define `proofVersions` with composite owner/goal/proof foreign keys, immutable version uniqueness, visibility, rich kind, and payload fields. Do not alter `proof_items`.
- [ ] Define `proofReviewEvents` with owner/goal/proof/version scope, unique mutation IDs, monotonically queryable timestamps, terminal state, validator identity, outcome, and sanitized reason JSON.
- [ ] Define `userSkillProjections` as a replaceable cache keyed by `(userId, goalId, skillId, audience)` where audience is `internal` or `public`.
- [ ] Add composite unique indexes required as foreign-key parents on legacy `proof_items`, `proof_assets`, and each new immutable table. Give `proof_versions.asset_id` a composite `(user_id, proof_id, asset_id)` foreign key so a version cannot bind another owner's asset. Ensure Drizzle produces no data mutation statements.
- [ ] Run `npm run db:generate`; rename only the generated SQL tag to `0004_proof_backed_stack` if Drizzle chose another suffix, and keep journal/snapshot metadata synchronized.
- [ ] Add SQLite tests that accept the same version/review/projection IDs for different owners, reject cross-owner and cross-goal references, reject duplicate `(proofId, versionNumber)`, reject cross-proof review references, reject cross-owner asset references, enforce idempotent mutation IDs, and preserve every pre-0004 table column/index/foreign-key snapshot. Legacy root proof IDs remain globally unique because the v7 primary key is unchanged.
- [ ] Run `npm run test:unit -- tests/db/proof-ledger-migration.test.ts tests/db/migration-safety.test.ts tests/db/schema.test.ts`; expect all database tests to pass.
- [ ] Stage with `git add db/schema.ts drizzle tests/db`.
- [ ] Commit with `git commit -m "feat: add proof ledger schema"`.

## Task 5: Expand the proof repository without breaking v7 assets and shares

**Files:**
- Modify: `app/server/proof/repository.ts`
- Modify: `app/server/proof/d1-proof-repository.ts`
- Modify: `tests/server/d1-proof-repository.test.ts`

- [ ] Extend the fake D1 harness to support `all`, `batch`, and transactional call inspection, then write failing owner-isolation tests for loading a ledger workspace.
- [ ] Add repository commands for resolving the active owner goal, loading versions/reviews/projections, finding a mutation replay, atomically appending a version plus events, and replacing cached projections.
- [ ] Keep existing `getOwnedProof`, asset, and share methods intact. Add `getOwnedProofSnapshot(userId, proofId)` that returns the latest ledger version or falls back to the legacy row.
- [ ] Parse every JSON column with a bounded Zod schema. Treat malformed stored JSON as repository unavailability, not as empty evidence.
- [ ] Bind `userId` and `goalId` in every new query. Assert this in tests by inspecting SQL and bound values.
- [ ] Persist a create/revision transaction in this order: legacy root with `verified = 0` if absent, immutable version, append-only review events, internal projections, public projections, idempotency response.
- [ ] Add tests proving a failed batch leaves no partial version, review, or projection writes; an identical mutation replays; a conflicting base revision fails; and v7 upload/download/share lookup still reads legacy rows.
- [ ] Run `npm run test:unit -- tests/server/d1-proof-repository.test.ts tests/server/proof-storage.test.ts`; expect all repository and storage tests to pass.
- [ ] Stage with `git add app/server/proof tests/server/d1-proof-repository.test.ts`.
- [ ] Commit with `git commit -m "feat: persist owner scoped proof versions"`.

## Task 6: Implement the proof service and deterministic validator registry

**Files:**
- Create: `app/server/proof/service.ts`
- Create: `app/server/proof/validators.ts`
- Modify: `app/server/proof/storage.ts`
- Create: `tests/server/proof-service.test.ts`
- Create: `tests/server/proof-validators.test.ts`
- Modify: `tests/server/proof-storage.test.ts`

- [ ] Write failing service tests for unaffiliated owner, malformed input, create, revise, mutation replay, stale revision, withdrawal, visibility change, and repository failure.
- [ ] Implement `ProofService` with the same error discipline used by Planning: `NOT_FOUND`, `CONFLICT`, `INVALID_INPUT`, and `UNAVAILABLE`, with no raw database errors crossing the boundary.
- [ ] Resolve owner and active goal from the repository. Ignore any `userId` or `goalId` supplied in unknown request keys by rejecting the strict request schema.
- [ ] Implement structural validation that checks skill membership, Daily Unit linkage, title/summary bounds, exactly one of public HTTPS URL or owned asset when the kind requires an artifact, and artifact-kind consistency.
- [ ] Add `application/json` to the passive upload allowlist and implement a bounded 256 KiB JSON reader over an owned R2 object. Continue rejecting HTML, JavaScript, executables, empty files, and oversized files.
- [ ] Implement a closed validator registry. Goal 1 registers only `proof.test-report.v1`; it reads an owned `application/json` asset and requires schema version `arc.test-report.v1`, a non-empty command, `exitCode === 0`, `passed > 0`, and `failed === 0`. Unknown validator keys return `unavailable`.

```ts
export const deterministicValidators: Readonly<Record<string, DeterministicValidator>> = {
  "proof.test-report.v1": async ({ version, asset, readJsonAsset }) => {
    if (version.kind !== "test_report" || !asset || asset.contentType !== "application/json") {
      return { outcome: "failed", reasonCodes: ["test-report-json-required"] };
    }
    const report = testReportSchema.safeParse(await readJsonAsset(asset.objectKey));
    if (!report.success) return { outcome: "failed", reasonCodes: ["test-report-invalid"] };
    return report.data.exitCode === 0 && report.data.passed > 0 && report.data.failed === 0
      ? { outcome: "passed", reasonCodes: [] }
      : { outcome: "failed", reasonCodes: ["test-report-failed"] };
  },
};
```

- [ ] On `save_draft`, append `drafted` and perform no promotion. On `submit`, append `submitted` with `pending_review`, run structural checks, append `demonstrated` when they pass, and append `verified` only when the selected registered validator returns `passed`. A failed validator appends `rejected`; unavailable stops at `demonstrated`.
- [ ] Recompute both internal and public projections from the complete canonical ledger after every mutation. Never increment or decrement cached status directly.
- [ ] Add tests proving completion cannot call a validator, AI-like validator keys are unavailable, a rejected strongest proof downgrades to the next valid proof, public privacy changes do not alter internal status, and repository errors preserve the previous state.
- [ ] Run `npm run test:unit -- tests/server/proof-service.test.ts tests/server/proof-validators.test.ts`; expect all service tests to pass.
- [ ] Stage with `git add app/server/proof tests/server/proof-service.test.ts tests/server/proof-validators.test.ts tests/server/proof-storage.test.ts`.
- [ ] Commit with `git commit -m "feat: review proof deterministically"`.

## Task 7: Expose bounded proof workspace and mutation APIs

**Files:**
- Create: `app/contracts/proof-api.ts`
- Create: `app/server/http/proof-route-factories.ts`
- Create: `app/api/proofs/workspace/route.ts`
- Create: `app/api/proofs/route.ts`
- Create: `app/api/proofs/[id]/versions/route.ts`
- Create: `app/api/proofs/[id]/withdraw/route.ts`
- Create: `app/api/proofs/[id]/visibility/route.ts`
- Create: `tests/contracts/proof-api.test.ts`
- Create: `tests/api/proof-ledger.test.ts`

- [ ] Write failing route tests for authentication before body parsing, bounded bodies, strict schemas, owner isolation, rate limiting, idempotent responses, conflicts, and sanitized error shapes.
- [ ] Define response contracts as `{ workspace }` for GET and `{ result }` for mutations. Return `409 CONFLICT` with `action: "refresh"` and `503 UNAVAILABLE` with `action: "retry"`.
- [ ] Factor one route factory with a 1 MiB body cap, request IDs, response safety headers, operational event recording, and separate rate-limit scopes for create, revise, withdraw, and visibility.
- [ ] Wire production dependencies to `D1ProofRepository`, `ProofService`, `requireArcUser`, `D1RateLimiter`, and the existing operational event sink.
- [ ] Ensure path IDs are validated before repository access and use the same 404 body for unknown, foreign-owner, and invalid proof IDs.
- [ ] Run `npm run test:unit -- tests/contracts/proof-api.test.ts tests/api/proof-ledger.test.ts`; expect all API tests to pass.
- [ ] Stage with `git add app/contracts/proof-api.ts app/server/http/proof-route-factories.ts app/api/proofs tests/contracts/proof-api.test.ts tests/api/proof-ledger.test.ts`.
- [ ] Commit with `git commit -m "feat: add proof ledger api"`.

## Task 8: Add client and hook parity for local and cloud workspaces

**Files:**
- Create: `app/lib/proof-client.ts`
- Create: `app/lib/use-proof-ledger.ts`
- Create: `tests/lib/proof-client.test.ts`
- Create: `tests/lib/use-proof-ledger.test.tsx`

- [ ] Write failing client tests for credentialed requests, strict response parsing, body/response byte limits, standardized Arc API errors, and each mutation path.
- [ ] Implement `ProofClient` with `loadWorkspace`, `createProof`, `reviseProof`, `withdrawProof`, and `setVisibility`.
- [ ] Write failing hook tests covering guest local load, authenticated cloud load, identity switch, stale response suppression, one in-flight mutation, offline-cloud read-only fallback, mutation replay, and retry.
- [ ] Implement `useProofLedger({ planningWorkspace, legacyProofs })` following `usePlanningWorkspace` identity-generation and lifecycle-token patterns. Do not share refs or mutation state between hooks.
- [ ] Merge planning completions and legacy completion records into a derived projection on read; do not write synthetic review events for them.
- [ ] Expose `source`, `recovery`, `workspace`, `projections`, mutation methods, and `retry`. Recovery values are `none`, `session-expired`, `conflict`, `unavailable`, and `version-unavailable`.
- [ ] Run `npm run test:unit -- tests/lib/proof-client.test.ts tests/lib/use-proof-ledger.test.tsx`; expect all client/hook tests to pass.
- [ ] Stage with `git add app/lib/proof-client.ts app/lib/use-proof-ledger.ts tests/lib/proof-client.test.ts tests/lib/use-proof-ledger.test.tsx`.
- [ ] Commit with `git commit -m "feat: synchronize proof workspaces"`.

## Task 9: Upgrade Today to state the truthful evidence transition

**Files:**
- Modify: `app/components/today/adaptive-today-session.tsx`
- Modify: `app/today/page.tsx`
- Modify: `tests/components/adaptive-today-session.test.tsx`
- Modify: `tests/pages/today.test.tsx`

- [ ] Add a failing component test that completes all required steps, records `completed`, and expects the message `Completed. This skill is now practicing; add proof to demonstrate it.` plus a link to `/proof`.
- [ ] Add a failing test that a failed planning mutation shows no status promotion language and retains the existing recoverable error.
- [ ] Replace the current completion success sentence with the locked truthful copy and a Proof link. Keep candidate-plan handling and button guards unchanged.
- [ ] On the legacy Today path, keep redirecting to Proof but ensure its local completion is presented as practicing rather than locally verified.
- [ ] Run `npm run test:unit -- tests/components/adaptive-today-session.test.tsx tests/pages/today.test.tsx tests/lib/demo-store.test.ts`; expect all Today and compatibility tests to pass.
- [ ] Stage with `git add app/components/today/adaptive-today-session.tsx app/today/page.tsx tests/components/adaptive-today-session.test.tsx tests/pages/today.test.tsx tests/lib/demo-store.test.ts`.
- [ ] Commit with `git commit -m "fix: keep today completion truthful"`.

## Task 10: Replace the legacy Proof profile with a versioned evidence workspace

**Files:**
- Create: `app/components/proof/proof-workspace.tsx`
- Create: `app/components/proof/proof-editor.tsx`
- Modify: `app/components/proof/proof-profile.tsx`
- Modify: `app/proof/page.tsx`
- Modify: `tests/components/proof-profile.test.tsx`
- Create: `tests/components/proof-workspace.test.tsx`
- Modify: `tests/lib/proof-profile.test.ts`

- [ ] Rewrite the old failing assertions so `Verified locally` is forbidden and local completion appears as `Practicing`.
- [ ] Add failing workspace tests for empty state, create form validation, submission, demonstrated state, verified state, revision history, withdrawal, private/public toggle, pending mutation, conflict recovery, and inaccessible signed-out upload.
- [ ] Build `ProofEditor` with labeled native fields: title, artifact kind, summary, public HTTPS URL, linked skill, linked Daily Unit, visibility, and optional deterministic validator. Provide distinct `Save draft` and `Submit for review` native buttons plus an error summary with focus management.
- [ ] Render immutable version history with version number, submitted timestamp, state, validator reason, and a clear `Superseded` label. Never show raw object keys or validator payload JSON.
- [ ] Render four status labels exactly as `Exploring`, `Practicing`, `Demonstrated`, and `Verified`; explain that verification requires deterministic validation.
- [ ] Keep upload available only for signed-in cloud workspaces. The exact flow is: save a draft to create the proof root, upload an asset through the existing endpoint, then submit a new version that references the returned asset ID. Never mutate the draft version.
- [ ] Replace readiness calculations based on `ProofItem.verified` with projection-based counts. Define role readiness as the importance-weighted percentage at `demonstrated` or `verified`, and display verified count separately.
- [ ] Wire `ProofPage` to `usePlanningWorkspace`, `useArcState`, and `useProofLedger`. Preserve WorkspaceShell migration/recovery surfaces.
- [ ] Run `npm run test:unit -- tests/components/proof-profile.test.tsx tests/components/proof-workspace.test.tsx tests/lib/proof-profile.test.ts`; expect all Proof UI tests to pass.
- [ ] Stage with `git add app/components/proof app/proof/page.tsx app/lib/proof-profile.ts tests/components/proof-profile.test.tsx tests/components/proof-workspace.test.tsx tests/lib/proof-profile.test.ts`.
- [ ] Commit with `git commit -m "feat: build versioned proof workspace"`.

## Task 11: Add evidence-backed status to Stack

**Files:**
- Modify: `app/components/stack/stack-browser.tsx`
- Modify: `app/stack/page.tsx`
- Modify: `tests/components/stack-browser.test.tsx`
- Modify: `app/globals.css`

- [ ] Add failing tests that every skill displays one canonical status, completed-unit count, strongest active proof, latest use, and a next action.
- [ ] Add a failing regression test that category filtering still works and unresolved evidence IDs degrade to `Evidence unavailable` without exposing internal IDs.
- [ ] Extend `StackBrowser` props with projections and evidence summaries while keeping the blueprint as the source of skill names, importance, mastery criteria, prerequisites, and resources.

```ts
type StackBrowserProps = {
  blueprint: RoleBlueprint;
  projections: readonly SkillEvidenceProjection[];
  evidence: readonly ProofEvidenceSummary[];
};
```

- [ ] For each skill, render status, role importance, completed-unit count, strongest proof link to `/proof?proof={id}`, latest use date, and one deterministic next action: start Today for exploring, continue Today for practicing, add stronger proof for demonstrated, maintain evidence for verified.
- [ ] Keep claim confidence visually separate from learner status. Do not label claim freshness as learner verification.
- [ ] Wire `StackPage` to planning plus proof hooks with the same source/recovery boundaries as Proof.
- [ ] Add responsive CSS so the fact grid becomes one column below 720px, long proof titles wrap, focus rings remain visible, and no horizontal scroll appears at 320px.
- [ ] Run `npm run test:unit -- tests/components/stack-browser.test.tsx tests/pages/workspace-state.test.tsx`; expect all Stack and shell tests to pass.
- [ ] Stage with `git add app/components/stack/stack-browser.tsx app/stack/page.tsx app/globals.css tests/components/stack-browser.test.tsx tests/pages/workspace-state.test.tsx`.
- [ ] Commit with `git commit -m "feat: show evidence backed stack status"`.

## Task 12: Make public proof snapshots version-aware and privacy-safe

**Files:**
- Modify: `app/server/proof/public-view.ts`
- Modify: `app/api/proofs/[id]/sharing/route.ts`
- Modify: `app/api/public/proofs/[token]/route.ts`
- Modify: `tests/api/proof-sharing.test.ts`
- Modify: `tests/server/d1-proof-repository.test.ts`

- [ ] Replace the old failing `verified` share-field tests with the allowlist `title`, `kind`, `skillNames`, `status`, `summary`, `submittedAt`, and `versionNumber`.
- [ ] Define a strict versioned public snapshot schema containing `schemaVersion: "2026.08.1"` and no optional catch-all keys.
- [ ] Build snapshots only from the latest active public version and public projection. Resolve `skillNames` from the immutable flagship blueprint; never serialize raw skill IDs. A private, rejected, withdrawn, or superseded version is not shareable.
- [ ] Preserve immutable share behavior: revising or changing visibility never changes an existing stored snapshot. The owner must explicitly create a new share or revoke it.
- [ ] Sanitize stored snapshots again on public read. Reject legacy stored views containing non-allowlisted keys instead of leaking a partial object.
- [ ] Add tests that serialized output excludes owner email, user ID, goal ID, proof internal ID, asset ID, R2 object key, completion criteria, review reason payload, and strings named `prompt`, `modelInput`, or `aiFeedback`.
- [ ] Add a two-share isolation test: token A returns only snapshot A, token B returns only snapshot B, and substituting either token cannot expose the other owner's stored view.
- [ ] Keep constant 404 response shapes for malformed, missing, revoked, and privacy-ineligible tokens.
- [ ] Run `npm run test:unit -- tests/api/proof-sharing.test.ts tests/server/d1-proof-repository.test.ts`; expect all sharing tests to pass.
- [ ] Stage with `git add app/server/proof/public-view.ts app/api/proofs/[id]/sharing/route.ts app/api/public/proofs/[token]/route.ts tests/api/proof-sharing.test.ts tests/server/d1-proof-repository.test.ts`.
- [ ] Commit with `git commit -m "fix: publish safe proof snapshots"`.

## Task 13: Preserve v7 Proof, upload, asset, workspace, and migration behavior

**Files:**
- Modify: `tests/api/proof-assets.test.ts`
- Modify: `tests/api/workspace.test.ts`
- Modify: `tests/api/learning-events.test.ts`
- Modify: `tests/api/local-migration.test.ts`
- Modify: `tests/server/d1-cloud-repository.test.ts`
- Modify: `tests/lib/use-arc-state.test.tsx`
- Modify: implementation files only if a regression test proves a compatibility defect

- [ ] Add explicit regression assertions that a legacy workspace containing `verified: true` parses and loads unchanged but is adapted to at most `practicing` in the new UI.
- [ ] Add regression assertions that new v7 completion writes use `verified: false`, remain idempotent, and do not break the old workspace response schema.
- [ ] Run `npm run test:unit -- tests/api/proof-assets.test.ts tests/api/workspace.test.ts tests/api/learning-events.test.ts tests/api/local-migration.test.ts tests/server/d1-cloud-repository.test.ts tests/lib/use-arc-state.test.tsx`; expect all selected v7 regressions to pass.
- [ ] If any regression fails, make the smallest compatibility-adapter change, rerun the failing file, then rerun the entire command above.
- [ ] Stage with `git add app tests/api/proof-assets.test.ts tests/api/workspace.test.ts tests/api/learning-events.test.ts tests/api/local-migration.test.ts tests/server/d1-cloud-repository.test.ts tests/lib/use-arc-state.test.tsx`.
- [ ] Commit with `git commit -m "test: preserve v7 proof compatibility"`.

## Task 14: Perform focused accessibility, responsive, and interaction QA

**Files:**
- Modify: `tests/components/accessibility-contracts.test.tsx`
- Modify: `tests/pages/workspace-state.test.tsx`
- Modify: `app/globals.css`
- Create: `docs/operations/v8-goal-1-uat.md`

- [ ] Add automated checks for form labels, error-summary focus, live mutation status, native button semantics, accessible version-history names, keyboard category filters, visible focus, and reduced-motion behavior.
- [ ] Add a rendered-width test fixture for 320px, 768px, and 1440px that asserts the Proof editor and Stack facts do not force horizontal overflow.
- [ ] Run `npm run test:unit -- tests/components/accessibility-contracts.test.tsx tests/components/proof-workspace.test.tsx tests/components/stack-browser.test.tsx tests/pages/workspace-state.test.tsx`; expect all focused UI tests to pass.
- [ ] Run `npm run dev` and keep the local server running for manual acceptance. Do not use a public URL.
- [ ] At 1440px and 320px, manually verify `/today`: complete required steps, confirm only `Practicing`, confirm the Proof link, and confirm no promotion after a failed save.
- [ ] At both widths, manually verify `/proof`: create link proof, see `Demonstrated`, revise it, inspect immutable history, withdraw it, confirm downgrade, and toggle public/private. If the local preview has authenticated D1/R2 bindings, also upload a valid `arc.test-report.v1` JSON report and confirm `Verified`; otherwise record that verified upload is covered by the automated service/API suites.
- [ ] At both widths, manually verify `/stack`: status, strongest Proof, latest use, and next action agree with Proof after each mutation.
- [ ] Verify keyboard-only operation, screen-reader labels, visible focus, zoom at 200%, and no horizontal scroll.
- [ ] Record each case, expected result, observed result, and screenshot filename in `docs/operations/v8-goal-1-uat.md`; leave the user acceptance result as `Pending user decision` until the user explicitly accepts.
- [ ] Stage with `git add app/globals.css tests/components/accessibility-contracts.test.tsx tests/pages/workspace-state.test.tsx docs/operations/v8-goal-1-uat.md`.
- [ ] Commit with `git commit -m "test: add proof backed stack acceptance guide"`.

## Task 15: Run the full engineering gate and update recovery documentation

**Files:**
- Modify: `docs/operations/v8-resume-checkpoint.md`
- Modify: `docs/superpowers/specs/2026-08-24-arc-v8-completion-program-design.md` only for factual status fields

- [ ] Run `npm run test:unit`; expect zero failed tests.
- [ ] Run `npm exec tsc -- --noEmit`; expect exit code 0 with no TypeScript errors.
- [ ] Run `npm run lint`; expect exit code 0 with no errors.
- [ ] Run `npm run build`; expect a successful production build.
- [ ] Run `npm test`; expect the build plus rendered HTML test to pass.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Run `git status --short`; inspect every changed or untracked file and confirm there are no generated runtime artifacts, local databases, secrets, `.env` files, or unrelated user changes.
- [ ] Run a local D1 smoke test by applying migrations `0000` through `0004` to a temporary SQLite database, insert two owners and goals, execute create/revise/reject/withdraw/privacy fixtures, and finish with `PRAGMA foreign_key_check`; expect an empty result.
- [ ] Re-run the focused owner-isolation and privacy suites: `npm run test:unit -- tests/db/proof-ledger-migration.test.ts tests/server/proof-service.test.ts tests/api/proof-ledger.test.ts tests/api/proof-sharing.test.ts`.
- [ ] Update the resume checkpoint with branch name, HEAD, exact completed gates, local UAT status, explicit production exclusions, and next action `User reviews Goal 1 local acceptance`.
- [ ] Update the four-goal program status from `approved/specification` to `Goal 1 implementation complete; local UAT pending` only if every automated gate above is green.
- [ ] Stage documentation with `git add docs/operations/v8-resume-checkpoint.md docs/superpowers/specs/2026-08-24-arc-v8-completion-program-design.md`.
- [ ] Commit with `git commit -m "docs: checkpoint proof backed stack"`.

## Task 16: Review, local acceptance, integration, remote backup, and cleanup gate

**Files:**
- No feature files unless review identifies a concrete defect

- [ ] Use `superpowers:requesting-code-review` to review the diff against the approved Goal 1 section and this plan. Resolve every confirmed P0/P1/P2 issue with a failing regression test first.
- [ ] Re-run `npm run test:unit`, `npm exec tsc -- --noEmit`, `npm run lint`, `npm run build`, `npm test`, and `git diff --check` after review fixes.
- [ ] Present the local acceptance URL and `docs/operations/v8-goal-1-uat.md` to the user. Stop at the user acceptance gate; do not infer approval from automated tests.
- [ ] After explicit local acceptance, use `superpowers:finishing-a-development-branch` to verify the clean branch and merge `codex/v8-proof-backed-stack` into local `master` without deploying.
- [ ] On local `master`, rerun `npm run test:unit`, `npm exec tsc -- --noEmit`, `npm run lint`, `npm run build`, and `npm test`.
- [ ] Show the exact outgoing commits with `git log --oneline origin/master..master` and ask for or use the user's standing approval before `git push origin master`.
- [ ] After a successful normal GitHub push, verify `git ls-remote origin refs/heads/master` equals local `master` HEAD.
- [ ] Remove only the verified clean Goal 1 worktree and delete only the merged local feature branch.
- [ ] Do not run production D1 migrations, write production R2 objects, save a Sites version, or deploy the public site in Goal 1.

## Final completion evidence

Goal 1 is complete only when all of the following are true:

- The local and cloud proof-ledger contracts parse the same workspace shape.
- Today completion shows `Practicing`, never `Verified`.
- Version and review history is immutable and owner/goal scoped.
- Deterministic projection passes downgrade, replacement, withdrawal, rejection, and privacy tests.
- Legacy `proof_items.verified` is not consulted for new status projection.
- Proof and Stack agree on status and evidence at desktop and mobile widths.
- Public snapshots pass the explicit private-field exclusion suite.
- Migration `0004` is additive and passes local SQLite foreign-key smoke tests.
- All unit, lint, build, rendered HTML, accessibility, v7 regression, security, and privacy gates are green.
- The user explicitly accepts local UAT.
- The accepted work is merged locally, backed up to GitHub with a normal push, and the clean worktree is removed.
- Production remains unchanged and Goal 2 has not started.
