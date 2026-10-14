# Task15 Task2 bounded incomplete closure addendum

Status: Root design decision for authorized local implementation, 2026-10-14. No cloud operation or new spending authorization. Supplements the guarded scenario plan without modifying accepted Task1 files or historical evidence.

## Concrete defect and decision

Task1 correctly refuses continued rehearsal when its cumulative/stage clock or observer reserve is exhausted. Task2 previously used the deadline without checking canAdvance; enforcing it everywhere exposes a second problem: the same refusal blocks admission-close and leaves maintenance running. The approved design requires stopping new submissions, settling accepted work and then closing maintenance on this condition.

Alternatives: leaving recovery to an unprepared manual command does not satisfy the prepared closure requirement; loosening Task1 would also authorize continued rehearsal. Choose a separate, fixed, incomplete-closure-only allowance in Task2. This is an implementation correction within the existing stop-and-settle requirement, not permission to restart or claim success.

## Fixed authority and lifetime

Create one exclusive local incomplete-closure record under scenario-ops-r1, derived from the actual activation operation, actual last native evidence and original stage clock. It retains the original activation/stage times, cause (budget/cutoff/failure/operator stop), immutable materials, epoch and target references. No caller-selected duration, target, command or config. Do not fabricate successful current state.

The record anchors its start to the earlier of an already-existing closure-entry timestamp and its actual first creation time. The absolute deadline is this anchor plus 3,600,000 ms. This bounds the existing 1,260,000 ms accepted execution allowance plus 2,131,000 ms settlement/closure/propagation/drain profile with 209,000 ms headroom. The bound is an operational ceiling, not a completion guarantee. Recreating records, refreshing evidence, reviewing, retries or new invocations cannot renew it. Existing consumed mutations remain consumed.

This authority permits only existing exact commands needed for incomplete closure: read-only reconciliation of an already-attempted activation or closure write, pre/post admission-close, pre/post maintenance-close, settlement reads, and delayed first/second drain plus scheduled metadata. It never permits activation, Site roster mutation, start, signed status, result/recover control, replay, provider calls, a replacement epoch or observer changes. An activation reconciliation is read-only and cannot repeat activation.

Allow only the main rehearsal continuation/cumulative/capacity prohibition to be bypassed for these closing operations. Keep each collection and mutation finite under the smaller of its existing limit and the fixed remaining recovery deadline; each pre/post closure collection is at most 300,000 ms, each mutation keeps the existing 90,000 ms plus confirmed shutdown bound. Existing 45,000 ms read child, three closed transport attempts and output limits remain. Freshness remains less than 900,000 ms and both immediate deployment predecessors remain less than 120,000 ms. Never use a later recovery deadline to validate an ordinary rehearsal handoff.

## State and closure safety

Admission-close still changes only admission true to false on the exact current active configuration, leaving maintenance and Cron intact. A failure or ambiguous result consumes that write; actual native readback/reconciliation is required. Current state must come from the existing verified chain, including reconciliation of unknown prior writes where necessary. The fallback grants no blind mutation.

Accepted work remains allowed to settle while new admission is closed. Maintenance-close requires a fresh complete native scope with no outstanding work, exact current pair and the same strict transition proof. If settlement is not proved before the bounded deadline, stop and report unresolved state; never force maintenance off or invent a terminal result.

After actual maintenance-close, retain its original operation end and actual closed native evidence/version. First drain is no earlier than close end plus 931,000 ms; second is no earlier than first native end plus 60,000 ms. Stable counters/lease/cursors and the separate scheduled metadata requirement remain. A saturated observer is evidence of lost rehearsal coverage, never permission to delete rows or increase its cap.

Any use of this allowance marks the outcome incomplete permanently, even if the observed subset settles and closure succeeds. It cannot pass Task15 or establish platform invocation absence. Main profile and capacity estimates are still recorded unchanged.

## Local implementation and verification plan

- Modify only Task2 prepare-observation/evaluate/operate/collect helpers as necessary; use one small fixed recovery helper only if keeping these functions comprehensible requires it. Extend tools pins if adding that helper. Do not edit Task1.
- Write failing tests first: original capacity/cutoff failure rejects new start/replay but permits exact admission-only close; fallback cannot activate or mutate Site roster; fixed deadline cannot renew; expired recovery rejects before spawn; unknown write cannot be repeated.
- Test the whole closure sequence at its pure decision boundaries: insufficient main reserve -> admission false with maintenance retained -> unsettled native scope rejects maintenance-close -> actual settled scope allows it -> 931s and 60s drains retain original actual timestamps; all outcomes remain incomplete.
- Test immutable source/material/target binding, stale current pair refusal, direct and reconciled close provenance, and unchanged normal-path behavior. Use labelled in-memory values or isolated offline test temporaries, never operational success fixtures.
- Document exact fixed record fields and CLI arguments in the Task2 implementation report for Task3. Run focused combined tests and all new-module syntax checks. Include this addendum in independent specification review followed by quality review before any cloud activation.

## Self-review

No continuation authority is renewed. The independent one-hour limit applies only to stopping/settling/closing existing work. Exact state, authenticated control boundaries, single-write semantics, current native proof and real propagation delays remain mandatory. Network outage or unproved settlement can still leave an explicitly unresolved closure; the tool does not promise guaranteed recovery. Local implementation is covered by the user's prior authorization and present request to continue; any later actual operation remains subject to current verified state.
