# Arc v8 PowerShell console output repair

> Use the established subagent-driven development and TDD workflow, followed by specification review and quality/security review. User screenshot reports the missing output; repair this local launcher defect without any new model call.

**Goal:** Make the masked PowerShell launcher visibly print the child runner's existing safe summary or safe failure message in an interactive terminal.

**Architecture:** Keep the hidden Node child and masked anonymous-stdin credential channel. Explicitly redirect its stdout and stderr, drain both asynchronously while the process runs, then forward them to the parent console. Keep the existing process deadline, bound post-exit stream waits by its remaining time, preserve the child exit code, and release stream/process resources on failure.

**Tech Stack:** Existing PowerShell/.NET Process APIs, Node synthetic fixtures, Vitest. No dependencies, live calls or production changes.

## Verified problem and scope

The user screenshot shows the Kimi launcher prompt and a return to `PS C:\Users\XF>` with no JSON or Summary path. The actual Kimi result was already saved and passed; do not confuse a readable result file with observed terminal output.

Root reproduced the defect with the existing **default offline** command in a real tool PTY: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1`, no mode switches or key. Exit 0, output only `Offline dry-run: authored fixture only; no key input or real requests.` plus terminal controls; required JSON and `Summary:` are absent. This is terminal-mode RED, using no real key or network. The existing captured-pipe launcher test passes because redirected handles are inherited there, which does not cover the interactive console behavior with CreateNoWindow.

Only edit `scripts/live-research/run.ps1` and add `tests/server/live-launcher-output.test.ts`. Root owns this plan and the resume checkpoint. Preserve masked key handling, cleared environment channels, all four mode conflicts, Kimi minimal model, Astra full Research/account-check, runner persistence/summary schema, 180000 ms process limit and production state. Do not turn off CreateNoWindow, read or write a real key, modify the runner, or rerun any paid mode.

## Task

- [x] Write functional offline regression first: copy the real launcher into an isolated temporary fixture workspace with a synthetic Node runner, and run it through a PowerShell test host that caches its Console.Out/Error then clears inherited OS stdout/stderr handles in that isolated process. This reproduces the missing child output while allowing parent Console writes. Use a test-local Win32 SetStdHandle declaration only; no persistent console or system changes.
- [x] Observe RED on missing child JSON/Summary/error markers with the original launcher. Test a successful result, nonzero child failure/exit code, and output on both pipes exceeding their buffer size. All fixture content is synthetic and no live switch or real key is used. Keep temporary cleanup restricted to the created fixture directory.
- [x] Implement explicit `RedirectStandardOutput = $true`, `RedirectStandardError = $true`, and start both `ReadToEndAsync()` operations immediately after child start, before waiting. Preserve stdin clearing and the existing process deadline. Await drain completion within the remaining deadline; forward safe child stdout/stderr with Console.Out/Error.Write and keep its exit code. Do not block on one pipe while the other can fill.
- [x] GREEN: focused new regression, then root verifies the new suite plus the previous five diagnostic suites, nonincremental TypeScript, targeted lint and diff checks. Root repeats the default offline PTY command to confirm that JSON and Summary are now visible, and verifies this newly generated result is offline/zero real requests.
- [x] Independent specification review, then independent quality/security review of this delta; resolve any material findings before completion.
- [x] Save the repair evidence and prepare the handoff explaining the previous successful Kimi result using its exact existing summary file. Do not give the user a command that repeats an already consumed inference. A `Get-Content -LiteralPath` command for the existing safe summary is sufficient to display that result.

## Existing live evidence and boundaries

The successful Kimi file remains `outputs/live-research/summary-2026-09-08T12-48-19-648Z.json`, SHA256 `748232ec2fc42b5c43014c84ae3445ee7d3b502baab1c428f060899741f516e3`: minimal-probe-one / passed, requested and actual moonshotai/kimi-k3, key/inference200, expected-ok, 127+27=154 tokens, costMicros682 (USD0.000682), GET1+POST1, Research/Repair0. Its permit is consumed. New offline summaries do not supersede this live evidence.

Starting launcher SHA256 `0c07cb167063d0746a8c0720f7cf7cd76deff2175a37c8e2c69fea4fed6ab45f`, branch codex/v8-openrouter-research-beta, HEAD7090153b4acad7b12df6a7ee4d675b46c41871dc, 15 existing uncommitted files. New plan and new test imply 17 expected files after implementation. No commit/push/deploy or production change is part of this repair.

Root checked the new PTY-reproduction summary `summary-2026-09-08T12-53-03-051Z.json`: offline-dry-run / passed / realRequestCount0. Its synthetic inference/usage/planning fields are not live evidence. This is the intentional output-only reproduction.

Microsoft references checked 2026-09-08: [RedirectStandardOutput](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.redirectstandardoutput?view=netframework-4.8.1) and [RedirectStandardError](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.redirectstandarderror?view=netframework-4.8.1). Explicit redirection exposes child streams to the parent; draining both concurrently avoids pipe-buffer deadlocks. These references support the local repair and do not authorize any external test.

## Verification evidence

Implementer functional RED with the corrected test host: **1 file / 2 failed tests, 3.29 seconds**. The isolated SetStdHandle fixture reproduced lost child JSON/Summary and stdout/stderr markers; the synthetic failure correctly propagated exit 23 but its output was absent. An earlier 3.61-second trial also had a host-wrapper exit propagation defect; adding `exit $LASTEXITCODE` corrected the harness before the authoritative RED run. Both cases use only the copied launcher and authored Node fixture, no credentials or network.

Implementer GREEN: **1 file / 2 passed tests, 3.36 seconds**. Each synthetic runner writes 128 KiB to each pipe concurrently. Success exposes the JSON, Summary marker and both complete blocks; failure exposes safe error text and preserves exit 23. The suite is Windows-only and cleans only its verified temporary fixture directory.

Root repeated the same default offline command in the real tool PTY: **exit 0, visible JSON and `Summary:` path**, with `summary-2026-09-08T13-07-09-842Z.json` independently read back as **offline-dry-run / passed / realRequestCount 0**. Synthetic model/usage/planning fields remain fixture evidence only. No additional live request was made to verify console display.

Fresh root regression: **6 files / 333 passed tests, 9.09 seconds**, covering the launcher output, minimal transport, minimal probe, Research validation, account checks and provider failure diagnostics. `npx tsc --noEmit --incremental false`, targeted ESLint and `git diff --check` also passed.

Independent specification review followed by independent quality/security review: **both READY, no actionable findings**. Both reviewed the completed launcher behavior and synthetic regression; neither performed live requests. Final launcher SHA256 is **`9253c413e2d2666ec31c5a9f1863c64f56150a7df7b5fb8ae72f436b442a2a26`**. Root verified the runner, minimal probe, transport and safe-error-explanation hashes remain unchanged from the repair baseline; the original successful Kimi summary hash also remains unchanged. Current branch/HEAD and all 17 expected uncommitted files are preserved.

User handoff: acknowledge that the screenshot correctly showed no terminal summary and distinguish the earlier file-based success from observed console output. The local launcher fix is complete and verified offline. To view the already successful live result, use only this read-only command, which makes no API request:

```powershell
Get-Content -LiteralPath "C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta\outputs\live-research\summary-2026-09-08T12-48-19-648Z.json"
```
