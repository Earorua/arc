# UI Task 2 independent SPEC review — FAIL

Base: `f875d2184033fe64a94b08d02d2fbfed61780143`. Reviewed 2026-11-08. No tracked files edited by this reviewer.

## P1 — The required material-only branch is unreachable from actual cloud responses

Location: `app/components/workspace/plan-diff-review.tsx:48`.

The new branch requires `proposalEvent.materialContextFingerprint`. However, `PlanningService.clientWorkspace` deletes this field from every material `agent_replanned` event (`app/server/planning/service.ts:454-460`). Both the proposal response (`:412`) and workspace reload (`:129`) use that sanitizer. The material workspace flow invokes `planning.retry()` after proposing (`app/components/materials/material-workspace-panel.tsx:58`), so the actual reviewed workspace has no marker.

Confirmed with an ignored probe using real MaterialContextService, D1PlanningRepository, PlanningService, then server-rendering PlanDiffReview from BOTH public responses. A first material adoption with no priority changes produces a genuine proposal; full ordered path units, planning date, complete days and completion date all match active. Both public workspaces omit the marker and render generic `接受新安排` / `保留当前安排`, without the required explanation. Material-specific success text is consequently unreachable too. The new reducer-only component fixture bypasses this public boundary.

Required repair: align UI classification with an explicit privacy-safe public material-proposal indication that survives both response paths, and add service-backed coverage for the notice and labels after proposal and reload. Preserve private-history independence, full-path/schedule checks and ordinary no-change behavior. Do not infer solely from the seven-day diff or private history. This finding is separate from the server replay-warning fix.

## Independent checks

- Focused existing suites: 28/28 passed (materials-plan-diff 14, plan-diff-review 8, basic-time-edit 6). Run `context-adoption-ui-spec-20261108-focused-review`; log SHA-256 `87f4fb6dfe1260caa65506a868f21ac5b4f0fb0f942ce2e52bd0f42318c9822f`.
- ESLint on the two UI/test files: exit 0. Run `context-adoption-ui-spec-20261108-eslint-review`; empty log SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- EOL-aware scoped `git -c core.whitespace=cr-at-eol diff --check`: clean.
- Service-to-render probe: 1/1 failed, four expected-copy assertions fail across proposal response and reload. Run `context-adoption-ui-spec-20261108-service-public-compact-review`; log SHA-256 `0f7fecd6db0aa7bc296218ce72de2d4ea347d1d1d28339f5b3ca97080d70ce52`.
- All Node commands used the required grounded-verification wrapper; all reported nonLoopbackDenials 0. No browser, global suite, model, deployment, migration, push, or Gate claim.

Other inspected UI requirements hold for a workspace containing the marker: exact notice/buttons/success copy, explicit acceptLabel, click-only current-candidate callbacks, pending disabled actions, failure alert/retry, unchanged full-path comparison (including outside-week reorder), preserved uncertain-skill notice and unchanged MaterialHistory owner/race implementation. No additional actionable UI finding.

## Exact reviewed hashes

| File | SHA-256 of working-tree bytes | Git blob hash |
| --- | --- | --- |
| app/components/workspace/plan-diff-review.tsx | `fe6633d76107918f33008123801db0af3b61127ae9f2bc4108ae144173f875a6` | `3d074cff767a93a9cf41a3e9aa34e2a1304afd15` |
| tests/components/materials-plan-diff.test.tsx | `f4822c1c8a4255bf79a05b4a8607da3124db1a0818ff4ca473891ad2681f9baa` | `dda1f95336f6019e802105cb7c00ad6594334034` |
| app/server/planning/service.ts (relevant public boundary) | `db9b9b98ac2a5145ca7e745711105c91bf3e2e55cd80cc3f600377f013c87d71` | not required for UI scope |

Reproduce the isolated finding:

```powershell
node work/grounded-verification/run.mjs context-adoption-ui-spec-20261108-service-public-recheck node_modules/vitest/vitest.mjs run --config work/grounded-verification/context-adoption-ui-spec-20261108-service-public-probe.config.ts
```

Probe and config are ignored, uniquely named `context-adoption-ui-spec-20261108-service-public-probe.test.ts` and `.config.ts` under `work/grounded-verification/`.
