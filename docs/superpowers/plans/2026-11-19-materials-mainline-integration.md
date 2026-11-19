# Materials integration with the current public application

Status: prepared offline; execution follows acceptance of the course coverage patch and the fixed native 14-case matrix. This document does not authorize a model call, remote migration or deployment.

## Scope and necessity

The materials branch contains the new private-material workflow, while `origin/master` contains later published English interface, ink/teal styling, quiet loading, brand/navigation and account-focus fixes. Local integration is necessary so publication does not revert those improvements. It does not require new courses, a broader language parser or another round of synthetic-model trials before the code is stable.

Use the existing worktree and `codex/materials-replan-recovery-20261106`. Preserve all unfinished files and accepted evidence. Read the current source index and recovery entry before execution; the November 19 fetched mainline is `60e7cb6`. A read-only merge preview found eight conflict paths, listed below; this is a preparation result, not an applied merge.

## Implementation sequence

1. Save the reviewed course patch and native collector/results in local commits. Check the actual tree is clean before the merge. Keep old reference assets and intermediate failure evidence unchanged.
2. Merge the already fetched `origin/master` locally without publishing. Resolve the setup/audit, plan review and path-page conflicts by retaining materials adoption/version protections and mainline interface/loading changes together. Resolve the two Research UI-test conflicts against resulting behavior, and the Research smoke-build identity conflict from the actual pinned inputs. Do not choose one branch wholesale or rewrite a baseline merely to pass.
3. Check materials-facing text against the established English interface. Translate interface labels where needed while preserving user-provided text, stored historical content and language-sensitive extraction/mapping rules. Keep current layout and styling. Any additional scope must correspond to a concrete integration defect.
4. Review the exact course dependency delta caused by integration. Mainline's inspected course change translates the role display name and today-summary labels, without changing registry teaching tasks. If that is still the complete delta, create a separate narrow binding for it, preserving the November 19 binding and all frozen references. Unexpected curriculum or dependency changes require inspection before binding.
5. Run only affected tests while resolving demonstrated integration failures. Once the integrated source is frozen and independently reviewed, run the standard full repository acceptance once, including Node checks without competing long-running work, types, lint, build and existing rendered checks. Retain the existing lint-warning boundary; do not raise timeouts or skip tests to obtain a pass. Reuse the native matrix if its runtime dependency closure is unchanged; if only display values differ, review and bind that exact delta. Rerun affected native cases only when a relevant behavior or shared harness changed.
6. Record the integrated commit, exact test commands/results and unresolved Gate items. Prepare a concrete new Kimi quality-evaluation authorization from the current code, fixed synthetic inputs, price/route/privacy verification and a bounded budget. Prior paid authorizations remain expired. Hosted B3/B4/B5, migration, publication and post-release verification follow their separate approvals.

## Known conflict paths

- `app/components/setup/adaptive-setup-flow.tsx`
- `app/components/setup/setup-flow.tsx`
- `app/components/setup/skill-audit-step.tsx`
- `app/components/workspace/plan-diff-review.tsx`
- `app/path/page.tsx`
- `scripts/build-research-executor-smoke.mjs`
- `tests/components/research-recovery-interaction.test.tsx`
- `tests/components/research-workspace-pages.test.tsx`

## Pass criteria

Materials entry, review, explicit adoption, replacement and deletion remain available with the current public interface. Existing progress and Proof protections remain intact. No unrelated published feature regresses, immutable reference checks remain enforced, and all standard final acceptance checks pass for the recorded integrated source. This is an offline integration pass, not Gate 1B or public-release approval.

Independent specification then quality review follows the existing subagent-driven plan. Reviewers reuse raw results and add a probe only for a specific uncertainty; documentation changes alone do not trigger repeated product test runs.
