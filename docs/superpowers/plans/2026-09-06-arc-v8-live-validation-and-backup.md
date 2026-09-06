# Arc v8 minimal live validation and GitHub backup

> **For agentic workers:** Use the already approved superpowers:subagent-driven-development workflow: TDD implementation, independent specification review, then quality/security review. Root owns live execution, evidence and Git integration. This operational continuation implements the existing Research Beta design section 19 and Task 13 Step 6; it does not reopen Tasks 1–12.

**Goal:** Complete one bounded real Research validation, then integrate the verified branch locally and back up its exact commit to GitHub.

**Architecture:** A standalone terminal runner composes the existing OpenRouter adapter, Research orchestrator, quality validation, owner-bound repositories and planning service over fresh in-memory SQLite implementing D1. It does not change the running Fake browser preview or production configuration. Credentials enter through a masked local PowerShell prompt and child stdin; only an allowlisted summary is written.

**Tech stack:** Existing Node, PowerShell, TypeScript/Vite, Vitest and SQLite dependencies. No installation, new hosted service or production storage.

## User authorization and limits

- User requested: “带我继续完成真实验证、合并与github备份”. This supersedes the previous prohibition on those three actions once their prerequisites are met.
- User selected **USD 1** as the total real-validation budget and said they have an account and can create a limited test key.
- User requested a more advanced model, then explicitly selected **“GPT-5.6 Sol，维持 1 美元（推荐）”** after comparing it with GPT-6 Astra at a larger budget. Use fixed `openai/gpt-5.6-sol` for the first run; the budget remains USD 1.
- One Research POST only. No automatic retry, Repair request, alternative model or second paid attempt. Failure or incomplete evidence stops real execution for review.
- The user creates a dedicated, unused, non-management API key with a USD 1 limit and no periodic reset. A short expiry is preferred. The key must not be pasted into chat, stored in a file/environment variable, passed in command arguments or logged.
- No production variables, flags, D1/R2 operations, Sites candidate or deployment. Keep the feature worktree and branch after integration; cleanup is not necessary for backup.

## Exact first-run policy

| Item | Value |
| --- | --- |
| Model | `openai/gpt-5.6-sol`, fixed; no automatic model fallback |
| Test input | `Data Product Manager`, `en-US`; synthetic owner only |
| Research endpoint | One POST to `https://openrouter.ai/api/v1/chat/completions` |
| Key check | One read-only GET to `https://openrouter.ai/api/v1/key` before Research; bounded response and deadline |
| Provider request | Existing strict JSON schema, `require_parameters: true`, `data_collection: deny`, `zdr: true` |
| Search | Exa fast; at most 2 uses/tool calls, 5 results per search, 10 results total, 2,000 characters per result |
| Output and deadline | Existing 12,000 output-token parameter; 120,000 ms local Research deadline |
| Local accounting | 1,000,000 micros reservation; Repair reservation 0 |
| Transport | Exact destination/method allowlist, no redirects, no repeat POST, no other application outbound requests |
| Local data | Fresh memory SQLite D1 adapter, disposed in `finally`; actual Ready resolution/planning checked locally |
| Output | Safe summary in ignored `outputs/live-research/`; no raw prompt, result, source excerpt, key label/hash or account identity |

Current public references checked on 2026-09-06:

- [GPT-5.6 Sol model and pricing](https://openrouter.ai/openai/gpt-5.6-sol): currently advertised OpenAI input/output rates USD 2/10 per million tokens include a 50% promotion. Endpoint variants can differ; do not assume a permanent discount or use this as a guaranteed total charge.
- [Web Search server tool](https://openrouter.ai/docs/guides/features/server-tools/web-search): Exa fast currently USD 0.007 per search in addition to model tokens. Two searches therefore add up to USD 0.014 at that published rate.
- [Current API key metadata](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key) and [key limits](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key): inspect only the fields needed to reject management, unlimited, periodically resetting, previously used or over-budget keys.

Published rates support planning, not a fixed charge quote. The local budget ledger is not a Provider-enforced instantaneous spending cutoff. A dedicated key limit and bounded request reduce exposure; an in-flight timeout/cancellation does not prove no charge. Missing credible usage/cost, budget overrun or unexpected actual model cannot be reported as a successful completed live gate. The user must not reuse this key for concurrent work, and should revoke it after the attempt.

## Task 1: Build and review the executable validation helper

**Owned files:** `scripts/live-research/*`, `tests/live-research/*` or `tests/server/live-research-validation.test.ts`. Root owns this plan and operational evidence. Do not modify production application behavior or `tests/offline-uat/`.

- [x] Write and observe discriminating RED cases before implementing the helper: default mode has zero real calls; invalid/capped-key checks prevent Research; transport rejects wrong method/destination/redirect/second POST; actual adapter/orchestrator validate a Stub wire result and record cost/Ready/planning; error output does not contain canary secret/raw content.
- [x] Implement the separate memory-only composition. Set Repair maximum to zero and reject a second adapter POST regardless of orchestrator behavior. Resolve Ready for the correct owner, reject the wrong owner and exercise fresh local planning using the verified package.
- [x] Implement `run.ps1` with explicit `-ExecuteOne`, `Read-Host -AsSecureString`, redirected child stdin, BSTR clearing and stable error output. Default invocation performs only an offline dry-run. Do not install dependencies or load normal Vite/environment configuration.
- [x] Emit a bounded allowlisted summary with mode, exact requested/recognized actual model, request counts/status, run state, quality codes/counts, usage/cost, local accounting, owner/planning checks and database disposal. Use a fresh ignored output filename per attempt.
- [x] Run focused tests, nonincremental TypeScript and relevant lint; then fresh independent specification review followed by quality/security review. Fix findings under TDD. Root runs the dry-run itself before guiding user credential input.
- [ ] Commit the reviewed helper and plan locally. Record the exact commit used for the real attempt.

Root verification on the helper worktree, based on `28fc142` (2026-09-06):

- Final full unit suite: **135 files / 2,394 tests passed**, including 36 helper tests; exit 0, 57.82s.
- Full ESLint and nonincremental TypeScript: exit 0. Diff check passed.
- Actual default PowerShell launcher: exit 0, `offline-dry-run`, real requests 0, Ready, six citations, three skills, one audit, fresh account activated, owner rejection and planning generation passed, database disposed.
- Root safe dry-run report after usage-gate remediation: `outputs/live-research/summary-2026-09-06T02-39-53-276Z.json` (ignored by Git). Its USD 0.10 usage is an authored fixture, **not an actual charge or price estimate**.
- Implementer observed missing-helper, boundary and Windows-launcher RED cases. Initial specification review found a false-pass condition for three searches or zero-token receipts; four discriminating RED cases preceded the corrected requirement of 1–2 searches and positive prompt/completion/total tokens. Final specification re-review independently reproduced the valid and invalid cases: no remaining P0/P1/P2 findings, READY YES.
- Root full-suite runs exposed new subprocess tests with a 10-second outer timeout despite their 30-second child deadline. The default PowerShell child took approximately 15 seconds under the full suite; the same affected files passed 58/58 in isolation. Each child now has its own test with a 35-second outer timeout and unchanged 30-second child deadline. Global and actual Research timeouts are unchanged. The final full-suite result above passed after this narrow correction.
- Independent quality/security review of the final helper, tests, documents and relevant dependencies: no P0/P1/P2 findings, READY YES. This was a static review; the final full suite and actual default launcher were verified by root. No credential input yet.

## Task 2: User-assisted one-request live verification

- [ ] Present the reviewed command, exact policy above and where its safe report will be saved. User enters their dedicated key only in the local hidden prompt.
- [ ] Key preflight must confirm a fresh limited inference key before the sole Research POST. Never print full key metadata or raw error bodies.
- [ ] Record the allowlisted result and inspect the safe report. Require actual live mode, one Research POST, credible usage/cost within budget, real citations, validated owner-bound Ready package and local planning integration. A Failed or Needs review result remains an incomplete live gate, even if HTTP succeeded.
- [ ] Confirm key revocation with the user after the attempt; do not request or read the key. Save sanitized evidence in the UAT record and resume checkpoint, with exact code commit and evidence limits. No automatic retry.

After Task 1 review and local commit, the user runs the following from an interactive PowerShell terminal in the authoritative feature worktree:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1 -ExecuteOne
```

Only paste the dedicated key at `Paste dedicated OpenRouter key (masked)`, then press Enter. Do not put it in the command or chat. The command prints a sanitized summary and its file path. Even when the result is incomplete or the terminal times out, do not rerun it automatically; inspect the safe summary first and revoke the test key after the attempt. A redirected/noninteractive terminal fails before requesting a credential.

## Task 3: Verify, fast-forward and back up

Read-only preflight at `28fc14277ae1176bfdcbd82d862468ad46aa3107` found:

- Feature branch `codex/v8-openrouter-research-beta`, clean.
- Main worktree `C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2`, clean `master` at `f0f88b2ebdb61e2951c9d1d6c0004319c131eafa`, an ancestor of the feature branch.
- Fresh remote `https://github.com/Earorua/arc.git` default `master` at `f6c3cddbe6d3f177f3681b355142daad84f2330e`; no feature branch on the remote. Local master's two additional specification commits are already in the feature history.
- The repository is public and the current GitHub identity has push/admin permission. Repository webhook list is empty; GitHub metadata says Pages disabled. The only committed Actions workflow runs tests/lint/build/render checks, with no deploy step; local Git hooks are sample files only. External GitHub App installation settings are not established solely by these checks and must not be represented as fully audited.

- [ ] After live evidence passes, run the required offline tests/type/lint/build/render and bounded local D1 checks for the final helper/evidence commit. Scan only tracked source and client artifacts for leakage; never read environment files.
- [ ] Review all files being published. Recheck main worktree cleanliness and fresh remote hash. If either changed, inspect before integration; never overwrite independent changes or force push.
- [ ] Fast-forward the clean local main worktree with `git merge --ff-only codex/v8-openrouter-research-beta`. Verify merged HEAD and run the relevant tests on the integrated result.
- [ ] Ordinary push of `master` to the confirmed `origin`, then `git ls-remote origin refs/heads/master` must equal local HEAD. Inspect triggered CI without deploying.
- [ ] Save final exact hashes, live evidence, CI status and remaining production prohibitions. Full Goal 2 is complete only after the evidence and backup gates actually pass; production release remains separate.

## Current status

The fixed-model helper has passed specification and quality/security reviews, root offline tests and the actual default PowerShell dry-run. Local commit and user-only masked credential input are the next steps. **No real key was read, no real Research request sent, and no merge or push performed yet.** The new authorization replaces historical pending-authorization wording only for this documented scope.
