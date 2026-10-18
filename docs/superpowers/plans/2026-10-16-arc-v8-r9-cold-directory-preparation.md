# Arc v8 r9 Cold Directory Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement the local task, followed by independent specification and quality reviews. Retain the existing isolated worktree; no commits or installs are needed for these operational artifacts.

**Goal:** Repair the actual r8 preparation failure and release a locally verified fresh mock command without changing cloud behavior, user attendance requirements or secrets handling.

**Architecture:** Initialize the complete fixed runtime directory set at the attended preparation boundary. Keep exclusive creation of each observation, attempt and evidence file. Preserve all consumed r8 records and reconstruct their local failure using exact byte pins; reuse the one accepted closed-r6 historical reconstruction and require fresh native checks in the next actual invocation.

**Tech Stack:** Node 24, Windows PowerShell 5.1, existing immutable mock orchestration and fixed Wrangler 4.92.0.

## Evidence, authority and choice

The user supplied an actual r8 failure. The original invocation `0b67461d-9ede-4845-aeb4-6d0a351dbeb6`, PID20536, accepted the initial Enter, then its preparation child exited1 with drained output after25462ms. The immutable invocation and failure records exist. No observation request or cloud operation attempt exists. The diagnostic at `outputs/local-durable-executor-20261016/r8-preparation-failure-r1/diagnostic-result.json` executed the real local validation and `prepareObservation` prefix with all writes, child processes and network blocked. It reached `mkdirSync(observations/terminal-preactivation-20261016-r8, {recursive:false})` while the parent was absent. A separate real-filesystem reproduction returned `ENOENT`.

Root reconciliation SHA256 is `24bf1e73966432560a457f6a6701be6c6cc43d14fc40528f841d2da1e084d6b8`; complete83-file original inventory SHA256 is `a28cb43fb92d342d271b3b73cb2fed8400bd7afa2c0381d547f7208abadcecfd`. This is evidence for that command, not a global claim about Cloudflare.

Earlier static generation intentionally omitted runtime directories. `prepare.mjs` normally creates observations, clocks and receipts, but the attended preparation only creates terminal, handoffs and controls. The defect is a mismatch between those two initialization paths. Fixing only the first missing parent would leave clocks and receipts broken later. Creating missing folders manually inside consumed r8 would violate its immutable history. The selected fix shares the complete fixed directory initializer between both code paths, tests a cold filesystem, and uses a fresh r9. Standing implementation/deployment authorization covers this correction; no additional paid model request or purchase is authorized.

## Task 1: local initialization and fresh static successor

**Create:** `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/scenario-ops-r9/`

**Create local evidence:** `outputs/local-durable-executor-20261016/r9-integration-r1/`

**Read only:** consumed r1-r8, all accepted component and product builds, Root r8 reconciliation and original inventory.

- [ ] Write a failing real-filesystem regression before the fix. It must exercise initialization from a new empty directory, then exclusive observation leaf creation and exclusive clock/receipt writes. It must expose missing observations, clocks or receipts. Retain actual RED output.
- [ ] Add a narrowly scoped `runtime-directories.mjs` shared by `prepare.mjs` and `terminal-prepare.mjs`. The intended behavior is:

```js
const runtimeDirectoryNames = ['terminal', 'observations', 'clocks', 'receipts', 'handoffs', 'controls'];
export function ensureRuntimeDirectories(root) {
  for (const name of runtimeDirectoryNames) mkdirSync(resolve(root, name), {recursive: true});
}
```

The operational callers always pass their fixed `here`; no CLI override or new authority is added. Place the attended call after the existing owner, unused-state, original timing, shell entry and initial acknowledgement checks, before the invocation record. Retain `mkdirSync(observationLeaf,{recursive:false})`, all file `wx` modes and no retry behavior. Directory names must be fixed; do not accept names from runtime input. Test cold and existing empty parents, refusal on a file occupying a required parent, and duplicate observation/evidence refusal.
- [ ] Demonstrate that the real attended source calls the shared initializer at the validated boundary, and that its actual downstream local filesystem path can create the observation leaf and later clock/receipt files in an isolated fixture without cloud calls. Do not substitute an all-mocked pipeline for the cold-filesystem regression. Retain GREEN and focused unchanged terminal/pipeline regressions.
- [ ] Add a narrow `preparation-directory-failure.mjs` read-only loader for exact r8 history. Pin Root reconciliation, complete original inventory, original shell attempt/invocation/shell failure/local failure, template, entry, contract, preparation source, observation source, accepted material and Root reports, and the read-only diagnostic. Recompute record identity/pins, accepted initial acknowledgement, original unexpired package, child prepare-stage exit1/drain, missing observation/clocks/receipts/activation paths and empty controls/handoffs. Verify complete83-file set and bytes. Reject invented effects, altered originals, mismatched identifiers or newly appeared downstream artifacts. The loader must not import/reconstruct r8's entire cloud context; the new context still performs one accepted closed-r6 reconstruction.
- [ ] Bind the loader and all its proof inputs to `FIXED`, context, successor/material/preparation/template/baseline bindings and current-pin rechecks. No new opaque JSON boundary, historical timestamp renewal, missing-file fallback or generic caller override. Preserve exact existing original-r4 and superseded-reset-r1 boundaries.
- [ ] Derive static r9 only from reviewed r8 sources. Sequence is `20261016-r9`; current report/material/decision names change to r9 while historical r1-r8 paths and dates remain exact. Extend current report absence through r9. Preserve all nine roles, identities, artifacts, budget, observer18/0, exact PowerShell entry hash `750dec4f0749ca86c07ab478739ae9b896d3b9960c1e81764c6e0cc301583d09` and every timing constraint.
- [ ] Regenerate tool/source manifests, exact derivation diff, three static configs and nine deterministic launcher pairs. Include new helper/loader in complete source pinning. Static output must contain no runtime folders, templates, actual attempts, acceptances, cloud records, copied history or fabricated user timestamps. Tests use separate labelled fixtures only.
- [ ] Verify before/after original r8 files and directories unchanged. Report changed hashes, complete source coverage, actual test counts, RED/GREEN, validation timing and whether `3 * measuredValidationMs + 5000 < 110000`. No operational cloud call, credential read, install, commit, package generation or Root acceptance in this task.

## Task 2: independent review

- [ ] A fresh SPEC reviewer checks exact requirements, preserved history and real cold-filesystem regression against the consumed r8 defect. Review also the Root local helper drafts before they run.
- [ ] After SPEC passes, a distinct QUALITY reviewer checks safety, real filesystem behavior, duplicate refusal, source/pin coverage, recursive current report consumption and timing. Run focused independent tests. No source edits by reviewers.
- [ ] Root verifies exact reviewed files and accepted reports. Fix findings before release. Reuse accepted unrelated product/input tests.

## Task 3: Root local release checks and actual user handoff

- [ ] Root records distinct acceptance only after both reviews and exact proof verification.
- [ ] Execute the three existing local dry runs once for activate/admission-close/maintenance-close with exact new configs. They must make no cloud mutation.
- [ ] Generate one finite first-role template, then execute its complete `inspect` using the actual unchanged PowerShell bounded child function; it must finish within30000ms and produce no user invocation or cloud readiness.
- [ ] Include a local cold-filesystem boundary check before handoff: the initializer, exclusive observation creation, and clock/receipt paths must succeed from absent runtime parents in an isolated fixture, with duplicate refusal retained. No observation or user attendance from that fixture is operational evidence.
- [ ] Only then release the new r9 command. User personally confirms initial prompt within60s, waits for the second prompt, then enters C only at masked input. Never rerun consumed r8. Fresh native gates and activation occur only in that actual future invocation. Task15, restricted real Research and public release remain incomplete until their actual checks pass.

## Scope and validation limits

No paid provider requests. No production application changes. No new financial authorization. Do not create/reuse fake cloud evidence, extend timeouts, loosen ownership or no-retry checks, or infer live readiness from historical records. A local diagnostic timestamp replay is labelled and cannot become an operational gate. Existing public migration and restricted profile work remain accepted but undeployed where previously recorded.
