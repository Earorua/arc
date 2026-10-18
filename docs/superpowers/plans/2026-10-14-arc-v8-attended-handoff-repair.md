# Arc v8 attended handoff repair implementation plan

> For agentic workers: use superpowers:subagent-driven-development. Preserve consumed operational evidence and perform independent specification then quality review. No cloud action belongs to implementation or review.

**Goal:** make the already-authorized simulated acceptance executable from the user's terminal without another chat round trip inside its activation window.

**Architecture:** derive a separately reviewed `scenario-ops-r3` from frozen r2. Retain existing credential input and provenance validators. A bounded fixed first-command preparation runs the validated activation/readback/prestart chain; the user acknowledges readiness locally after the actual gate, then the unchanged masked launcher receives C. Other fixed commands similarly obtain local readiness directly. Preserve all original r1/r2 outcomes and clocks.

**Tech stack:** Node ESM, Windows PowerShell 5.1, pinned Wrangler, existing isolated Workers/D1/R2.

## Authority, diagnosis and scope

The user authorized local implementation, subsequent deployments and continued Research/public enablement. The existing guarded-tools plan expressly permits enlarging measured stage budgets. This is a concrete repair within that scope, not authorization for a real model call, production mutation, DNS change or new purchase.

Actual r2 activation succeeded. Dispatch to final prestart end took 166.229 seconds (86.092 seconds native reads, 64.902 seconds orchestration gaps, 15.235 seconds deployment). Of the original 300 seconds, 133.771 remained, against 125 seconds already reserved for input/child execution. The mandatory post-native chat acknowledgement could not fit reliably. No C command, control request or model call occurred. See `outputs/local-durable-executor-20261014/handoff-timing-assessment-r1.md`.

r2 is permanently INCOMPLETE and is being closed through its original recovery contract. r3 must not be activated before root accepts actual closed state, two delayed stable drains and separate scheduled metadata. Failed r1, successful-but-cutoff r2, and all historical observer rows remain immutable. No automatic successor loop.

## Task 1 — successor baseline and measured budget

Create `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/scenario-ops-r3` from only reviewed r2 source/static materials, excluding all attempts/results/observations/clocks/handoffs/receipts and historical freezes. New sequence/report suffix `20261014-r3`; new exclusive operational locations. Keep the same job IDs only if actual job/Workflow/receipt/control scope is still empty. No resource creation.

- [ ] Write failing focused tests for a 600000 ms activation, total 5581000 ms (93m01), initial reserve206, cap256 and retained row boundary50/51; other stages and prospective132/settled90 reserves unchanged. Original stage and cumulative clocks cannot renew.
- [ ] Retain the original schema/inventory provenance anchor. Add a distinct root accepted current closed-state anchor, which binds r2 activation, incomplete record, close operation, full delayed stable drain and scheduled metadata. This anchor is not a rewritten schema acceptance or proof of Task15 success.
- [ ] Root's final closed acceptance does not exist yet. Build source/tests with an explicitly unavailable input slot which refuses operational validation; do not invent a hash, version, successful drain or authority. Wire its real path/hash only after root provides it, then regenerate current materials and review the final bytes.
- [ ] Derive current base configs/version/Workflow-latest mapping from the accepted closed gate while independently retaining original schema verification. A fresh complete r3 baseline must match that exact current closed pair, no roster, empty primary job/execution/Workflow/receipt/control scope, no outstanding counters and zero unmatched starts. Retain total observer rows; require actual current planned/shutdown headroom rather than resetting rows. Baseline must have R+206<=256 at activation. No old observation is substituted for fresh current native reads.
- [ ] Freeze r1 and r2 history unchanged. Replace r2's predecessor-failed assumption with the exact r2 successful activation + permanent cutoff + real closure chain. Guard unused r3 controls/clock/report paths; no clearing historical directories.

## Task 2 — fixed terminal entry and preparation

Use a minimal local helper shared by the nine no-argument commands, not a daemon or generic workflow framework. Root prepares exclusive role templates binding sequence/epoch, role/job/report, source/material/launcher pins, real state/gate/clock/prerequisite refs, and finite expiry. Root's template review and the user's later actual terminal action are separate evidence.

- [ ] For the first LONG command only, prepare/review the full bounded activation pipeline offline before publishing the command. User invocation in a real attended PowerShell terminal records an actual local readiness acknowledgement (no secret). Then invoke existing validated preactivation/baseline/one activation/post-activate/prestart interfaces in fixed order. Use actual completed events; do not compose further code or wait for chat inside these clocks. Existing dry runs/materials must already be accepted. On any failure stop; no second deploy or automatic successor. Preserve evidence for root closure.
- [ ] After the fresh prestart gate, require an actual local acknowledgement (Enter) before creating `userReadyAt`; a completed deployment or a waiting process is not user readiness. Other eight commands begin with a root-prepared actual gate/template and the same local acknowledgement. Keep native-end ordering and <15min readiness freshness.
- [ ] Recompute all original prerequisites and time/capacity checks before exclusive readiness/handoff creation and before launching the pinned masked wrapper. The template cannot supply future readiness timestamps, arbitrary targets/roles/paths or a renewable deadline. Bind actual invocation ID/PID, helper/template/script hashes and ordered event times. An interactive-console check alone is not proof of human action: the operational assumption is that the user personally invokes the released command; root tools must never run it and label that user attendance.
- [ ] C is requested only by the existing masked launcher after all preceding checks. Never buffer C earlier, read clipboard, use arguments/environment/files for C, or acquire it through tools. Preserve SecureString/BSTR cleanup, child stdin, input limits, both readiness validations, confirmed exit, report identity and exclusive attempt/no-repeat semantics.
- [ ] Bound local helper/acknowledgement work within the original remaining stage deadline, and retain the full 65s child reserve. Account for the existing input window and measured local validation before releasing a command. Late acknowledgement, failed local validation or missing files must refuse before secret input/dispatch. No clock reset.
- [ ] Keep internal old masked wrapper contents unchanged except deterministic new references/paths/hashes already necessary for r3. Outer entry code invokes those wrappers; it must not bypass their validator. Generate a source derivation/diff and new complete material manifest. Do not label source-only preparation operationally ready.

## Task 3 — focused verification and release

- [ ] TDD meaningful boundaries: fixed role/template mismatch, changed pins, unknown/current version mismatch, missing closed anchor, actual pre/post native event order, expired/equality deadlines, retained rows, prior attempt, noninteractive entry, late input, child failure and no automatic retry. Use explicit local fixtures/fake children only; no artificial success files under operational paths.
- [ ] Run current affected contract/provenance/launcher tests and PowerShell5.1 AST/wiring checks. Preserve current diagnostic trace adapter tests. No rebuild of unchanged product artifacts or broad repeated product suite.
- [ ] Independent spec then quality review of final integrated bytes, including actual closed anchor wiring. Root accepts current materials, performs exact local dryruns and checks all future command paths before releasing one user command. Any review finding is fixed and narrowly retested.
- [ ] Follow the existing actual LONG quiet, fault gaps/settlement, R2 proofs, account isolation replay and closure sequence. Actual Task15 completion still requires all those proofs. Task16 real Research and Task17 public release remain separate.

## Alternatives considered

Only extending the budget retains a needless chat dependency. Accepting the earlier real attendance timestamp within15minutes is simpler but leaves future first-command activation dependent on another timely chat confirmation after long preparation; existing post-native ordering would also change. A bounded user-driven local acknowledgement preserves that ordering, avoids false timestamps, and removes the chat latency. No credential is collected while waiting for cloud preparation.

## Delivery constraints

Do not commit or reset the user's dirty workspace. Do not modify r2 operational source while its closure process is running. Root owns current closure and its final acceptance. Implementation may progress locally before that acceptance exists, but operational dispatch must remain unavailable. This plan itself is not a passed test, a completed rehearsal, or permission to use a model key.
