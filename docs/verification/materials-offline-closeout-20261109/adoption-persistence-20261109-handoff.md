# Adoption reset implementation handoff

Date: 2026-11-09. Checkout: `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.
Branch: `codex/materials-replan-recovery-20261106`. Base HEAD: `820a98aa6e904048ed71719882c4967596fbdcb5`.

Implementation is frozen for root review. No commit, remote access, model call or deployment was performed. Root-owned dirty documentation was preserved. The paused materials release/model verification state remains unchanged.

## Owned changes

- `app/components/setup/adaptive-setup-flow.tsx`: exactly two added statements in the existing explicit “重新填写此岗位” handler: clear `reviewedSkills.current` and set `materialAuditAcknowledged` to `null`. All previous audit/time/target/draft/material-selection behavior is retained.
- `tests/components/material-adoption-persistence.test.tsx`: stable promotion of the definitive diagnostic into five tests. The optional adoption / manual override / remount / actual persistence case runs with both `grounded-skill-labels-v2` and current `source-skill-mentions-v3`. The other tests cover current skill matching and removed support, guided adoption preserving existing public project evidence, and the explicit reset regression. No diagnostic file writes, outcome globals or `any` types remain.

The full-flow fixture mounts the real setup/material components and calls real `MaterialContextService`, `PlanningService`, `D1PlanningRepository` and the existing SQLite-backed D1 helper. It asserts equality of submitted, frozen-context, directly persisted and reloaded audits. Document and selection transport metadata is synthetic and schema-validated. This is not HTTP planning transport coverage, ingestion/model acceptance, deployment acceptance or a full-repository gate. The public project URL is a synthetic fixture value; it is never fetched. No new provenance field, wire schema, gate, button, grammar or course change was introduced.

## Evidence

All Node processes ran through `work/grounded-verification/run.mjs`, which clears credentials and blocks external network. Every label and report path was checked unused before execution. Original diagnostic artifacts were not overwritten.

| Label | Scope | Result |
| --- | --- | --- |
| `adoption-persistence-20261109-red-01` | New permanent test, before production edit | 1 file, 5 tests, 4 passed / 1 failed, exit 1 |
| `adoption-persistence-20261109-green-01` | Same permanent test, after two-line repair | 1 file, 5 passed, exit 0 |
| `adoption-persistence-20261109-related-01` | Nine existing related component/server files | 9 files, 150 passed, 0 pending, exit 0 |
| `adoption-persistence-20261109-lint-01` | Both owned files | exit 0 |
| `adoption-persistence-20261109-types-01` | Existing root TS config via ignored derivative excluding `node_modules` and `work` | exit 0 |

Every run recorded zero non-loopback denials. Vitest runs print the existing Node experimental SQLite warning; no product/test errors remain in the GREEN evidence.

The permanent RED test fails on exactly the diagnosed expectations: the reset acknowledgment is still checked; Continue is still enabled; the later explicit unreviewed-to-uncertain action leaves TypeScript unseen. Both v2/v3 persistence paths and all other cases already pass before the production change.

Related scope: `tests/components/adaptive-setup-flow.test.tsx`, `setup-resume.test.tsx`, `materials-setup.test.tsx`, `material-confirmation-source.test.tsx`, `material-generation-recovery.test.tsx`; `tests/server/material-context.test.ts`, `material-generation-atomic.test.ts`, `material-confirmed-skill-labels.test.ts`, `material-generation-recovery.test.ts`.

Each test run uses a `-own-results.json` Vitest report alongside the wrapper `.json` and `.log`. Exact pre-/post-fix test and component copies are retained under the RED/GREEN label. `adoption-persistence-20261109-manifest.json` records SHA-256 hashes of the owned files and all evidence.

The production file already used CRLF in the base and retains that format. `git -c core.whitespace=cr-at-eol diff --check -- app/components/setup/adaptive-setup-flow.tsx` passes; ordinary `git diff --check` flags the existing CRLF convention on the two added lines. No whole-file normalization or mixed newline change was made.

Root remains responsible for spec/quality reviews, final clean-copy full gate, tracked documentation, and commit/save/pause.
