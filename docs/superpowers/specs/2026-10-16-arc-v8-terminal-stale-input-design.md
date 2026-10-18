# Arc v8 stale console input correction

## Evidence and scope

The consumed r6 shell failure occurred at `post-native-enter`. Its real preparation child exited 0 with complete output at 2026-10-16T08:07:59Z. The acknowledgement diagnostics show `bufferedInputPresent:true` and 235730 ms remaining. The function rejects before printing prompt 2. The user reports possibly pressing another key or pasting early. No acknowledgement, masked wrapper, signed control or Research start was reached. This is an interaction failure after successful cloud preparation, not an expiry or Provider failure.

Root is closing r6 through its existing incomplete-closure contract. Every r6 file and accepted product artifact remains immutable. This correction is an isolated local component; it does not authorize or generate a new cloud attempt. Existing user authorization covers local fixes and independent review.

## Choice

Retaining immediate rejection would repeat the same costly interaction failure. Accepting a queued Enter would defeat the requirement for acknowledgement after native readiness. Instead, discard stale console events without inspecting their contents, then print the existing readiness prompt and require a new Enter within the original deadline.

Use Windows PowerShell 5.1's `$Host.UI.RawUI.FlushInputBuffer()` only for the post-native acknowledgement. The official API resets the keyboard input buffer: https://learn.microsoft.com/en-us/dotnet/api/system.management.automation.host.pshostrawuserinterface.flushinputbuffer . Do not loop over ReadKey to drain input; the outer helper must not inspect accidentally pasted C. Do not use clipboard, files, environment, transcripts, external commands or simulated keys. Unsupported reset or a still-nonempty buffer refuses safely. A real console check is still needed before any later operational release; mocked console tests do not establish a host-level result.

## Required behavior

1. Add an optional `ResetBufferedInput` switch to the existing acknowledgement function, default false. Only the actual `post-native-enter` call opts in. Initial acknowledgement behavior stays unchanged.
2. Preserve the attended-console and original absolute-deadline checks. An already expired deadline must refuse without extending or resetting it.
3. When opted in and buffered input exists, reset the host input buffer exactly once without reading any key contents. Recheck the deadline and that no key remains before printing the readiness prompt. Failure must refuse before acknowledgement or secret input.
4. State plainly that early input was discarded and that a new Enter is required. Emit no key values, counts, text or secret-derived metadata.
5. Prompt, acknowledgement timestamps, Enter-only policy and 50 ms polling retain their meaning. No queued Enter supplies readiness; only the subsequent ReadKey after prompt is eligible.
6. Preserve the existing failure/child diagnostic projection. Additional diagnostics may contain only `inputBufferResetAttempted` and `inputBufferResetSucceeded` booleans and the fixed error enum `LOCAL_ACK_BUFFER_RESET_FAILED`.
7. Do not edit native validation, child arguments, package/stage deadlines, source pins, masked wrappers, credential handling, retry policy, models, admission or closure procedures.
8. Keep the old r6 entry and all operational records byte-identical. Build the candidate only under `outputs/local-durable-executor-20261016/terminal-stale-input-r1/`.

## Acceptance

An offline PS5 test must reproduce the original prebuffer rejection before applying the correction. After the correction, stale Enter and stale non-Enter input are discarded without reads, a fresh Enter is required, and absence of a fresh Enter still times out under the same deadline. Verify default/initial refusal, expired deadline, failed or ineffective reset, post-prompt non-Enter refusal, safe diagnostic fields, and scalar acknowledgement output. Parse the complete candidate entry and prove only the intended function, its explicit call option and safe diagnostic allowlist/projection changed. Independent SPEC then QUALITY reviews precede Root acceptance. No cloud or real credential is used in these tests.

## Self-review

The change improves an observed interaction boundary while preserving fresh acknowledgement and all operational controls. It does not convert the failed r6 rehearsal into success or reuse its command. Host buffer reset is not claimed to prove human attendance. Any later successor still needs actual closure evidence, validated source/material derivation, native checks and an actual user invocation.
