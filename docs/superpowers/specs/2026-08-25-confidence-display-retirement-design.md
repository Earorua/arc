# Arc v8 confidence display retirement design

**Date:** 2026-08-25  
**Status:** User-approved design; written-spec review pending  
**Scope:** Local `codex/v8-proof-backed-stack` branch only; no deployment

## 1. Problem

Arc currently presents a skill `confidence` percentage on Path, Stack, and `/intelligence`. The displayed value is not a learner score or an evidence-derived source assessment. The Flagship data maps role importance directly to fixed values (`core` 0.96, `strong` 0.90, `advantage` 0.82), so the percentage duplicates importance while looking more precise than its evidence supports.

This creates three product problems:

- learners can mistake blueprint confidence for personal mastery, Proof quality, or role readiness;
- the number adds visual weight without changing planning, Proof projection, Stack status, or readiness;
- `/intelligence` claims that confidence communicates trust even though the current value is not independently calculated from source quality.

## 2. Decision

Remove every learner-facing confidence label and percentage from Path, Stack, and `/intelligence`.

Retain `confidence` temporarily in the internal role data, the v8 intelligence schema, and the `/api/intelligence/flagship` response for compatibility. Treat the field as deprecated product metadata:

- it must not be rendered by product surfaces;
- it must not affect planning, scheduling, Proof status, Stack status, or readiness;
- no new product behavior may depend on it;
- a future intelligence-contract revision must either remove it or replace it with a defensible, source-derived model.

The Intelligence API itself remains in scope for Arc's long-term role-to-plan flow. This change retires only the unsupported percentage presentation, not the role-blueprint service or its future custom-role purpose.

## 3. User-facing changes

### Path

Keep the learner's self-assessment sentence and remove the adjacent `Blueprint claim confidence N%` sentence. The resulting copy reports only learner-provided calibration and does not imply verification.

### Stack

Remove the `Claim confidence` fact and its percentage from every skill entry. Preserve status, role importance, completed-unit count, strongest proof, latest use, next action, prerequisites, rationale, mastery criteria, and resource evidence.

### `/intelligence`

Remove the `Confidence` row. Rewrite the introductory sentence so it promises only what the page can substantiate: visible source attribution, observation date, and an explicit boundary between evidence and inference. Keep the skill, source, and observed-at rows.

### Proof

Do not change Proof. Its `demonstrated readiness` and verified-skill count remain learner-evidence metrics and are independent of blueprint confidence.

## 4. Data and API compatibility

The following remain structurally unchanged in this iteration:

- `SkillNode.confidence` in the v7 compatibility model;
- `RoleSkill.confidence` in the v8 intelligence schema;
- Flagship blueprint data and validation bounds;
- `/api/intelligence/flagship` response shape;
- D1 intelligence schema and migrations.

Add the same concise source-level deprecation note beside `confidence` in `app/domain/learning.ts` and `app/contracts/intelligence.ts`. The note must say that the field is compatibility-only, is not learner evidence, and must not drive product decisions. No wire-format rename, migration, schema-version bump, or endpoint version is included.

## 5. Layout and accessibility

This is a subtractive change. Existing hierarchy, focus behavior, semantic headings, responsive breakpoints, and keyboard interactions remain unchanged. Removing a Stack fact must not leave an empty definition-list cell or create horizontal overflow. Removing the Path span must leave a complete self-assessment sentence.

No replacement badge, tooltip, percentage, or qualitative confidence label will be introduced.

## 6. Error handling and data flow

No request, persistence, or error path changes. The browser continues to receive and validate the compatibility field where the existing contract requires it, but rendering components ignore it. Planning and Proof calculations continue to use their existing inputs.

## 7. Test strategy

Implementation will follow a red-green cycle:

1. Update focused component/page tests to require confidence copy to be absent from Path, Stack, and `/intelligence` while preserving the remaining information.
2. Run the focused tests and confirm they fail because current pages still render confidence.
3. Make the minimum production changes to remove the three displays, update `/intelligence` copy, and add the contract deprecation note.
4. Re-run focused tests, then the relevant page/component regression set.
5. Run TypeScript, lint, build, rendered-HTML checks, and `git diff --check` before reporting completion.

API contract tests must continue to prove that the Flagship response remains schema-valid and still carries the compatibility field. Planning and Proof tests must remain unchanged unless a test incorrectly couples those behaviors to confidence.

## 8. Non-goals

This change does not:

- create a new source-confidence algorithm;
- rename the API field or change its numeric values;
- enable custom-role adaptive planning;
- connect `/api/intelligence/preview` to plan generation;
- change learner readiness calculations;
- alter authentication, persistence, D1, R2, or production configuration;
- deploy or publish any artifact.

## 9. Future contract decision

When dynamic role research is implemented, Arc must not reuse the current fixed importance mapping as a trust score. The next intelligence-contract design must choose one of two explicit outcomes:

- remove `confidence` entirely when source attribution and freshness are sufficient; or
- replace it with structured evidence strength derived from documented inputs such as source tier, independent-source agreement, observation freshness, and review state.

That future decision requires its own specification and contract versioning review.
