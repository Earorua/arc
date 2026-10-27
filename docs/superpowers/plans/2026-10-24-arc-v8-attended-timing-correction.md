# Arc v8 attended timing correction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this bounded continuation. Steps use checkbox syntax. The user has authorized continuing local preparation; no additional paid invocation is authorized.

**Goal:** Make the remaining isolated mock commands fit an explicit finite time budget, while preserving original clocks, one-use dispatch, masked secrets, complete late byte checks and observer cap 256.

**Architecture:** Derive new source in `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261017-snapshot/scenario-ops-r3` from immutable r2. Adjust local timing ceilings based on the measured r130 path. Do not modify r2, copy successful operation/review records, or activate the cloud during local implementation. Keep the previously accepted application tests and successful real Research evidence.

**Tech Stack:** Node 24.14.1, Windows PowerShell 5.1, existing fixed Task2 validators and unchanged masked control driver.

## Design decision and limits

The r130 measurement proves that the original 5-second fault overhead is insufficient: arming plus post-input validation alone took 6.429 seconds. Increasing only the whole-command limit leaves this independent failure unchanged. Reusing a process across every phase would require a new IPC lifecycle and is unnecessary for the measured defect. Use explicit larger finite local allowances and charge them to every affected stage.

The candidate is: start/status 205000 ms, replay 190000 ms, local control validation 20000 ms, fault arming/post-input 10000 ms, fault watcher 135000 ms from the **original attempt**. Each native preparation/evaluation gets 4000 ms, charged as 8000 ms total per native collection. No network collection, input, child-close, freshness, package-expiry, quiet or propagation allowance changes. These are ceilings, not claims that the final path has already passed.

Reallocate the old activation's 70000 ms slack rather than carrying unneeded slack into the new total. Stage ceilings in order are 549000, 1170000, 393000, 950000, 950000, 396000, 678000, 108000, 306000, 306000, 931000 and 380000 ms. Total 7117000 ms reserves 256 observer rows. The independent shutdown reserve is 300000 + 306000 + 306000 + 931000 + 380000 = 2223000 ms. Settlement's 300000 ms still covers two 108000 ms reads and the optional 60000 ms delay. All runtime capacity and original-deadline checks stay active.

## Task 1: Correct the local timing profile

- [ ] Copy only r2 runtime source, focused tests and static identity/dependency recipes into the new r3 directory. Record every source hash; preserve r2's exact directory membership and bytes. Keep old acceptance references explicitly historical. Use a new sequence and materials path.
- [ ] Add failing tests for the measured 6429 ms fault overhead, complete native preparation/evaluation charge, all nine attended controls and cap256. Test that 135000 ms remains relative to the original attempt and is shortened by an earlier original stage/native/readiness deadline. Reject equality at the deadline and second use.
- [ ] Change `profile.mjs`, `guards.mjs` and `fault-continuation.mjs` only for this timing policy. `CONTROL_BOUNDS` must be the shared source of the fault watcher allowance. `assertTimingFit` must still refuse absent, unmeasured, partial or unreviewed final command evidence.
- [ ] Run `node --test <r3>/focus-profile.test.mjs <r3>/focus-fault.test.mjs <r3>/focus-context.test.mjs <r3>/focus-boundaries.test.mjs`. Inspect failures; run only additional affected suites. Save local results without claiming cloud acceptance.

## Task 2: Derive the nine attended commands

- [ ] Port the accepted S9 terminal and masked-launcher adapters to r3's actual `attended-proof`, signed handoff, fixed identities and timing contract. Keep first Enter, post-native Enter, stale-input reset, owned child confirmation, exclusive attempt/report paths and original-identity reconciliation. The new namespace is `20261024-snapshot-r1`.
- [ ] Add focused tests before changing each adapter: exact child arguments and launcher inverse bytes, stale/changed references, missing actual attendance, fault watcher arming before input, same original timestamps, safe child close, no implicit retry and cold output directories. Allow only the known Node experimental warning where applicable; do not accept arbitrary stderr.
- [ ] Exercise the final credential-free command validation path through an actual PowerShell subprocess. Never synthesize successful native, attendance, review or cloud records. Label in-memory fixtures and keep fixture evidence outside operational paths. Measure local total and fault critical path; if either exceeds its ceiling, revise the implementation and complete ledger together before release.

## Task 3: Review and release preparation

- [ ] Independently review the changed timing and terminal lifecycle once for specification, then once for quality. Resolve findings with focused tests. Do not repeat already accepted unrelated application audits.
- [ ] Freeze the final bytes and measured contract, generate fixed static launchers, run local deployment dry-runs and prepare exact native precheck/closure commands. No activation while waiting for the user.
- [ ] Ask whether the user is ready only after the complete commands and remaining-cloud estimate are concrete. Then perform the already authorized isolated mock, preserving all original proof and closure requirements. This document is not evidence that Task15 passed.

## Parallel remaining migration facts

The public Site is v18 at `e2c012c01d55935c2eb542ebf3fdd6799f1aea5f`. Read-only comparison found 39 incoming-only and 28 both-changed paths against v11/migration. Preserve those features before public cutover; do not overwrite public v18 with the current Research candidate. Export case16497022 still lacks a complete D1/R2 export procedure. Neither fact permits another paid model call.
