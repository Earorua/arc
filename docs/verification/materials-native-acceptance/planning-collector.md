# Native planning collector

The separately versioned `materials-native-planning-20261119-v1` collector implements the reviewed mapping in `planning-protocol.md`. The fixed first collection passed all 14 cases and 66 independent assertion groups on 2026-11-19. The detailed result index is `planning-evidence-20261119.json`; raw local observations are retained in `work/grounded-verification/native-planning-20261119-matrix-01`.

This is native service and contract evidence. The two initial self-assessment cases reuse the five accepted November 9 UI cases and then generate/reload a native workspace from the explicitly chosen audit. The batch-independent case calls the actual adoption contract. The five reused tests do not directly assert bulk-control absence; that citation gap is closed by the separate one-case [UI observation and correction](planning-ui-evidence-addendum.md). It does not claim a bulk-independent HTTP endpoint, a material-specific active-plan self-assessment edit, or verified competence. The accepted UI test file's bytes are checked against commit `2fad2850e447dd353c8d7a9587f114f60ce3dd01`.

## Inputs and boundaries

`planning-inputs.json` declares the fixed scenarios and synthetic documents independently of production outputs. `planning-worker.ts` records operations and snapshots. `check-planning.mjs` imports no application code and checks raw observations against the protocol. Neither tool imports the frozen planning cases or invokes their scorer; the original file is only hashed for preservation.

Each scenario gets a fresh local Miniflare D1 database and R2 bucket. Site migrations through `0015` run only in that database. The worker imports an empty, explicitly consented synthetic local goal through `CloudService.importLocalState`, creates text documents with document services, saves and confirms their reviews, then uses real selection, context, planning, completion and Proof services. Every existing-plan case contains a real completed task and nonempty `proof_items`, `proof_versions`, `proof_review_events` and `user_skill_projections` rows before the evaluated action.

Retained source terms and guided hints require an upstream extraction. Their explicitly synthetic extraction result and initial draft are imported before review save and confirmation. The import includes actual created document/text/version identities and source ranges, and is recorded in both `fixtureImports` and the operation trace. The synthetic upstream job identifier is provenance only: no provider, job execution or analysis consent is claimed. A separate source-bound unresolved review point is imported before the real blocked-confirmation attempt. No evaluated after-state is seeded.

All meaningful phases retain full workspaces, native D1 rows, local R2 source objects, service inputs/responses and attempted-call errors. Final snapshots instantiate fresh repositories and services. Document, review, selection, context, proposal and planning revisions retain their native identities. The checker verifies protected audit/source/goal/availability/target state, task contents and dependencies, historical DailyUnits, completion events and the four Proof tables; candidate/current context separation; explicit acceptance; prerequisite order; and actual daily budgets.

The deletion receipt is `cleanup-pending`. The run verifies revocation and failed reuse without claiming completed physical cleanup. Proof URLs use `https://example.com/synthetic-completed-task` and are never fetched. Miniflare rejects every outbound request; this run made zero attempts.

## Running

Run from this checkout with installed dependencies. Output names are restricted to the ignored `work/grounded-verification/native-planning-20261119-*` directory, and every write refuses overwriting. An existing run is evidence, including when it failed.

```powershell
node docs/verification/materials-native-acceptance/collect-planning.mjs --compile-only --output-name native-planning-20261119-compile-unique
node docs/verification/materials-native-acceptance/collect-planning.mjs --output-name native-planning-20261119-matrix-unique
node docs/verification/materials-native-acceptance/check-planning.mjs work/grounded-verification/native-planning-20261119-matrix-unique
```

Use `--cases case-id,case-id` only for diagnosed affected-case reruns. Partial runs are reported as partial and list every uncollected fixed category. The first full collection had no fixture or scenario failure and required no rerun. `native-planning-20261119-compile-01` is an earlier compile-only artifact and executed zero scenarios.

The manifest records input, worker source/bundle, collector/checker/protocol, complete imported source closure, local migration and runtime digests, the 26 frozen historical file hashes, and the exact reused UI file hash. An end-of-run digest check detects source drift. The recorded starting HEAD is `850b6be03a1da60eb8ee37d530f05a1b51af10ba` with the reviewed course-coverage patch present; those application bytes were subsequently committed by the parent task as `47b0e0a`. The bundle and closure hashes, rather than the timestamp of that commit, identify executed code.

Fresh validation: targeted worker TypeScript check passed; both Node scripts passed syntax checking; final targeted ESLint passed without warnings; local collection and independent checker passed 14/14. The old broad suites were not rerun. This result does not approve model quality, hosted runtime behavior, the complete Gate or publication.

## Direct validation command observations

These commands were direct `exec_command` tool invocations from `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`. Their console output and exit codes were observed in the conversation; no separate raw command-log file was saved. This section transcribes those existing observations without rerunning checks.

The targeted TypeScript command returned exit code **0**, with no diagnostics, after correcting two collector-only type errors (the earlier invocation of this same command returned **1** for an unavailable `DocumentKind` export and the JSON case-choice type).

```powershell
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --strict --module esnext --moduleResolution bundler --target es2022 --lib es2022,dom --resolveJsonModule --esModuleInterop --types node,@cloudflare/workers-types docs/verification/materials-native-acceptance/planning-worker.ts
```

The following combined PowerShell invocation returned exit code **0**. Both Node syntax checks emitted no diagnostics. The final ESLint process in that invocation reported zero errors and one anonymous-default-export warning; the warning was then corrected before collection. Individual exit codes for the first two subprocesses were not separately recorded.

```powershell
node --check docs/verification/materials-native-acceptance/collect-planning.mjs; node --check docs/verification/materials-native-acceptance/check-planning.mjs; node node_modules/eslint/bin/eslint.js docs/verification/materials-native-acceptance/planning-worker.ts docs/verification/materials-native-acceptance/collect-planning.mjs docs/verification/materials-native-acceptance/check-planning.mjs
```

The final standalone ESLint invocation returned exit code **0**, with no output, errors or warnings.

```powershell
node node_modules/eslint/bin/eslint.js docs/verification/materials-native-acceptance/planning-worker.ts docs/verification/materials-native-acceptance/collect-planning.mjs docs/verification/materials-native-acceptance/check-planning.mjs
```

The three evidence-producing commands below each returned exit code **0**. The first reported zero executed cases; the second reported 14 collected, zero failed and zero source drift; the third reported 14 passed, zero failed and zero not collected. Unlike the validation console output above, their manifests, raw observations and check result were saved in the named output directories.

```powershell
node docs/verification/materials-native-acceptance/collect-planning.mjs --compile-only --output-name native-planning-20261119-compile-01
node docs/verification/materials-native-acceptance/collect-planning.mjs --output-name native-planning-20261119-matrix-01
node docs/verification/materials-native-acceptance/check-planning.mjs work/grounded-verification/native-planning-20261119-matrix-01
```
