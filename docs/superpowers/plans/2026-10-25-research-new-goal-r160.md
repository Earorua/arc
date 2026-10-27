# Preserve saved plans when using new Research

> Inline execution with superpowers:executing-plans; no delegated reviews. Existing user authorization covers necessary fixes and preserving both plans with new Research as default.

**Goal:** Save the ready r159 Research package as a new default plan while preserving the current immutable workspace and all history. No model request, schema change, DNS change or public activation.

**Architecture:** Add an explicit Research-only `newGoal.previousGoalId` option to the planning generation contract. Resolve/validate the ready source and build the plan before a single D1 batch creates a new goal, archives the expected prior active goal, saves the workspace and its idempotency receipt. A stable owner/mutation-derived goal ID allows the same request to replay after a lost response, including after another goal becomes active. Existing first-plan and Flagship behavior stays guarded. The Build screen explains that the existing plan remains in history and requires selecting that option; retries retain the same mutation and prior goal.

**Tech stack:** TypeScript, React, Zod, existing Cloudflare D1 transaction batches, Vitest plus real SQLite adapter.

## Alternatives and decision

Changing the common setup before generation risks an empty default on failure. Overwriting the existing workspace would destroy immutable history. The atomic new-goal generation path preserves both and needs no database migration; use it only for a signed-in Research result with a confirmed existing workspace.

## Implementation

- [x] Add failing integration tests in tests/components/research-setup-activation.test.tsx: existing goal stays unchanged until explicit selection; new Research saves to a different active goal and old workspace remains readable; a failed batch rolls back; response-loss retry replays once; stale goal/another owner cannot be replaced.
- [x] Extend app/contracts/planning-api.ts and app/server/planning/repository.ts with the Research-only new-goal option.
- [x] In app/server/planning/service.ts, check deterministic target-goal replay first, verify expected active goal/workspace, validate the source, build, then issue one saveGeneration command. In d1-planning-repository.ts, guard the previous active owner/goal at INSERT, archive and activate within the same atomic batch, retain existing source/final receipt guards.
- [x] In app/setup/page.tsx, route the explicit new Research plan directly to planning.generate without mutable common-role activation. In adaptive-setup-flow.tsx, explain history preservation, add the new-plan checkbox, and retain a mutation ID for unchanged input retries. First-plan preflight stays unchanged.
- [x] Run the new focused tests RED, then GREEN; run relevant planning/cloud/setup suites and TypeScript, review only the changed code once, build a closed candidate.
- [x] Deploy the closed Site only, preserve the ready r159 package, use the normal UI to save once. Verify new default Today/Path after refresh, old saved history and exact source package. Record closure and cost. No new paid Research.

## Acceptance

The r159 package becomes the active default only together with its full workspace. Every prior goal, proof, completion and workspace remains. Failed or stale writes leave the old default active. Replays use one goal and one generation receipt. Account ownership and ready-source checks remain enforced. Evidence goes in outputs/local-resource-access-20261025/research-new-goal-r160 in the operational workspace.

Inline design check: scope is bounded to this saved-result handoff; no placeholders or source-policy changes. The user already selected preserving both plans and the new Research default, and authorized necessary modifications; no additional design/file approval is needed.

Completed 2026-10-25: 282 related tests and TypeScript passed, closed build contains 129 artifacts. Site version 371701fb-1d0e-4015-82bb-2837f2fda595 deployed and read back; Executor unchanged. One normal UI save created one new goal/workspace, preserved all earlier workspaces and records, and retained the same eight Research runs. Refreshed Today/Path show the new official sources; old Path and seven-day schedule remain readable in History. See operational research-new-goal-r160/plan-reconciliation.json and ui-verification.json. This completes this plan, not public migration or public Research activation.
