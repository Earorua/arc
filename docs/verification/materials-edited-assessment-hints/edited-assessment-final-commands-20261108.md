# Root final verification commands

Working directory: `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.

Source commit: `113a9c5775433b8a07006c20b8ebab5809954f8c`. Source snapshot: `edited-assessment-snapshot-20261108-b-results.json`, 999 non-documentation files, manifest `24bf6586f377e79cacf7f65b73a43bd70c514a7bbebb08229ece9a30ce0446fa`. Snapshot captured working-tree source at documentation HEAD `fcfb6cd`; the captured source was then committed unchanged as `113a9c5`.

These are records of this run, not a replay script. The wrapper's output names already exist. Any future rerun must use new labels and new script output paths. Exit, duration, non-loopback denials and log hash come from each matching wrapper `.json`; a command listed here is not itself a pass result. All listed final commands completed with exit 0 and zero non-loopback denials. Full Vitest: 370 files / 9,176 tests plus 2 files / 50 tests plus 2 files / 99 tests = 374 files / 9,325 tests. Additional Node: 290 tests. Type, lint, build and rendered pages (5 tests) passed; lint retains four existing warnings and zero errors. Final acceptance is recorded separately in the report and archive manifest.

The wrapper is `work/grounded-verification/run.mjs`, SHA-256 `4a2fe29b3c5c0fd9c6ce06cfd436e86e8a9ef9daa8fada44e7c87021c5f28242`. It strips credentials/live settings and loads `work/materials-browser-handoff/block-outbound.cjs`, permits loopback only, and records denials. All commands below used that wrapper.

## Full Vitest partition in original worktree

The ordinary group excludes exactly four suites, each run once in one of the following two serial groups. These partitions collectively include the repository's normal Vitest suite. Research runs in the original worktree, not the source copy with its node_modules junction.

```powershell
node work/grounded-verification/run.mjs edited-assessment-full-unit-20261108-b node_modules/vitest/vitest.mjs run --maxWorkers=2 --exclude tests/server/document-diagnostic-pilot-host.test.ts --exclude tests/server/materials-supplement-collection.test.ts --exclude tests/server/research-cloud-smoke-composition.test.ts --exclude tests/server/research-executor-private-integration.test.ts

node work/grounded-verification/run.mjs edited-assessment-full-serial-20261108-b node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/document-diagnostic-pilot-host.test.ts tests/server/materials-supplement-collection.test.ts

node work/grounded-verification/run.mjs edited-assessment-full-research-20261108-b node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/server/research-cloud-smoke-composition.test.ts tests/server/research-executor-private-integration.test.ts
```

## Nine additional Node scripts in original worktree

```powershell
node work/grounded-verification/run.mjs edited-assessment-full-node-20261108-b --test --test-concurrency=1 tests/build/restricted-candidate-files.test.mjs tests/build/restricted-research-candidate.test.mjs tests/offline-uat/entry.test.mjs tests/offline-uat/http-clients.test.mjs tests/offline-uat/legacy-recovery.test.mjs tests/offline-uat/research-public-recovery.test.mjs tests/offline-uat/research-recovery.test.mjs tests/offline-uat/retained-compatibility.test.mjs tests/scripts/auth-tail.test.mjs
```

## Type, lint, build and rendered pages in the matched source copy

Each command ran with `ARC_LOCAL_GROUNDED_CHECKOUT` set to `D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source`, then removed in a PowerShell `finally` block. All four commands ran sequentially for that copy; the build completed before the rendered-page check. All 999 non-documentation source files match the snapshot; documentation may be updated after capture and is excluded from that source identity. The copy uses a node_modules junction. Ignored working probe fixtures are excluded, so intentionally invalid old work fixtures do not contaminate project types.

```powershell
$env:ARC_LOCAL_GROUNDED_CHECKOUT = 'D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source'
try { node work/grounded-verification/run.mjs edited-assessment-full-types-20261108-b node_modules/typescript/bin/tsc --noEmit } finally { Remove-Item Env:ARC_LOCAL_GROUNDED_CHECKOUT }

$env:ARC_LOCAL_GROUNDED_CHECKOUT = 'D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source'
try { node work/grounded-verification/run.mjs edited-assessment-full-lint-20261108-b node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next } finally { Remove-Item Env:ARC_LOCAL_GROUNDED_CHECKOUT }

$env:ARC_LOCAL_GROUNDED_CHECKOUT = 'D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source'
try { node work/grounded-verification/run.mjs edited-assessment-build-20261108-b scripts/run-vinext.mjs build } finally { Remove-Item Env:ARC_LOCAL_GROUNDED_CHECKOUT }

$env:ARC_LOCAL_GROUNDED_CHECKOUT = 'D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source'
try { node work/grounded-verification/run.mjs edited-assessment-render-20261108-b --test tests/rendered-html.test.mjs } finally { Remove-Item Env:ARC_LOCAL_GROUNDED_CHECKOUT }
```

## Root focused and real local-runtime checks

```powershell
node work/grounded-verification/run.mjs edited-assessment-root-focused-20261108-c node_modules/vitest/vitest.mjs run --maxWorkers=1 tests/lib/materials/retained-assessment-hints.test.ts tests/lib/materials/self-assessment-evidence.test.ts tests/server/document-source-review-evidence.test.ts tests/server/document-review-draft.test.ts tests/server/material-confirmed-skill-labels.test.ts tests/components/material-confirmation-source.test.tsx tests/components/materials-ai-flow.test.tsx tests/components/material-source-term-correction.test.tsx

node work/grounded-verification/run.mjs edited-assessment-root-guidance-20261108-repaired node_modules/vitest/vitest.mjs run --maxWorkers=1 --config work/grounded-verification/edited-assessment-guidance-20261108.config.ts

node work/grounded-verification/run.mjs edited-assessment-root-action-boundary-20261108-green node_modules/vitest/vitest.mjs run --maxWorkers=1 --config work/grounded-verification/edited-assessment-action-boundary-20261108.config.ts

node work/grounded-verification/run.mjs edited-assessment-root-ui-20261108-repaired node_modules/vitest/vitest.mjs run --maxWorkers=1 --config work/grounded-verification/edited-assessment-root-ui-20261108-repaired.config.ts

node work/grounded-verification/run.mjs edited-assessment-shared-native-20261108-c work/grounded-verification/edited-assessment-shared-native-20261108-repaired.mjs work/grounded-verification/edited-assessment-shared-native-20261108-c-results.json

node work/grounded-verification/run.mjs edited-assessment-root-native-20261108-repaired work/grounded-verification/edited-assessment-native-20261108-repaired.mjs work/grounded-verification/edited-assessment-native-20261108-repaired-results.json
```

The shared check compares current shared/worker outputs in Node and local workerd against explicit old-baseline observations. The native service check uses ephemeral local workerd/D1/R2 and actual ReviewService operations with synthetic candidate delivery, zero provider transport. The UI check uses actual MaterialTextPanel, HTTP route, service and SQLite persistence with synthetic provider response/transport. Each source, config and result is preserved in this batch's evidence; old RED versions are separate.

## Final source and frozen-reference checks

These ran after every full suite completed:

```powershell
node work/grounded-verification/run.mjs edited-assessment-final-source-check-20261108-b work/grounded-verification/edited-assessment-snapshot-20261108-b.mjs --verify

node work/grounded-verification/run.mjs edited-assessment-integrity-20261108-b work/grounded-verification/edited-assessment-integrity-20261108-b.mjs
```

The source check matched all 999 files in the working tree and clean copy to the snapshot. The integrity check matched 26 frozen reference files, the approved specification, and all 85 dependencies of the separately captured course reference. The earlier `edited-assessment-course-binding-20261108-a` used `work/grounded-verification/edited-assessment-course-binding-20261108.mjs`; its course capture bytes are still valid because this final check independently matches all 85 dependencies. Complete course objects remain unchanged, while the old evaluator still rejects the changed dependency binding. A new course reference is NOT approved by these checks.

Earlier intermediate full-unit/Node runs were canceled after a confirmed quality finding and are explicitly excluded from the final pass set.
