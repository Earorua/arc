# Arc v8 minimal live validation and GitHub backup

> **For agentic workers:** Use the already approved superpowers:subagent-driven-development workflow: TDD implementation, independent specification review, then quality/security review. Root owns live execution, evidence and Git integration. This operational continuation implements the existing Research Beta design section 19 and Task 13 Step 6; it does not reopen Tasks 1–12.

**Goal:** Complete one bounded real Research validation, then integrate the verified branch locally and back up its exact commit to GitHub.

**Additional request completed but live acceptance failed (2026-09-06; current status):** The user reported execution on clean **`7409fbd8c509bc567a68dd35a61551b1e44258d6`**. The new `outputs/live-research/summary-2026-09-06T09-57-33-859Z.json` is **live-one / incomplete / research-failed**, with Key HTTP **200**, complete in **1,390 ms**, and Research HTTP **403**. Counts are **2 real requests, 1 Research, 0 Repair**. The new observer recorded HTTP/code **403/403**, location `http-error`, code state `recognized`, and type **null / missing**. Actual model/usage are null; run `1017b0b3-d011-4b17-ad0f-62e8af4d33f2` failed, citations/skills 0, audit 1, USD 5 local reservation released with settled 0, owner/second-request guards true, no activation/planning, database disposed. SHA256: **`eba89578f1ca457974d1d8c45d74b31aea3bae4991e54c71c40d6eeef58c1a87`**. Local released funds do not prove final external zero cost. The additional allowance is now consumed; no third Research, automatic retry, Repair or model switch is authorized. With no recognized error type, follow the planned support route and keep the cause unknown. The support draft has been updated but remains unsent. The user's post-attempt Activity screenshot shows Overview, GMT+8, Past 1 Month, spend **$0.00**, requests **0**, tokens **0**, with no Top API Keys/Top Apps data. This is the displayed aggregate scope, not a request-detail audit or final settlement proof. Post-test key revocation remains unconfirmed. Only evidence documents changed; no new test-suite, production or integration success is claimed.

**Fresh additional-request authorization (2026-09-06, supersedes historical authorization status below):** After the reviewed diagnostic implementation was locally committed at **`31755b39ccef8592512b23711c3b8a9278534c08`**, the user explicitly answered “授权再运行 1 次真实 Research”. Root verified that exact clean feature branch and reviewed the unchanged masked launcher and one-request transport. This authorizes one additional user-run `-ExecuteOne` invocation: one fresh Key GET and, only if admitted, at most one additional Research POST, fixed `openai/gpt-5.6-sol`, at most USD 5 total validation budget, no automatic retry, Repair or fallback. The original failed POST remains consumed; this is exactly one new allowance. This documentation-only handoff has not executed the command or obtained new real evidence. The existing dedicated capped key stays solely in the user's local masked prompt; all key-policy conditions remain enforced. After the user reports execution, inspect the new allowlisted `live-one` summary and its error diagnostic, record its hash and code commit, and determine actual consumption before any further action. Failure, timeout or a missing report never authorizes a rerun. Integration still requires actual live acceptance; production operations, Sites candidates and deployment remain prohibited.

**Error-observation implementation complete (2026-09-06):** The user resumed from clean pause commit `facfb400667f93c9f974f8630e82882e0cbf19b8`. The optional fixed-field observer and independent summary snapshot in `2026-09-06-arc-v8-provider-error-observation.md` passed **407 focused tests** and root's **137 files / 2,641 full tests**, types, targeted lint and diff checks. Sequential independent specification and quality/security reviews both returned **0/0/0, READY**; the quality reviewer also passed 24 pure in-memory adapter cases. The local delivery commit contains only the four reviewed implementation/test files and three progress documents; root records its actual SHA and clean-state verification in the final handoff. The original first-request authorization is still consumed and the 403 cause remains unknown. No new paid request is authorized merely by resuming or completing this implementation; after local save, obtain fresh explicit authorization before another bounded real validation.

**Read-only diagnostic continuation:** On clean `748cc264e57a35171b43cfee1f336b6a07e4b139`, the user ran `-CheckAccountOnly`. The 05:49:11 UTC report is `completed`: Key/Catalog **200/200**, exact Sol membership **true**, Key limit/remaining **USD 5/5**, usage/BYOK **USD 0/0**, **2 GETs, Research 0, Repair 0**. SHA256 and interpretation boundaries are recorded in `docs/superpowers/plans/2026-09-06-arc-v8-readonly-account-diagnostics.md`. These observations do not prove inference success or earlier final settlement. The original Research 403 remains unresolved; no proven request-construction defect was identified. Continue local preparation in `2026-09-06-arc-v8-provider-error-observation.md`, without a new POST or speculative model/privacy/settings changes. Test-key revocation remains unconfirmed.

**Latest status (2026-09-06):** The user confirmed available account credit and ran the sole authorized Research on clean `31f80525c0efe556146f2830b1c049f1055de964`. It returned HTTP 403 after successful key preflight; live validation remains incomplete. The one-POST allowance is consumed. Do not follow historical instructions below to execute an unconsumed first request again. Preserve the failed evidence, obtain only a non-sensitive account-side error/charge description, and confirm test-key revocation. No second Research, model change, merge, push or deployment has occurred. See the latest attempt record at the end of this plan.

**Architecture:** A standalone terminal runner composes the existing OpenRouter adapter, Research orchestrator, quality validation, owner-bound repositories and planning service over fresh in-memory SQLite implementing D1. It does not change the running Fake browser preview or production configuration. Credentials enter through a masked local PowerShell prompt and child stdin; only an allowlisted summary is written.

**Tech stack:** Existing Node, PowerShell, TypeScript/Vite, Vitest and SQLite dependencies. No installation, new hosted service or production storage.

## User authorization and limits

- User requested: “带我继续完成真实验证、合并与github备份”. This supersedes the previous prohibition on those three actions once their prerequisites are met.
- User initially selected **USD 1** as the total real-validation budget and said they have an account and can create a limited test key.
- User requested a more advanced model, then explicitly selected **“GPT-5.6 Sol，维持 1 美元（推荐）”** after comparing it with GPT-6 Astra at a larger budget. The model remains fixed `openai/gpt-5.6-sol`.
- After creating the key, the user said **“另外我设置了5美元的限额，会宽裕一点”**. Root acknowledged the revised **USD 5** ceiling for this remaining one-request validation. This supersedes the earlier USD 1 limit; it does not authorize another Research request, automatic retry, Repair or deployment.
- One Research POST only. No automatic retry, Repair request, alternative model or second paid attempt. Failure or incomplete evidence stops real execution for review.
- The user creates a dedicated, unused, non-management API key with a USD 5 limit and no periodic reset. A short expiry is preferred. The key must not be pasted into chat, stored in a file/environment variable, passed in command arguments or logged.
- No production variables, flags, D1/R2 operations, Sites candidate or deployment. Keep the feature worktree and branch after integration; cleanup is not necessary for backup.

## Exact first-run policy

| Item | Value |
| --- | --- |
| Model | `openai/gpt-5.6-sol`, fixed; no automatic model fallback |
| Test input | `Data Product Manager`, `en-US`; synthetic owner only |
| Research endpoint | One POST to `https://openrouter.ai/api/v1/chat/completions` |
| Key check | One read-only GET to `https://openrouter.ai/api/v1/key` before Research; bounded response and 30-second deadline |
| Provider request | Existing strict JSON schema, `require_parameters: true`, `data_collection: deny`, `zdr: true` |
| Search | Exa fast; at most 2 uses/tool calls, 5 results per search, 10 results total, 2,000 characters per result |
| Output and deadline | Existing 12,000 output-token parameter; 120,000 ms local Research deadline |
| Local accounting | 5,000,000 micros reservation; Repair reservation 0 |
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
- [x] Commit the reviewed helper and plan locally: **`8ed27cb96c48f148f5046c35305f6951cd333576`**, clean after commit. Subsequent handoff documentation does not change this helper code; record the then-current HEAD alongside the eventual live report.

Root verification on the helper worktree, based on `28fc142` (2026-09-06):

- Final full unit suite: **135 files / 2,394 tests passed**, including 36 helper tests; exit 0, 57.82s.
- Full ESLint and nonincremental TypeScript: exit 0. Diff check passed.
- Actual default PowerShell launcher: exit 0, `offline-dry-run`, real requests 0, Ready, six citations, three skills, one audit, fresh account activated, owner rejection and planning generation passed, database disposed.
- Root safe dry-run report after usage-gate remediation: `outputs/live-research/summary-2026-09-06T02-39-53-276Z.json` (ignored by Git). Its USD 0.10 usage is an authored fixture, **not an actual charge or price estimate**.
- Implementer observed missing-helper, boundary and Windows-launcher RED cases. Initial specification review found a false-pass condition for three searches or zero-token receipts; four discriminating RED cases preceded the corrected requirement of 1–2 searches and positive prompt/completion/total tokens. Final specification re-review independently reproduced the valid and invalid cases: no remaining P0/P1/P2 findings, READY YES.
- Root full-suite runs exposed new subprocess tests with a 10-second outer timeout despite their 30-second child deadline. The default PowerShell child took approximately 15 seconds under the full suite; the same affected files passed 58/58 in isolation. Each child now has its own test with a 35-second outer timeout and unchanged 30-second child deadline. Global and actual Research timeouts are unchanged. The final full-suite result above passed after this narrow correction.
- Independent quality/security review of the final helper, tests, documents and relevant dependencies: no P0/P1/P2 findings, READY YES. This was a static review; the final full suite and actual default launcher were verified by root. No credential input yet.

## Task 2: User-assisted one-request live verification

- [x] Present the reviewed command, exact policy above and where its safe report will be saved. User enters their dedicated key only in the local hidden prompt.
- [x] Key-only preflight confirmed a fresh limited inference key in the 04:02 report below. The real-execution mode still performs fresh key preflight before its sole Research POST. Never print full key metadata or raw error bodies.
- [x] Inspect and record the first actual `live-one` report: 04:23 HTTP 403 / failed, one Research POST; detailed evidence below. This records the attempt, not acceptance.
- [ ] Pass the live acceptance gate: actual live mode, one authorized Research POST, credible usage/cost within budget, real citations, validated owner-bound Ready package and local planning integration. A Failed or Needs review result remains incomplete. The first request allowance is consumed; another attempt requires fresh explicit authorization after diagnosis.
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

The original USD 1 helper was saved in `8ed27cb96c48f148f5046c35305f6951cd333576`; its handoff HEAD was `320bd2d9ed90d9c38f4770b391e8a279d6fed925`. At that HEAD the user invoked the masked launcher. The allowlisted report `outputs/live-research/summary-2026-09-06T03-14-44-044Z.json` records `mode: live-one`, `outcome: incomplete`, `reason: key-policy-denied`, key GET HTTP 200, **Research POST 0**, Repair 0, no run and no usage. The USD 5 key exceeds the original USD 1 policy, so it did not reach Research. Root read only this safe report, not the credential or key metadata.

The narrowly revised USD 5 helper passed TDD and independent specification followed by quality/security review. Both final reviews were static and reported P0/P1/P2: 0/0/0, READY YES. Implementer RED was 16 failures after the tests were changed first; focused GREEN was 38/38. Root verified the final full suite: **135 files / 2,396 tests passed**, 44.11s, exit 0; nonincremental TypeScript, targeted ESLint and diff check also passed.

Root's actual default PowerShell dry-run passed at `outputs/live-research/summary-2026-09-06T03-22-31-042Z.json`: `offline-dry-run`, real requests 0, Ready, 5,000,000-micros reservation, owner/fresh-account/planning/disposal checks true. Its reported cost is a fixture, not an actual charge. Application code, request parameters, production configuration and existing offline preview files were unchanged.

After local save, the user can invoke the masked launcher again: it will perform fresh key preflight and the still-unconsumed sole Research request. They can simply report “已运行”; root can then inspect the new allowlisted **`live-one`** report directly. **No real Research request, merge or push has occurred.** The earlier 2,394-test evidence above belongs to the original helper, and the new 2,396-test result applies to this USD 5 change. Production operations and deployment remain excluded.

Latest user invocation on clean USD 5 helper commit **`9fbf233ed3f9bc7b5d1fc5fc4bc54b4cf7c8a4b5`** produced `outputs/live-research/summary-2026-09-06T03-30-05-252Z.json`: `mode: live-one`, `outcome: incomplete`, `reason: key-check-failed`, key/Research HTTP statuses null, one key GET attempt, **Research POST 0**, Repair 0, no run/audit/usage/reservation, database disposed. The report was written approximately 10 seconds after its timestamp, consistent with the existing 10-second key-preflight deadline; the safe report does not establish the exact network cause.

Root then made two unauthenticated, non-inference connectivity checks against the public Sol endpoints metadata URL, reading no credentials: Node v24.14.1 returned HTTP 200 in 905 ms, and the system PowerShell client returned HTTP 200 in 650 ms. These checks show that public metadata was reachable at that later time, not that the earlier authenticated key check succeeded or that its cause is proven. No code or timeout change was made. Both user invocations still have zero Research POSTs; the user may manually invoke the same reviewed command again for fresh key preflight and the sole unconsumed Research. There is no automatic retry and no completed live-validation claim.

## Key-only diagnostic continuation

The user subsequently requested “继续帮我解决api key的问题”. The latest clean starting HEAD is `6e14cbaad0644f2bc7b5de1545a753988f39cacb`; no new user report appeared after the 03:30 preflight. Root repeated unauthenticated connectivity checks with the launcher's actual child-process settings, including removal of `OPENROUTER_API_KEY` and `NODE_OPTIONS`, no interactive input and no visible child window. Public model metadata returned HTTP 200 in 1,362 ms; the key endpoint without authorization returned the expected HTTP 401 in 2,200 ms. The response bodies were discarded. There is no demonstrated need to restore arbitrary Node startup options, change proxy settings or relax TLS.

The current `key-check-failed` summary cannot distinguish a request deadline, body-read deadline, network exception, unsuccessful HTTP status or malformed response. Implement the smallest diagnostic extension under the existing TDD and independent specification/quality-review workflow:

- Add explicit `-CheckKeyOnly` / `--check-key-only`, mutually exclusive with real Research execution. Continue using the masked PowerShell prompt and anonymous stdin pipe. Invalid mode combinations must fail before prompting or network access.
- Key-only mode performs one key GET and cannot issue a Research POST, even if key preflight passes. Enforce that restriction in the transport. Do not create a Research run, audit, reservation or plan. Use a distinct `key-check-only` report mode; a successful key check is not successful live Research validation.
- Add allowlisted diagnostic stages, failure categories and bounded elapsed time. Preserve the existing safe overall reason and HTTP status, and never output raw exception text, headers, response bodies or opaque key metadata.
- Keep the 10-second key deadline, 120-second Research deadline, fixed Sol, USD 5 ceiling and no automatic retry. Do not change product, production or browser-preview configuration.
- Observe discriminating RED/GREEN tests for key-only admission and POST rejection, conflicting modes, request/body timeout classification, HTTP/format failures and canary-output exclusion. Complete independent specification then quality/security review and root verification before local commit and user credential input.

The implementation observed **11 RED failures / 48 tests**, then **48/48 GREEN**. Final independent specification review followed by quality/security review both reported **P0/P1/P2: 0/0/0, READY YES** (static reviews). Root verified **135 files / 2,406 tests passed**, 45.95s, exit 0; nonincremental TypeScript, targeted ESLint and diff check passed. Root's actual default PowerShell invocation also passed: `outputs/live-research/summary-2026-09-06T03-55-04-760Z.json`, `offline-dry-run`, real requests 0, Ready/account/planning/disposal checks true. This is offline fixture evidence only.

The new report field is `keyDiagnostics`, containing only `phase`, `failure`, and elapsed milliseconds clamped to 0–10,000. Key-only pass requires the existing key policy to pass, and reports `mode: key-check-only`, `outcome: passed`, key HTTP 200, phase `complete`, one GET and zero Research. It is distinct from live Research success. Request/body timeouts, network exceptions, HTTP failures, malformed responses and policy failures each receive a fixed diagnostic category.

Next user step after local save is the masked `-CheckKeyOnly` command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/live-research/run.ps1 -CheckKeyOnly
```

The user need only reply “已运行”; root will inspect the new `key-check-only` allowlisted report and use the specific failure evidence to choose the next action. No new inference request is authorized by this diagnostic mode, and no successful API-key or live-Research result is claimed yet. The original `-ExecuteOne` command remains for the separately authorized sole Research after key diagnosis is resolved.

## Key accepted; read-only deadline adjustment

On clean diagnostic helper commit **`0fb4305cf9b850b91abe692392b78b834513c027`**, the user generated `outputs/live-research/summary-2026-09-06T04-02-11-596Z.json`. It records `mode: key-check-only`, `outcome: passed`, key HTTP **200**, `keyDiagnostics.phase: complete`, failure null and **9,863 ms** elapsed. There was one key GET, **Research POST 0**, Repair 0, no run/audit/usage/reservation and disposal true. The credential and configured key policy are accepted at this check; this is not live Research evidence or proof of account credit balance.

The successful check had only 137 ms of margin under the old 10-second deadline. To make the next preflight less sensitive to that observed latency, widen only the read-only key deadline and diagnostic elapsed cap to **30 seconds**. The actual Research deadline remains 120 seconds, and the PowerShell child deadline remains 180 seconds. A 30-second key check plus 120-second Research leaves 30 seconds of wrapper allowance. Model, USD 5 ceiling, single POST, key-only POST denial and no automatic retry remain unchanged. This does not establish the exact cause of previous failures.

TDD verified that an authored 12-second key response now succeeds while stalled requests and response bodies fail at 30 seconds: **3 RED failures**, then **49/49 focused GREEN**. Independent specification followed by quality/security review of the two-file code/test change both returned **P0/P1/P2: 0/0/0, READY YES** (static scope). Root verified **135 files / 2,407 tests passed**, 41.82s, exit 0; nonincremental TypeScript, targeted ESLint and diff check passed. Documentation records the observed report without changing application or production code. The next real-execution command is still `-ExecuteOne` with masked input; no additional key-only run is required solely for this deadline change.

Root separately asked the user whether the OpenRouter account has usable credit, because a key spending cap and account funding are separate; no balance or credential was fetched. References: [current key information](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key) and [account credits](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits). No credit purchase or new paid attempt is authorized by this check. Await the user's answer before guiding the first paid Research.

## First actual Research: HTTP 403, live gate incomplete

The user answered **“OpenRouter 账户本身已有可用余额”**, then manually ran `-ExecuteOne` and reported **“已运行”**. Root verified the authoritative path, branch, clean worktree and HEAD **`31f80525c0efe556146f2830b1c049f1055de964`**, then inspected only `outputs/live-research/summary-2026-09-06T04-23-53-054Z.json`:

- `mode: live-one`, `outcome: incomplete`, `reason: research-failed`.
- Key HTTP 200, phase complete, failure null, 2,078 ms; Research HTTP **403**.
- Real request count 2 = one Key GET plus **one Research POST**; Repair 0. No automatic retry.
- Requested model `openai/gpt-5.6-sol`; actual model null. Run `62288a2f-5218-40ae-9c1a-8e33ebd4ac73`, state failed, quality false, zero citations/skills, one audit, usage null.
- Local reservation released: maximum 5,000,000 micros, settled 0. Wrong-owner and second-Research rejection checks true; fresh-account activation/planning false, planning units 0, database disposed true.
- Report SHA-256: `61583f2d3999c2f7c93d92ccd32362602f0628cb9a2a3769c84799048d4819f7`.

The local ledger result is not proof of no OpenRouter charge. The adapter maps HTTP 403 to non-retryable `unavailable`; the safe summary does not retain raw error text or distinguish the exact upstream cause. No authenticated follow-up, real retry, credential/environment read or application change was performed by root. Official [error documentation](https://openrouter.ai/docs/api/reference/errors-and-debugging) and [guardrail documentation](https://openrouter.ai/docs/guides/features/guardrails/overview) describe permission, rule and content blocks as possible 403 causes; these are possibilities, not a diagnosis of this account. There is no evidence to justify adding credit, changing the fixed model, relaxing privacy restrictions or changing network settings.

Next user action: inspect [OpenRouter Activity](https://openrouter.ai/activity) around **2026-09-06 12:23 Asia/Shanghai (04:23 UTC)** and provide only a non-sensitive error short description and charge, or report that no record is visible. Revoke the dedicated test key after the attempt and confirm without sharing it. This is account-side inspection, not a new inference call. Any second Research requires a diagnosed next step and fresh explicit authorization; remaining budget alone does not authorize another POST. The live gate is incomplete, so Task 3 integration and backup remain pending. This update only saves documentation; no new full-suite or production verification is claimed.
