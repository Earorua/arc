# Trigger Resynchronization Drain Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Extend the existing closed drain proof with the actual one-time trigger resynchronization horizon, without changing original evidence or authorizing a start.

**Architecture:** A pure temporal/pair predicate has focused regression tests. A local-only evidence writer binds the fixed successful resync, its review/attempt, the original closure and post-resync closed readback, and two complete original-validator drain gates. All original validators remain unchanged; this supplement adds constraints.

**Tech Stack:** Node built-ins, ESM, node:test; existing frozen operation guards.

Existing authorization covers this local implementation; no additional deployment, model call, resource modification or commit is part of the plan. Work in the current dedicated worktree. Preserve all old observations, including failed drain evidence. Relative paths below resolve from the repository root.

### Task 1: Supplemental local evaluator and regression tests

**Files:**
- Create `outputs/local-durable-executor-20261012/resync-drain-rules-r1.mjs` (pure predicate).
- Create `outputs/local-durable-executor-20261012/resync-drain-rules-r1.test.mjs` (real predicate tests).
- Create `outputs/local-durable-executor-20261012/evaluate-resync-drain-r1.mjs` (local reference validation and exclusive evidence output).
- Create only when actual passing native observations exist: `outputs/local-durable-executor-20261012/resync-drain-supplement-r1.json`.

- [ ] Write tests first and observe RED. Input facts contain numeric millisecond values: `now`, `closureEnd`, `resyncEnd`, `closedStart`, `closedEnd`, `firstStart`, `firstEnd`, `secondStart`, `secondEnd`; boolean `allOriginalChecksPassed`, `versionsExact`, `sameClosure`, `firstLinked`, `emptyJobs`, `observerStable`, `leaseExpired`, `cursorsStable`; numeric `remainingRows`, `unmatchedStarts`. Use a valid fixture with resyncEnd=closureEnd+1000, closedStart=resyncEnd+1000, closedEnd=closedStart+1000, firstStart=resyncEnd+931000, firstEnd=firstStart+1000, secondStart=firstEnd+60000, secondEnd=secondStart+1000, now=secondEnd+1000 and remainingRows=100. Assert PASS. Independently mutate: firstStart one millisecond before horizon; secondStart one millisecond before gap; invalid/future/reversed timestamps; firstStart age exactly900000; each false boolean; unmatchedStarts1; remainingRows0 or31 orNaN. Each must FAIL. Historical closed mapping may be older than15min; it must precede the drain and follow the actual resync. Add exact-boundary tests for931000ms,60000ms and remaining32.

- [ ] Implement `evaluateResyncDrainFacts(facts)` returning `{checks, allChecksPassed, minimumFirstNativeStart, earliestNativeStartedAt, endedAt}`. Each timestamp must be finite/nonfuture; require ordered closure/resync, post-resync closed mapping, first and second intervals. MinimumFirstNativeStart=max(closureEnd,resyncEnd)+931000. Require secondStart>=firstEnd+60000, now-firstStart<900000, all named booleans true, remainingRows integer>=32 and<=256, unmatchedStarts=0. This record proves only bounded observation, not absence of every platform invocation or readiness to reactivate.

- [ ] Implement local writer accepting exactly four arguments `FIRST_PATH FIRST_SHA SECOND_PATH SECOND_SHA`. Import unchanged original `guards.mjs` from `../local-durable-executor-20260914/task15-smoke/cloud-ops-20261012-ack/activation-preparation-r1/guards.mjs`. Fixed anchor binding SHA6063e22f6cac8062b58dea174b74d3de66170c5e5dcfb6562ac46c30a9f1b57a; inventorySHA5734426c1d0d0d1f1b06fc7ce35c40822f627bb2e8e98d2fe3f5522f5c9f85e9. Validate original closure through `outcome('closure','deploy','f34fddea21a5dd2a77f75f035806ca1ea9d99ecd98daaab70ab989a9c4454e24')`. Fixed resync deploy result SHA3381b0eccb17973fada67488e6bfbff4d10895d0dd2ec3afc3f0bf198753ad20, attemptSHAfd3255e8e2f80f95d18ada20b52e13457db21b91e737c2327f312a1257872625, reviewSHA4b9483eca7903815890a1aa44fbea719ff34ada1bcea99341bc247e7a6cbb87d. Verify their hash references and deployed helperSHA149b108920f6ddec01f8a7e890f83cb0b85b21c9a75a861a4a75a627837356c0; require deploy/exit0/commandSucceeded/mutationAttempted and expected closed predecessor9c4d5699-8083-4c45-a9aa-8d70c3f7fa19 and Site26dff9ec-1d62-4146-afa8-71b0f7acc310.

- [ ] Pin the historical post-resync closed gate `activation-preparation-r1/observations/post-resync-closed-r1/gate-evaluation.json` SHA744e2c80bfba6e42c4a924e33e1f52faae9be2d748d3125c0af7a4f20e99806a and nativeSHA b2cace4394ee7de462288a7be0ae33b50bef9aa448560fd6375d8a61bacf3753. Validate unchanged refs/schema/allChecksPassed/all true/timestamp equality/provenance/expectedversions. Do NOT call its freshness validator at later drain time: historical mapping does not become fresh; each actual drain supplies fresh full mapping. Its start must follow resyncEnd.

- [ ] Require supplied gate paths are the original observation root plus `post-resync-drain-first-r1/gate-evaluation.json` and `post-resync-drain-second-r1/gate-evaluation.json`; hash-verify before reads. Run unchanged `gate(ref,'drain-first',inventorySHA)` and `gate(ref,'drain-second',inventorySHA)` validators; verify second.request.firstGate exactly references first, both actual closure result references match, actual native request/attempt/evaluator/helper hashes remain linked. Independently derive facts from native observations: job and lifecycle scalar rows zero, empty newWorkflow and synthetic job rosters, lease_current0 and actual lease expiry, exact stable generation/lease_until/next_category, both maintenance cursor rows and cron capacity/latest timestamps stable, no unmatched starts. Do not trust a newly supplied boolean alone. Use existing guard `equal` and complete native projection shape.

- [ ] Write exclusive output schema `arc-trigger-resync-drain-supplement-v1` with references `originalClosure`, `resyncResult`, `postResyncClosedGate`, `firstGate`, `secondGate`, `evaluator`, `rules`; numeric-time results serialized to ISO; `expectedVersions`, `checks`, `allChecksPassed`, `fullPlatformInvocationAbsenceClaimed:false`, `activationAuthorized:false`, `cloudCalls:0`, `cloudMutations:0`, `providerCalls:0`. Existing output refuses overwrite; failures cannot emit PASS and must not spawn anything. Preserve failed outputs. Root alone invokes against real evidence after review.

- [ ] Run node --test on the one new test file and node --check on both modules. Add writer integration refusal tests for wrong/mutated references and premature/nonpassing pair, using only local files; no cloud or credential access.
- [ ] Independent spec review, fix if needed, then independent quality/safety review. Save review records and exact hashes. No broad app tests or commits for this operational-only helper.

### Task 2: Actual native drain and supplement (root only)

- [ ] Wait until08:47:48.141Z before preparing/collecting `post-resync-drain-first-r1` with unchanged original helpers and closureSHA. Evaluate the actual complete native output. A failure stops advancement and is retained.
- [ ] If first passes, prepare/collect the exact second tag only after first full native end+60000ms. Evaluate with first reference bound. A failure stops advancement.
- [ ] Invoke reviewed supplemental evaluator once with exact actual references and hashes. Only passing linked results may feed the separately reviewed continuation entry plan. No new activation or LONG follows automatically from this supplement.
