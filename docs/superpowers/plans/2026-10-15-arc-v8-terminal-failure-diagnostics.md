# Arc v8 terminal failure diagnostics implementation plan

> For agentic workers: use superpowers:subagent-driven-development, then independent specification and quality review. Reuse this worktree. No commit, cleanup, cloud operations, credentials or operational command execution.

**Goal:** Preserve actionable, bounded failure metadata in the next terminal candidate without weakening any readiness, deadline, pin, input or no-retry check.

**Architecture:** Create an isolated replacement `terminal-entry.ps1` in `outputs/local-durable-executor-20261015/terminal-failure-diagnostics-r1/`, derived from the consumed r5 shell. Add in-memory finite diagnostics to the existing child/ack boundaries and include a safe projection in the existing shell failure record. This component is not an operational successor and cannot be released as a user command. The existing r5 package stays byte-identical.

**Tech stack:** Windows PowerShell 5.1, fixed local Node executable, credential-free fake children, existing attended-shell functions.

## Evidence and authorization

The user authorized continued local implementation and cloud mock acceptance. They completed a real offline two-Enter probe: `local-handoff-probe-r2/user-result.json` records PS5, successful child return, both acknowledgements, no redirected input and no cloud/credential/model calls. Earlier r1 probe timed out because the user reported missing the second prompt. Neither probe explains the original r5 failure 72 ms after preparation; that exact historical exception is unavailable because its terminal closed.

The confirmed defect is loss of diagnostics: r5's catch saves only a generic refusal, so a future failure cannot be localized. Preserve that original evidence and unknown root cause. Implement the already-authorized finite observation improvement, not a speculative retry or guard relaxation.

## Task 1: bounded shell diagnostics component

Files:
- Read only: `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261013-guarded/scenario-ops-r5/terminal-entry.ps1` and `terminal-entry.test.ps1`.
- Create in `outputs/local-durable-executor-20261015/terminal-failure-diagnostics-r1/`: `terminal-entry.ps1`, `terminal-diagnostics.test.ps1`, derivation/verification JSON and implementation report.

- [ ] Hash original r5 entry and its package before work. Do not write under r5. Expected original entry SHA256: `647728329f2214a9f7257ed9839e8c0f09240a9f76fa6e9bea73903681405400`.
- [ ] Write and run a focused RED test proving the current shell does not preserve a failure stage/code and distinguish a zero-exit child with stderr from clean JSON success. Use local fake children only; never call the operational function with real cloud inputs.
- [ ] Derive the original shell into the new component directory. Retain all original commands, success outputs, error rejection semantics, original deadline calculations, post-native Enter ordering, pin checks, output cap, child timeout/kill behavior and no retries. No blanket stderr acceptance, input buffer flushing, implicit Enter, longer operational deadlines or secret-input changes.
- [ ] Capture fixed stages: inspect child, initial Enter, prepare child, post-native Enter, acknowledge child, post-ack validation, masked child, complete. Reset child metadata at each child invocation; identify which stage it belongs to so a completed earlier child is not misreported as the failed stage.
- [ ] Capture only bounded metadata: child started/exit observed, numeric exit code if observed, output/error character counts only after drain, drain completion, JSON parse status and elapsed milliseconds. A timeout or incomplete drain must remain distinguishable from a confirmed clean exit. Record input-buffer presence and deadline remaining at acknowledgement entry without consuming or altering keys.
- [ ] Classify thrown exceptions using exact fixed codes already defined in the entry (pins, console, bounded deadline, child failure/timeout, acknowledgement conditions, reserves, masked failure). Unknown messages map to `OTHER_LOCAL_EXCEPTION`. Do not persist or emit raw exceptions, stack traces, stderr/stdout, arbitrary args, environment values, URLs, keys or pressed characters. Test with unique secret-like canaries in unknown exception and fake streams and assert no canary reaches saved diagnostics or the function success stream.
- [ ] Add the safe diagnostic projection to the existing failure JSON and a compact fixed stage/code message. Diagnostic creation must be best effort and must never turn an operational failure into success, retry it or change invocation identity. Any external/module-scope context must be reset per invocation; prefer an explicit optional context argument passed to the existing functions.
- [ ] Improve initial/post-native prompts using clear numbered ASCII text with explicit instruction to wait and press once after the second prompt. Preserve the exact readiness timing and input checks. Chinese strings are optional only with PS5-compatible encoding; do not complicate this component merely to duplicate probe UI.
- [ ] Verify realistic local fake children: valid JSON, stderr on exit0, nonzero exit, malformed JSON, timeout, changed pin and expired deadline. Verify one launch/no automatic retry, safe projection of unknown messages, no stale child metadata between calls, and stage logging for acknowledgement refusal. Exercise actual PS5 functions rather than testing regex alone. Existing dispatch-scalar and bounds tests must still pass with minimal fixture wiring changes.
- [ ] Save real RED/GREEN results and source derivation. Verify every original r5 file remains unchanged. Do not generate launcher contracts, readiness, material acceptance, user commands or templates.

## Task 2: independent review and later integration

- [ ] Independent specification review of Task 1 final files; resolve concrete findings.
- [ ] Independent quality/security review focused on failure truthfulness, safe logging, deadline/guard invariance, success-stream pollution, stale context and child cleanup; resolve findings.
- [ ] Root independently verifies reviewed file hashes and targeted test evidence. Record component acceptance only. A future r6 candidate additionally needs actual closed-state provenance, fresh preactivation validation, material integration and reviewed new command; this component alone is not cloud readiness or Task15 acceptance.

Task15 remains incomplete. Task16 needs a fresh concrete paid-run authorization; public Research, production data and DNS are outside this local component change.
