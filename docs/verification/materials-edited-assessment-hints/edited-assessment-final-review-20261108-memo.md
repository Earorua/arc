# Edited assessment hints — final independent integration review

Reviewed 2026-11-08 in `C:/Users/XF/.codex/worktrees/materials-replan-recovery/ui-warm-precision`.

## Verdict

**PASS for the bounded offline edited-assessment-hints batch at source commit `113a9c5775433b8a07006c20b8ebab5809954f8c`.** No actionable Critical, Important, or Minor finding remains within the approved plan. The implementation, repaired failure cases, final full-gate evidence, and reviewed report agree. This source is ready for root's local evidence archive and documentation closure.

This is not release approval, a new course-reference approval, or a claim that the continuing materials goal is complete. Archive creation and its final count/hash/link/status fields remain root's next mechanical step; this memo does not claim those future writes have already occurred.

Integration base: `80546d0`. Task 1 was separately approved and saved at `7fbb79abac39a02be1933782fe83250d466975e8`. Checkpoint `32528d541215aa407d6a26b28b26d641fee64bf5` and the subsequent failed action-repair identity retain their historical failure status. Their earlier green checks are not substituted for the repaired source's final results.

## Source and integration assessment

- The shared application module owns the existing pure quotation, personal-assertion scope, and proposed-level evidence rules. The worker continues to own source location, document-wide quotation context, statement-local reminder anchors, and requirement/review-point work. Direct diff inspection and the Task 1 structural evidence support the separation; the worker and quotation module are unchanged from the approved Task 1 commit.
- `retainedMaterialSelfAssessmentHints` remains a filter of original hints. It first checks fact existence, personal fact kind, and retained label membership, then revalidates grounded-v2 or user-origin facts against only that hint's own label and original level. It does not mint, promote, or restore suggestions. Untouched legacy/literal extracted summaries retain their prior behavior; editing a different fact does not reclassify them.
- `ReviewService.saveDocumentReviewDraft` still validates exact canonical original-hint identity and prior membership before semantic filtering. Projection comes from the validated stored extraction. User provenance, authentic source ranges, owner access, revision checks, active-source guards, atomic mutation receipts, and replay behavior are retained. Unsupported authentic suggestions are dropped while the legitimate edited fact saves. Source objects, extraction captures, and earlier confirmation records are preserved by the service tests.
- Both UI call sites pass the current projection. The confirmation view hides unsupported advice on the edit render, and `MaterialTextPanel` removes it from the queued save request. The actual panel/HTTP/service/SQLite probes confirm immediate removal while saving is gated and persistence through reload. Supported suggestions remain explicit-click actions; invalid edits make no adoption call and do not alter prior self-assessments.
- The finite semantic changes are supported by preserved failures and positive controls: the actor-local English `did not` correction, compatibility for direct Chinese short guidance, rejection of the demonstrated inability and nominal-plan predicates, and retention of technical dots inside `React.js`. Later unrelated future/denied activity remains distinct from a completed action. No arbitrary new language-grammar family was introduced during this integration review.
- The nine reminder-fixture corrections match the unchanged worker contract: a whole two-statement candidate can be locatable while not fitting inside the first statement's local personal anchor. Only reminder citations use the first complete statement; full compound facts still feed the shared predicate, direct worker adapter, retention, save, and UI checks. Independent exact-citation probes support this distinction. The full quotes were not relabeled schema-invalid.
- The batch adds or changes twelve non-documentation files: four added and eight changed. Contract, mapper, statement parser, context/planning policy, and unchanged original `materials-ai-flow.test.tsx` behavior remain outside its production delta. No experience-priority attribution, new production mention projection, learning-intent expansion, history rewrite, or automatic assessment adoption is included.

## Identity and evidence association

The reviewer independently ran the snapshot verifier before the final gates finished. Root ran it again after every full suite completed. Both matched all **999 non-documentation files in the current worktree and the clean copy**, with no non-documentation diff from the committed source. Snapshot capture HEAD `fcfb6cd` is the capture base, not the identity of the tested working-tree bytes; those bytes are now committed at `113a9c5`.

| Identity | SHA-256 |
| --- | --- |
| Final 999-file manifest | `24bf6586f377e79cacf7f65b73a43bd70c514a7bbebb08229ece9a30ce0446fa` |
| `edited-assessment-snapshot-20261108-b-results.json` | `beb650d7b3ea12f666dde5c60832a26274991839b21fab4f375a3572163b9a3e` |
| Shared evidence module | `cb07c50bfce3fd2554a5fb1b80ac4c672951d7994ce8605f4eb0a892a0836b70` |
| Quotation module | `03a77ad110f67b56b7f1d6f28facdf9c70a92d0e7cd152ecdad806967297516a` |
| Worker source-review evidence | `e0cbed00b6e2d49c12d4932fddd28457b33ab2a429e4471c711003db520a5ab6` |
| Final spec recheck memo | `97c5816c241061033f13d5cd4f52ba43b1de04e1623ae6ed604ab995b099c064` |
| Final quality recheck memo | `9f3785c3cdb2c8bc612bfe7c2673fe9b74aa5e447b8aa4463418725b47fc236c` |
| Author punctuation handoff | `c0fd9f5ff53485e8dc64a88edc356475a6145b86323448e7b94d96a6c7615b60` |
| Final root integrity result | `343074407d2a01cb0d4fdcfad47c52f3bbf36524a8e1aae0318808acb730107f` |

The final review audit checks all ten Task 2 source/test hashes against the independent freeze, all current native bundle-input hashes (**104 service inputs and 89 shared-rule inputs**), and the metadata/log hashes for **26 successful runs and four preserved failed runs**. It independently confirms that three copied failure probes differ from their originals only in the single exclusive-create output path; assertions and inputs remain byte-for-byte identical after that replacement is reversed.

Task 1 memos and their results remain associated with their original source hashes. The old shared-module hash from that pure-move stage is not presented as the final repaired module. The failed quality memo (`4088b90ede3416c1ffeccf2ce6a226ac7239211dac30f9d2a348db747011fc91`) and failed first spec recheck (`706e27270588c551605670d0a7043b6d92a589e23e7a4151234045a3cfd65d4b`) are unchanged.

## Final verification inspected

These are completed root/author/independent-review runs on their recorded identities, inspected and hash-checked by this final reviewer. The final reviewer did not rerun the behavioral suites. Counts overlap between focused and full runs and must not be added together.

| Check | Verified result |
| --- | --- |
| Full normal Vitest partition | 370 files, 9,176 passed |
| Explicit serial partition | 2 files, 50 passed |
| Research partition in original worktree | 2 files, 99 passed |
| Full Vitest union | **374 files, 9,325 passed** |
| Nine additional Node scripts | **290 passed, zero failed or skipped** |
| Complete TypeScript check | Exit 0, empty diagnostics |
| Complete ESLint check | Exit 0; zero errors, four existing warnings in unchanged Research tests |
| Production build in matched source copy | Exit 0 |
| Built rendered-page checks | 5 passed, zero failed or skipped |
| Author repaired regression | 1,525 passed in 20 suites |
| Root focused integration | 927 passed in 8 suites |
| Root short-guidance/action-boundary controls | 17 plus 18 passed |
| Final independent specification recheck | 1,027 passed in 10 suites |
| Final independent quality recheck | 998 passed in 9 suites; ten-file lint clean |
| Shared Node/workerd/baseline comparison | 81 cases, 81 native matches |
| Actual local workerd/D1/R2 service path | 24 cases, save/read/replay and source preservation checked |
| Actual panel/HTTP/SQLite path | Root flow passed; the independent failure-closure copies include eight actual flows |

The audit compares the exact suite-path union from the three completed full Vitest logs with `git ls-files tests` filtered to the normal configured `.test.ts`/`.test.tsx` inventory. All **374 paths appear exactly once**, with no omissions or overlap. The four ordinary-group exclusions and all nine additional Node scripts are explicit in the command record. Research ran in the original worktree; types/lint/build/render ran sequentially in `D:/CodexTemp/arc-edited-assessment-repaired-rspZeV/source`. Relevant focused configs replace `test.include` instead of concatenating base arrays.

Every checked wrapper record reports `nonLoopbackDenials: 0`; successful records have exit 0. Final full-unit log SHA is `13f3fa1ba15066b9a245aa31eb19da42c62db2a96e45347edd11992b5f203857`; additional Node log SHA is `70e48f3e829cddf22dd5bf061daa6c91335224d71b423ab3501d086e27cd2a1a`. All remaining exact log hashes and suite paths are in the audit result.

## Fresh checks performed by this reviewer

All Node executions used the required offline wrapper and unique labels:

```powershell
node work/grounded-verification/run.mjs edited-assessment-final-review-20261108-snapshot-01 work/grounded-verification/edited-assessment-snapshot-20261108-b.mjs --verify
node work/grounded-verification/run.mjs edited-assessment-final-review-20261108-evidence-audit-01 work/grounded-verification/edited-assessment-final-review-20261108-evidence-audit.mjs
node work/grounded-verification/run.mjs edited-assessment-final-review-20261108-evidence-audit-02 work/grounded-verification/edited-assessment-final-review-20261108-evidence-audit-02.mjs
```

The snapshot check passed (exit 0, denials 0), log SHA `a99595916ff6429990580ade5fec13a2cb763e39d82ec5998db5bac282036c97`.

**Audit-tool correction:** audit-01 failed because my checker incorrectly required both native JSON files to use literal status `PASS`. The existing service JSON uses `PASS`; the existing shared JSON deliberately uses `edited-assessment-shared-native-parity`, with `cases` and `nativeMatches` both 81. Its producing script asserts the runtime equality and prints `PASS` to the console. This was a reviewer schema assumption, not a product or evidence failure. The failed checker and log are preserved unchanged, no result file was emitted, and no product source, reference, expected observation, or earlier artifact was altered. Audit-02 uses each exact existing status contract and additionally checks observation counts and shared `nativeMatches`.

Audit-02 passed (exit 0, 381 ms, denials 0). Artifact hashes:

| Artifact under `work/grounded-verification/` | SHA-256 |
| --- | --- |
| Original `edited-assessment-final-review-20261108-evidence-audit.mjs` | `829e19e15d9f3b4c63986d5005f7c369dae600d55c412cae7716a15ca73d1634` |
| Failed audit-01 log | `a58a4c2ad4abd3393fd337e0a51e4672695c6fd3243e65effc02bf6c26c9a887` |
| Corrected `edited-assessment-final-review-20261108-evidence-audit-02.mjs` | `097e91dd0a8e14f89e8739e8f13c86892711513820d143c940ad09bf8f1a06c1` |
| Corrected audit-02 log | `f12e031e3a9939cf2d416546a1b805c6c9d0f7dba92b5621f40cd522b308861b` |
| `edited-assessment-final-review-20261108-evidence-audit-02-results.json` | `f103512ff664393d88f4918adcf77c0a8ea22ff8ed3736fe39ee0e13ab64aa4f` |

`git diff --check 80546d0 HEAD` passed; the source diff remained clean throughout review. Only uniquely named ignored review artifacts were written.

## Report and frozen boundaries

The reviewed report body is `docs/verification/2026-11-08-materials-edited-assessment-hints.md`, SHA `ca5ec61918014bfb44d5805454e27d26bd3d2c7a4491141f51052ef5770c689b`. The reviewed plan SHA is `e1291645978090d830c04127cd8fbc102f4e8d09f8a7ef3c5e979336b57e9e0c`. The completed command record is `edited-assessment-final-commands-20261108.md`, SHA `ecbe7a0094741af4c3e226e770738d35696a6cf4f1a31559d8202f0d366f4bf6`. The report accurately separates historical failed candidates from current evidence and leaves final verdict/archive fields pending for root. Subsequent status/archive-count/hash/link closure is expected to change the report/plan hashes; it is not a source change.

The audit independently rehashed all **26 frozen reference files**, the approved v2.1 specification (`5d978e38d1c3b4a85eb83327e800df2c561aef598a63edc6c61c433acba21822`), and all **85 current course-capture dependencies**. The course-binding check compares complete exported objects, inventory, and source content with the prior reference and proves the unchanged legacy evaluator still rejects the changed dependency binding. A new binding remains unapproved. The historical R2/P1 failures remain failures.

The report correctly leaves experience attribution/practice priority, the new production mention projection, course/task coverage, independent assessment-adoption persistence, the complete 14 native scenarios, fresh paid quality qualification, and release gates incomplete. The historical ledger remains 30 real inferences / USD 0.547151 / unsettled 0; this batch reports zero real inferences, cost, deployment, remote migration, and push. Synthetic provider responses and local native service fixtures are not real model calls.

No source or tracked documentation was edited by this reviewer. No behavioral suite, real browser session, model request, external network action, deployment, migration, commit, push, or subagent was performed by this reviewer. The reviewed parser families are bounded; this PASS is not an unrestricted natural-language grammar guarantee. Root owns archive verification, local documentation commit, and continuation of the active goal.
