# Arc v8 observable terminal successor implementation plan

> For agentic workers: use superpowers:subagent-driven-development with independent specification then quality review. Continue existing local/mock authorization. Reuse this worktree; no commit or cleanup. Implementation and reviews are local only.

**Goal:** Prepare a new, reviewed r6 mock acceptance package after the r5 terminal failure, actual closure and independent delayed closed-state inspection, with finite terminal diagnostics.

**Architecture:** Derive static sources from frozen r5 into exclusive `scenario-ops-r6`. Retain the original schema/resources/job identities and historical evidence. Replace only the current closed-state reconstruction with the actual r5 close plus the independently collected current-state readouts; add the separately reviewed terminal diagnostics component. The independent inspection is a historical baseline input, never fresh dispatch authority or renewal of r5's expired recovery window.

**Stack:** Existing Node ESM, Windows PowerShell 5.1, pinned Wrangler and fixed Workers/D1/R2.

## Known facts and limitations

- r5's activation and complete post-activation/prestart checks succeeded. Its prepared record was written, then its shell recorded a generic failure 72 ms later. No acknowledgement, masked C input, signed control or LONG submission followed. The exact old exception cannot be recovered; do not claim the new diagnostic fixes that unknown cause.
- r5 admission and maintenance were subsequently closed. Last observed Executor version: `2430f2a5-5195-4595-b1ad-1f61f7bf6f5a`; Site: `c188e75d-9b44-460a-859d-00a89035f8ed`. Original recovery deadline `2026-10-14T15:48:59.463Z` expired without renewal. r5 remains permanently INCOMPLETE.
- Independent read-only rounds on October15 each completed 27 reads; complete mapping, all outstanding counts, global job/execution counts, empty primary Workflow roster and stable retained observer rows were checked. Two rounds and a separate95-second scheduled observation passed. No scheduled records in that interval does not prove permanent platform scheduler cessation.
- Input index: `outputs/local-durable-executor-20261015/r5-successor-input-index-r1.json`, SHA256 `7ef9037abb4132fbb3a57bc67fc90145427a918f41d1b520299e4d8ce363657f`. This is a local evidence index, not an acceptance or operational authority. Reconstruct underlying evidence rather than trusting its summary flags.
- User's real offline PS5 probe `local-handoff-probe-r2/user-result.json` passed child return and both Enter confirmations. Earlier probe timeout was a missed second prompt per the user. This establishes current local handoff capability only.
- Terminal diagnostic component is still under implementation/review. Its final Root acceptance must exist before integration; do not invent a hash or bypass it.

## Task 1: current closed-state reconstruction

Create local reconstructors/tests under `outputs/local-durable-executor-20261015/closed-r5-successor-r1/`. Root alone writes a subsequent distinct closed-state acceptance after final review. Preserve r5 source/records byte-for-byte.

- [ ] Test and reconstruct exact r5 activation, incomplete closure, maintenance-close operation and post-maintenance-close native gate using the original pinned r5 validators. Require successful single activation/close, confirmed child exits and the exact close version. Bind the old recovery hash and original deadline unchanged; explicitly record that it is expired and incomplete. Reject wrong operations, changed pins, inconsistent identity/version, missing close or unknown child completion.
- [ ] Reconstruct both independent readouts from their pinned native evidence/request files, not merely `current-state` or `inspection-result` summaries. Validate the complete fixed27-command set, success/exit/transport metadata, read-only D1 response flags, mapping against original schema and actual closed configs, and ordering. Verify referenced projections/config exports and fixed helper/source pins. Use recorded observation times for historical evaluation, not a new freshness timestamp.
- [ ] Recompute first/second mapping and scope, compare with stored projections, apply the existing `assertDrain` invariants relative to actual maintenance-close end. Require current Site/Executor mappings consistent, primary job/Workflow/receipt/control scope empty, all outstanding counters zero, no active lease or unmatched starts, and retained observer count18. Never reset observer rows; require actual successor headroom with `rowsUsed+206<=256` and recheck it in the fresh activation preflight.
- [ ] Verify scheduled metadata belongs to the fixed private Executor and separate original observer process, starts after second drain, closes successfully after95seconds, and has zero records. Keep `platformInvocationAbsenceProved=false` and `task15Accepted=false`.
- [ ] Verify consumed r5 shell/prepared/failure identities and absence of acknowledgement/readiness/handoff/control/receipt/roster/driver outputs; perform absence checks at exact `fixedRole` paths, not guessed file names. Do not make an unrecorded historical failure code mandatory or label it known. Inspect all previous report scopes as already required by original validators.
- [ ] Build one finite current-closed projection with pinned underlying evidence, actual versions/configs/Workflow latest mapping and retained observer capacity. Root acceptance and all freshness-sensitive dispatch gates remain separate. Tests reject mutated versions, incomplete readouts, wrong context/lineage, mismatched drain, new outstanding work, truncated observer, changed original recovery, later control output, fabricated user attendance or success claims.

## Task 2: new static r6 package

Directory: `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/scenario-ops-r6`; sequence `20261015-r6`.

- [ ] Snapshot all existing r5 files before derivation. Copy only reviewed static source/config inputs. Never copy templates, attempts, gates, observations, clocks, baselines, roster approvals, readiness, controls, receipts, driver reports or Root acceptances into new operational paths.
- [ ] Wire a new current-closed reader to the Root accepted Task1 evidence and preserve original schema acceptance separately. New `createValidationContext` must reconstruct history using original validators, not reinterpret independent observations as expired r5 gates. Prior r3 expiry/r4 authentication history remains historical. No generic recursive JSON exception; any byte-only historical snapshot requires an exact known path/hash and independent verification of its contents.
- [ ] Integrate the exact Root accepted terminal diagnostic bytes from `terminal-failure-diagnostics-r1`. Its finite projection must not alter guard behavior, leak arbitrary messages, pollute function success output or claim previous child metadata describes a later failed stage. Retain the masked C launcher and credential path unchanged except deterministic new package references.
- [ ] Update only current paths, reports, sequence and current provenance bindings. Every one of the nine current r6 report directories is checked before dispatch. Historical reconstruction does not reject its own legitimate historical operations or current results after dispatch. Retain explicit operation kind coverage including site-roster.
- [ ] Preserve24h first static package maximum,15min subsequent packages, initial Enter60s, preparation905s bounded by original invocation/package, strict native freshness,600000ms activation stage,5581000ms total, original shutdown/quiet/fault budgets, no retry/clock renewal and all input/child/validator reserves. User readiness remains actual Enter after the real native prestart gate; offline probe success cannot supply it.
- [ ] Generate complete static preparation, launcher contract/derivation, nine commands/wrappers, source diff, material manifest and implementation report using actual final pins. No operational templates or Root acceptance during implementation. A missing current-closed/component acceptance must refuse preparation.
- [ ] Focused regression tests cover Task1 history boundaries, all changed binding/path/report checks, real recursive validation, terminal diagnostics and existing PS5 scalar/deadline invariants. Record actual failures before fixes. Do not rebuild unrelated product UI or repeat unchanged broad product suites.
- [ ] Independent SPEC then QUALITY review final bytes. Resolve concrete findings; verify all original r5 bytes unchanged. Root accepts only complete reviewed static material and runs the three local configuration dry runs.

## Task 3: attended cloud mock acceptance

Root owns this after Task1/Task2 are complete. No start command until all materials/dryruns are ready and the user can attend. Generate the first immutable template last, then deliver only the new r6 command. Actual command must perform fresh native preactivation, baseline, one activation, postactivation/prestart, actual local Enter and masked C dispatch under original finite clocks. Any failure stops for reconciliation and closure; no automatic successor/retry.

Follow the original LONG quiet/status, both fault recoveries, replay/isolation and shutdown requirements. Local code and offline probes are not Task15 completion. Task16 still needs a concrete new one-shot model authorization; Task17 migration/public release remains separate. Public site, DNS and production data do not change in this plan.
