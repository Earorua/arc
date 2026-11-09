# Adoption reset specification review

Result: PASS for the frozen two-file implementation slice. No blocking specification findings. This is not the final full gate or release acceptance.

Reviewed on 2026-11-09 in C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision, branch codex/materials-replan-recovery-20261106, HEAD 820a98aa6e904048ed71719882c4967596fbdcb5. Read the required local SOURCE_INDEX and the root-supplied freshly verified GitHub master cache, mention-projection-routing-20261109-source-index.md. Review remained offline and source-read-only. Root-owned dirty documentation was preserved.

## Scope and requirements

- Production diff is exactly two additions at adaptive-setup-flow.tsx:257-258 inside the existing explicit restart handler: reviewedSkills.current.clear() and setMaterialAuditAcknowledged(null). The original navigation, audit, availability, target, scope, draft, build-attempt and saved-generation reset statements remain intact. No material-selection change, gate, button, schema, course or parser change was added.
- The reset regression begins with an adopted TypeScript guided level and acknowledged current resume. Restart restores unseen, unchecks the acknowledgment and disables Continue. The next explicit unreviewed-to-uncertain action updates TypeScript and SQL. The two state resets directly match the stale ref and resume-identity acknowledgment causes.
- Existing fact confirmation remains separate from optional capability adoption. Both exact grounded-skill-labels-v2 and source-skill-mentions-v3 permanent cases leave all initial levels unseen after fact confirmation, update only the explicit adoption target, preserve an unrelated manual level, then preserve a later TypeScript manual override through bulk uncertainty, remount, submit and real persistence.
- The current-match case checks zero, ambiguous and unique current blueprint matches, no callback before a click, and no action once the supporting item is removed.
- The public-project case retains evidence-typescript-1 and the original evidence payload while adopting guided, generating and reloading. Inspection confirms adoption spreads only levels; toAudit preserves original evidence IDs; MaterialContextService freezes request.audit, verifyGeneration checks the complete audit through the context fingerprint, PlanningService uses request.audit, and D1PlanningRepository serializes/reloads it. The v2/v3 cases directly compare submitted, frozen-context, stored and reloaded audits. No new provenance field is required.
- The five cases mount real setup/material components and call real MaterialContextService, PlanningService and D1PlanningRepository with the existing SQLite-backed D1 helper. DocumentsClient document/confirmation/selection metadata is synthetic and validated against endpoint contracts. There is no claim of complete HTTP planning transport, ingestion/model, deployment or release coverage.

## Evidence checked

All 21 entries from the author's manifest (two owned paths and 19 evidence artifacts) matched their SHA-256 values. Both RED and GREEN test snapshots match the current permanent test. The RED component's Git blob is 1597526af2653a5628f0304f08ca23e15d963b14, identical to HEAD. The RED-to-GREEN component diff is precisely the two authorized additions.

The raw RED report records 4 passed / 1 failed, with exactly the three intended soft failures: reset acknowledgment stays checked, Continue stays enabled, and TypeScript remains unseen after the explicit uncertainty action. The raw GREEN report records 5 passed / 0 failed. The saved related report records 9 files / 150 passed / 0 pending. The manifest's lint/types wrapper exits are 0. Those author runs were inspected, not rerun.

Fresh bounded independent check: adoption-persistence-spec-20261109-focused-01. Command: node work/grounded-verification/run.mjs adoption-persistence-spec-20261109-focused-01 node_modules/vitest/vitest.mjs run tests/components/material-adoption-persistence.test.tsx --reporter=default --reporter=json --outputFile=work/grounded-verification/adoption-persistence-spec-20261109-focused-01-own-results.json. Result: 1 file, 5 passed, 0 failed, 0 pending, exit 0, zero non-loopback denials. Its label and report paths were checked unused before execution. The complete log contains only the existing experimental SQLite warning in addition to successful test output.

Fresh git -c core.whitespace=cr-at-eol diff --check passed for the tracked slice. A separate no-index new-test whitespace check emitted no diagnostics (exit 1 is the no-index changed-content status). Production remains entirely CRLF (292 CRLF, zero bare LF); the new test is entirely LF. Final owned SHA-256 values still match the frozen manifest. Git status is unchanged from the review start.

## Boundaries

Only ignored review/run artifacts were written. No application/test source edit, commit, remote access, full-suite rerun, model call or deployment occurred. Root retains ownership of final full-gate execution, tracked documentation and save/pause decisions. The materials task's paused verification boundary is not advanced by this scope review.

Machine-readable hashes and fresh checks: adoption-persistence-spec-20261109-review-01-own-results.json.
