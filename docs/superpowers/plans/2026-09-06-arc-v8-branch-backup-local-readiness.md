# Arc v8 development-branch backup and local readiness plan

> **For agentic workers:** Use the approved subagent workflow for bounded independent audits; root owns verification, documents and Git writes. Any implementation fix must use TDD, independent specification review, then quality/security review. This operational task does not require inventing code changes.

**Goal:** Back up the current development branch to GitHub and complete local migration, configuration and rollback preparation while OpenRouter live acceptance remains incomplete.

**Architecture:** Separate development-branch backup from master integration and live release acceptance. Preserve all existing source behavior, migrations and runtime configuration. Use local tracked-source inspection and isolated offline verification to produce a reviewable readiness record.

**Tech Stack:** Existing Git/GitHub CLI, Node, Vitest, TypeScript, ESLint, Vinext, SQLite and nonpersistent Miniflare/workerd D1; no dependency installation.

## Current authority and boundaries

The user accepted this route with **“按照你说的继续”**, after being offered development-branch GitHub backup followed by local release preparation. This supersedes the former sequencing requirement that every push wait for live acceptance, **only for backup of `codex/v8-openrouter-research-beta`**. It does not authorize master integration, PR creation, Sites candidate saving, production operations or deployment.

Starting checkpoint: clean `d59af3388cc2dbeb0a63dff2d8c0c2e96b8824b6` in the authoritative `.worktrees/v8-openrouter-research-beta` checkout. Confirmed remote is public `https://github.com/Earorua/arc.git`; current user has ADMIN permission. The two separately authorized Sol Research attempts returned 403 and consumed both allowances. No new authenticated Provider GET, Research, Repair, model switch, credential access or real-data inspection is included. Support material remains unsent and test-key revocation unconfirmed.

## Task 1: Verify the exact backup surface

**Read:** `.github/workflows/ci.yml`, `.gitignore`, tracked source/history, local hook metadata, remote ref and repository metadata.

- [x] Verify branch, clean starting HEAD, exact push destination and current remote refs. A failed network query is not evidence that a branch is absent.
- [x] Inspect publication scope for credential/private-data patterns, reporting only filenames/categories/counts. Never read ignored `.env*`, keys, live output directories or raw logs for this scan. The tracked `.env.example` may be inspected only as a template. Record scope and limitations.
- [x] Confirm committed push/PR workflows and Git hooks do not deploy; inspect repository webhook/Pages metadata without secret fields. Do not claim a complete audit of external GitHub Apps.
- [x] Run the full unit suite by itself, then nonincremental TypeScript, full lint, production build and rendered checks. Existing expected Fake/offline behavior does not prove live acceptance.

Commands from the authoritative worktree:

```powershell
npm run test:unit
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
git diff --check
```

The build uses only local placeholder bindings. No actual environment file exists in this checkout at preflight; only the tracked template was listed. Preserve production configuration and do not use Sites credentials/tools to perform this ordinary GitHub backup.

## Task 2: Save and verify the development-branch backup

**Modify:** `docs/operations/v8-resume-checkpoint.md`, the top status of `docs/superpowers/plans/2026-09-06-arc-v8-live-validation-and-backup.md`, this plan.

- [x] Record that Research is incomplete and branch backup is now independently authorized; root locally commits exact reviewed documents.
- [ ] Push only `HEAD:refs/heads/codex/v8-openrouter-research-beta` to `origin`, without force, tags or master updates. If the branch exists, first verify the push is a fast-forward; preserve independent changes.
- [ ] Verify remote branch SHA equals local HEAD and remote master remains unchanged. Confirm clean local status. Inspect whether any workflow was actually triggered; absence of a branch-push trigger is not a passing CI result.

```powershell
git push origin HEAD:refs/heads/codex/v8-openrouter-research-beta
git ls-remote origin refs/heads/codex/v8-openrouter-research-beta refs/heads/master
git status --short --branch
```

If Git transport resets, inspect remote state before retrying a possibly completed push. A per-command transport adjustment may be used; do not change global Git/network configuration or force updates.

## Task 3: Complete local readiness evidence

**Create:** `docs/operations/v8-local-release-readiness.md`.
**Read:** `drizzle/0000_beta_foundation.sql` through `drizzle/0006_research_health_indexes.sql`, journal/schema, source-consumed configuration, existing tests and recorded release architecture.

- [x] Independent migration audit: enumerate order/effects, seeded upgrade evidence, compatibility constraints and missing legacy coverage. Do not equate an empty-database smoke with a production-data migration rehearsal.
- [x] Independent configuration/rollback audit: list required variable/binding names, defaults and staged enablement; record backup/restore requirements and distinguish historical Sites version 9 from a freshly verified rollback artifact.
- [x] Execute the existing isolated real D1 smoke and record its exact scope, disposal and Fake-only provider boundary.
- [x] Write a local readiness report with verified facts, concrete remaining release gates and a backup/rollback runbook. No production backup/restore command is executed; no migration is rewritten.
- [x] Review the report against source and independent audit findings; specification review then quality/security review both READY with no P0/P1/P2 findings.
- Local delivery: verify the document diff and commit only the readiness report and its two progress records. Root's handoff reports the actual containing commit and clean status.
- [ ] After explicit public-destination/payload confirmation, ordinarily update the same backup branch. Re-verify remote SHA and unchanged master. While waiting, root may generate and verify a local Git bundle of the final branch; this does not substitute for successful remote verification.

```powershell
node tests/offline-uat/miniflare-smoke.mjs
git diff --check
```

## Completion boundary

Completion means a verified GitHub development-branch backup plus source-backed local readiness evidence. It does **not** mean Goal 2 live acceptance, Goal 3 Production Candidate, master integration, real OAuth/production storage validation, Sites candidate creation or deployment has completed. Report exact commit/remote verification and remaining gates without waiting for provider support to complete unrelated local work.

## Evidence

Root records actual results here and in the readiness report as tasks finish; unchecked items above are still pending.

- Fresh remote Git read and GitHub API agree: master `f6c3cddbe6d3f177f3681b355142daad84f2330e`; target feature branch absent before backup. Ordinary direct connections reset/timed out; a per-command use of the user's already enabled system proxy succeeded. No global Git or persistent network setting was changed.
- Repository public/admin confirmed; webhook list empty; Pages API returned 404 with admin access. The only checked-in workflow runs for master pushes or PRs and has no deployment step. Default hooks directory has no active hook files; relevant custom hook/push overrides are unset. External GitHub Apps are not fully audited by these observations.
- Root fresh unit suite: **137 files / 2,641 tests passed, 47.95 seconds, exit 0**. Nonincremental TypeScript, full ESLint, production build **5/5** and rendered/client checks **4/4** passed. Source is unchanged from `d59af33`; only this turn's documentation is being added. No dependency update was performed.
- Root actual isolated Miniflare/workerd D1: migrations **0000–0006**, **9 application steps + 5 atomic conflicts**, zero false success receipts and FK violations, nonpersistent, disposed, exit 0. Only Fake Provider data was used. This is fresh-final-schema evidence, not full populated-v7.2 migration or restore evidence.
- Independent audits distinguish minimal seeded `0004→0006` preservation from the missing comprehensive legacy upgrade/restore rehearsal. They also identify unconditional Research-table health queries, a broad `{}` cohort, provider-free GET reconciliation writes, and historical rollback artifacts requiring later verification. The readiness report will preserve these boundaries.
- Independent publication audit returned **READY, P0/P1/P2 0/0/0** for clean `304e0eff096cb5c8d37e17dc7a1ea5e53abf9b77`: 105 commits/431 unique blobs/164 paths through `d59af33`, then the three new documents and commit message. This is bounded static evidence, not an external Apps or runtime-secret audit.
- The first ordinary branch push was **rejected by automatic approval review before process creation**: it required explicit confirmation of public destination and full source/history payload. Root asked the user to confirm `https://github.com/Earorua/arc`, branch `codex/v8-openrouter-research-beta`, reviewed code/history and this round's readiness documents. No push occurred and no workaround was used. Local report preparation continues while this question is pending.
- Local readiness report complete with seven migration hashes, a source-backed configuration inventory, exact evidence limitations and the backup/rollback runbook. Its independent specification review corrected one doc-only P2 concerning flag-corruption wording, then returned **0/0/0 READY**; the subsequent independent quality/security review of the report and two progress updates returned **0/0/0 READY** without further findings. No product source, migration or production configuration changed.
