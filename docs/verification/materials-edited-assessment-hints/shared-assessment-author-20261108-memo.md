# Task 1 implementation handoff

Status: DONE. Scope: shared pure self-assessment evidence only, based on HEAD 80546d0. No commit, network/model calls, deployment, migration, or changes to ReviewService/UI/mention consumers. The 39dd86e grounded matcher was already verified and was not changed.

`supportsMaterialSelfLevelHint` accepts the exact candidate kind/level types, current text, and optional readonly labels. It returns false for null levels, requirements, and constraints. Personal headings, conceptual/guided/uncertain evidence, quote masking, per-term assertion scopes, and personal review-question helpers now live in app-only modules. Worker source location, detached-quote checking, requirement priorities/conflicts, curriculum gaps, and review-point construction remain in the worker. `groundSourceSelfLevelHint` is a thin adapter. Worker review checks use the shared core with the original document-wide quotation mask.

One bounded semantic correction was authorized by root after a preserved RED: the old past-action matcher accepted `I did not test SQL under supervision.` as guided. An actor-local `did not` guard now rejects that action, analogous build/configure actions, and fronted supervision. It preserves affirmative `did not only` and guided SQL evidence followed by a denied React action. Denied action and absent supervision both reject a guided hint; this task makes no experience classification or independent-ability inference.

Verification, all through `node work/grounded-verification/run.mjs UNIQUE-LABEL ...`, all with zero non-loopback denials:

| Label suffix (prefix `shared-assessment-author-20261108-`) | Exit | Result | Log SHA256 |
| --- | --- | --- | --- |
| red-01 | 1 | Typed false-return scaffold: 28 failed / 42 passed, 70 shared tests | 2ebd07c9ae68555367fa983134acfe356ad32872e1041ec197833d5c53c20a5e |
| extraction-01 | 0 | Moved existing rules without semantic changes | 34b89224678639ee8cf45bf2ff78dc881593c4c77f6cc2a0db48f6367feed73f |
| migrated-red-02 | 1 | 4 denied-action failures / 683 passed; all 614 existing source tests passed | 1e689cf0ac15e0d691198a0abc647f9dfc3cb447882d35ce476586e59a8c0bf1 |
| denial-red-03 | 1 | 8 failed / 448 passed; shared and worker denied-action regressions both red | 22dbfebcfb84e3907f0eb622d7c2a9a79a18194540425879c3aa6e0749ef3679 |
| green-04 | 0 | 4 files, 695 passed: shared 75, source-review 381, source-span 115, requirement 124 | 62f65c39502e52fb2f1a7c5f6407ea9d7067e9e5f9e7eef698c4f6aa25a0fb19 |
| types-05 | 0 | Scoped tsc, no diagnostics | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| lint-06 | 0 | Five changed source/test files, no diagnostics | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |

Each label has a `.json` outcome and `.log` under `work/grounded-verification/`. The scoped configs are `shared-assessment-author-20261108-vitest.config.ts` and `shared-assessment-author-20261108-types.config.json`; include arrays replace the base lists, and the type config includes worker-configuration.d.ts while excluding work. The mechanical extraction script is `shared-assessment-author-20261108-extract.mjs` (one-use; do not rerun after extraction).

Self-review: the assessment module is 195 lines. All exported helpers/constants are consumed by the worker; the new public function is also consumed by its adapter and shared tests. No large parser/regex duplication remains in the worker. The shared dependency chain is contracts, the existing grounded matcher, and quotation helpers; it has no worker/server/D1/environment/network dependency. Existing tests were not weakened; the worker test file adds six concrete regressions/controls. No source changes followed green-04, root's reported 1,008-test check, or root's 28-case Node/workerd parity check.

Changed-file SHA256 (workspace-relative paths):

| Path | SHA256 |
| --- | --- |
| app/lib/materials/self-assessment-evidence.ts | c134d3b6c41b20172368eb2a2b37277308019901a70cf7940f44e68308f587dd |
| app/lib/materials/quotation-evidence.ts | 03a77ad110f67b56b7f1d6f28facdf9c70a92d0e7cd152ecdad806967297516a |
| worker/document-executor/source-review-evidence.ts | e0cbed00b6e2d49c12d4932fddd28457b33ab2a429e4471c711003db520a5ab6 |
| tests/lib/materials/self-assessment-evidence.test.ts | 1edda4e384d4ead989e4211b1ec167758c036e5d666def6f4c2db6f81fd42cf0 |
| tests/server/document-source-review-evidence.test.ts | 3c8fca67073e888bba6f51cb4e41c542d5380cba362c55a03db34cd02a51c8a0 |
