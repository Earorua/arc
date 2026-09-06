# Arc v8 Goal 2 — offline acceptance record

Status: **Tasks 10, 11 and 13 are closed for the authorized offline engineering scope.**

User acceptance: **the user explicitly accepted this guided local UAT round on 2026-09-06**, at unchanged application code on `976903c105a10e71cf4f73cfd40f05b1b82489d8`. See the separate user acceptance record below.

**Subsequent authorization (2026-09-06):** The user requested real validation, local merge and GitHub backup, confirmed a USD 1 total budget and explicitly selected GPT-5.6 Sol after requesting a stronger model. Preparation now follows `docs/superpowers/plans/2026-09-06-arc-v8-live-validation-and-backup.md` with fixed `openai/gpt-5.6-sol`, one Research and no automatic retry/Repair. This supersedes the historical unauthorized wording below only for that bounded scope. No real request, merge or push has been performed yet; the offline evidence and user sign-off remain unchanged. Production operations and deployment remain excluded.

**Offline Research Beta complete; no live OpenRouter evidence claimed.**

## Execution boundary

- Worktree: `C:\Users\XF\Documents\Codex\2026-07-26\sites-plugin-sites-openai-bundled-2\.worktrees\v8-openrouter-research-beta`.
- Branch: `codex/v8-openrouter-research-beta`.
- Task 13 code: `81c4c26be2a82c2611c1ae0363b14b90ad3586c3`; prerequisite Task 11 code: `1575a1e0272609cfe426d361a8c3851654e70acc`.
- Only authored Fake Provider results, synthetic test owners and disposable local databases were used. Source/document URLs were displayed or saved as test metadata; no source or submitted artifact was fetched.
- No real credentials, real or paid Provider calls, production variables/flags/D1/R2, merge into `master`, push, Sites candidate or deployment.
- Explicit acceptance of this guided local UAT round is recorded below. Live Provider evidence remains a separate, unauthorized and unperformed gate.

## Reviews and remediation

Task 10 and Task 11 were closed before Task 13; Tasks 1–9 and 12 were not redone. Task 11's independent specification review was 22 files / 428 tests and quality/security review was 18 files / 383 tests, both Critical 0 / Important 0 / Minor 0, READY YES. Its root gate passed 130 files / 2324 tests, nonincremental TypeScript, full lint, build 5/5 and rendered/client artifacts 4/4. Those counts are prerequisite evidence, not final Task 13 counts.

Task 13 harness `e8bfaca` mounts the actual pages, hooks, clients, route factories, services and repositories. Browser UAT found seven empty audit categories for a one-skill Research package; two discriminating RED tests preceded the one-line omission in `efb1e25`. Quality review then found one Important Windows/Vite asset-path bypass. Four discriminating RED cases preceded the fix in `504e3aa`. Bounded API-result diagnostics and an actual HTTP-client regression were committed in `81c4c26`; diagnostics retain at most 20 method/path/status entries without query strings, bodies, headers or raw errors.

Final independent reviews at exact `81c4c26`:

| Review | Result and independent evidence |
| --- | --- |
| Specification | Critical 0 / Important 0 / Minor 0, READY YES; 8 files / 153 tests; HTTP entry 19/19 and actual HTTP clients 1/1; diff check passed. |
| Quality/security | Critical 0 / Important 0 / Minor 0, READY YES; 6 files / 55 tests; HTTP entry 19/19 and clients 1/1; actual nonpersistent Miniflare/workerd D1 9-step chain and five atomic conflicts, zero false success receipts/foreign-key violations; nonincremental TypeScript, targeted ESLint and diff passed. |

## Final root automated gates

All commands below ran after both final reviews on exact clean commit `6dd64286b23dedf6180d6b48bdfeb31ff063a915`. The worktree was still clean afterwards. Its application/test/script code is identical to reviewed `81c4c26`; this closure update changes only documentation.

| Gate | Result |
| --- | --- |
| Full unit suite | PASS, exit 0: **134 files / 2358 tests**, 42.68s. |
| Full ESLint | PASS, exit 0. |
| TypeScript without incremental caching | PASS, exit 0, `--noEmit --incremental false`. |
| Local production build | PASS, exit 0, all 5 build stages; Research eligibility/start/GET/retry, planning, Proof and workspace routes present. |
| Rendered HTML and client bundle checks | PASS, exit 0, **4/4**; no secret identifiers or unused Provider usage/cost schema in client artifacts. |
| Explicit migration/security suite | PASS, exit 0, **5 files / 256 tests**, 3.44s, on final tested commit. |
| HTTP harness entry and actual clients | PASS, exit 0, **20/20** (entry 19 plus actual HTTP chain 1), temporary server closed. |
| Local nonpersistent Miniflare/workerd D1 | PASS, exit 0, **9-step chain + 5 atomic conflicts**, false success receipts 0, foreign-key violations 0; disposed. |
| Committed-source secret and production-boundary scans | PASS: filename-only source matches were the plan's scan expression and two pre-existing negative-test fixtures, both byte-unchanged from `2a82567`. Client `rg` returned 1 with zero matches (expected no-match result). Production configuration, environment example, bindings, migrations and dependencies had no changed paths from `2a82567`. |
| Diff and clean-tree check | PASS, exit 0 for Task 13 commit-range diff; branch/path/HEAD rechecked, clean before and after all gates. |

Reproduction commands (already installed dependencies; no installation or live secret required):

```powershell
npm run test:unit
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
node --test tests/rendered-html.test.mjs
npm run test:unit -- tests/db/migration-safety.test.ts tests/db/research-migration.test.ts tests/server/planning-security.test.ts tests/server/openrouter-provider.test.ts tests/api/research-routes.test.ts
node --test --test-concurrency=1 tests/offline-uat/entry.test.mjs tests/offline-uat/http-clients.test.mjs
node tests/offline-uat/miniflare-smoke.mjs
git diff --check 0c06f97d3cfc4e15a14e12ca3a684100ac69f4ca HEAD
```

For a new disposable browser session only: `node tests/offline-uat/start.mjs`, then open `http://127.0.0.1:4179/setup`. This harness is not the production server.

## Browser composition and evidence limits

The isolated loopback harness uses programmatic Vite without normal deployment configuration, environment files, OAuth, Sites or production bindings. Synthetic session controls sit outside the product main region. Control and product writes require the local process token; unknown APIs and outbound application requests fail closed. HTTP asset tests exercise actual Windows case/encoding/path-alias restrictions.

The first root-owned preview started on `efb1e25`; the product changes after that revision are only harness changes. After the final reviews the root restarted the service on exact `81c4c26`, then repeated Guest Build, the original device-history Research Build, budget/Flagship fallback, failures and legacy flows. The preview was stopped and the viewport override reset after UAT.

An earlier fresh-owner Build failure was not reproduced in the latest root-owned service with the same Guest local-plan and device-history prerequisites. The successful trace and database counts are recorded below. The historical cause was not established; no product workaround or inferred database reset is claimed. An earlier child-owned preview had exited, and a failed diagnostics refresh had left an old visible snapshot.

Active refresh tests first pause a genuinely persisted owner-bound Researching or Validating run. The ordinary Research action coalesces onto that run and receives its ID before reload. This proves active-run replay and GET recovery, not recovery of an initial POST which never returned an ID. Initial-submission interruption and source-change races have deterministic automated evidence, explicitly distinguished below.

## Functional and visual inventory — root browser observations, 2026-09-06

| Scenario | Evidence |
| --- | --- |
| Guest Flagship | Actual 16-skill audit → availability → target → Build → Product Foundations Path → actual Today unit. Cloud goal/plan/receipt counts stayed zero and local planning was present. Guest Build was repeated on the final service. |
| Eligible custom Research | Fresh Owner A, no preseeded goal/plan: explicit Research → Ready with role, summary, 1 skill, 1 source, observed 2026-09-05 and passed quality checks → one-category Data audit → availability → target → Build → Measurement foundations Path and actual Today resource/steps/60 minutes. |
| Device history isolation | Final-service run `608f2718-9b64-4f72-ba4d-3946daa316bd`: Guest local plan and device completion/proof counts 1/1 existed before Owner A Research. Afterwards goal/plan/activation receipt were each 1, cloud learning/events/Proof remained zero, device history stayed 1/1 and local planning remained present. Trace: planning GET 404, migration POST 200, planning GET 200, generation POST 200. Import remained an explicit choice; Not now was selected. |
| Authenticated Flagship fallback | Fresh Owner B selected Use Flagship after an uncached Research request was budget-rejected. Actual audit/availability/target/Build produced a Flagship cloud plan. Owner A's Research role stayed intact; two owners had two goals/plans/receipts, cloud history/Proof zero, device history still 1/1. |
| Legacy custom unavailable | Fresh Owner B with Research disabled completed ordinary Ecologist Setup. Path, Today, Stack and Proof all showed the explicit flagship-sample disclosure; Stack contained 16 sample skills and cloud evidence stayed read-only without a cloud goal. No goal, plan, Research run or cloud history was created. |
| Legacy custom declined | Fresh Owner A with Research available deliberately chose Continue instead of Research for Ecologist. The same four pages retained the explicit sample disclosure; no Research or cloud writes occurred. |
| Existing immutable plan | After Research Complete/replan/Proof, an attempted new Flagship Build was rejected at planning preflight. No mutation POST followed. Existing DPM goal, plan, five events, one receipt and one Proof stayed unchanged; actual Path still showed Measurement foundations. |
| Concurrent setup guard | Automated real SQLite and actual local workerd D1 each cover five conflicting setup races with complete rollback, unchanged common role/plan and no false receipt; see storage evidence below. This is deterministic race evidence, not a manually timed browser race. |
| Research workspace/recovery | Actual Path/Today/Stack/Proof used only the researched Data modeling skill. Clearing the browser recovery identity then full-page refreshing Stack restored the research source from the account, with no browser-stored package. |
| Ready refresh | Run `e7f95728-54cc-4a8a-9e2f-1946b27b97ca` restored Ready with one Fake call/run/audit. Browser storage contained only runId, role and locale. |
| Researching refresh | Persisted run `a4a5e757-f15c-4722-8534-a8f2d74589ff` survived full reload with the same ID and busy state; Resume produced Ready with one invocation and one Fake call/audit. |
| Validating refresh | Persisted run `ba12c436-39b0-41b9-a62f-3025445bdf82` survived full reload with the same ID; Resume produced Ready with one invocation and one Fake call/audit. |
| Needs review | Run `5b580855-757b-435c-ba11-4d62d7759023` showed stable learning-unit issues, no Use action, and allowed Retry/Flagship. Reload preserved it. Explicit Retry produced Ready run `601f1a5d-dd9d-4f78-9cb5-5c0e002417c7`, which subsequently built the plan used for Complete/replan/Proof UAT. |
| Retryable failure | Fake timeout run `83c07509-2e6d-4b16-a8ed-46e3c8eedaae` displayed a stable timeout message and Retry/Flagship. Reload used GET only. Explicit Retry produced Ready `e9d7452b-0652-46f7-be1b-7f29603931b5`; two invocations, one successful Fake call, two audits. |
| Non-retryable failure | Fake filtered run `9b71d0cf-bdff-4cbf-82d5-1211ff783ab3` persisted across reload with retryable=0, no Retry/Use, and a stable safe message. GET-only recovery; one invocation/audit. No raw Provider detail appeared. |
| Disabled/budget | Closing new Research and exhausting the local budget together did not prevent account-backed Stack recovery of the existing plan. On the final service, an existing DPM cache result remained reusable without another Fake call; an uncached Ecologist request returned 429 and the allowance message. Flagship fallback built successfully. |
| Complete | Checking the actual Today step then Complete persisted one completed unit; Stack became Practicing. The next actual Research task was shown. |
| Delay/Keep | A real candidate moved two units one day. Keep restored the original schedule; full-page reload retained it. |
| Delay/Accept | After completion, a new candidate moved the remaining unit from September 6 to 7. Accept produced a rest day and next-day unit; full-page reload retained that schedule. |
| Proof | The completed September 6 historical unit remained selectable after replan. A private Document proof with authored example.com URL metadata was submitted to the disposable database. Proof and Stack showed Data modeling Demonstrated, readiness 100%, Verified 0. Withdrawal changed the ledger to Withdrawn, readiness to 0%, and Stack to Practicing with the completed unit retained. No external artifact was fetched. |
| Owner isolation | Switching Owner A → B → Guest removed A's researched skill and evidence; returning to A restored authorized content. In the final browser trace, Owner B's GET of A's Research run returned 404. |
| Narrow/wide visual inspection | At 320px/1440px overrides, Ready facts were one/three columns. Document width equalled available viewport width (305/1425px after scrollbar). Viewport screenshots and bounds were inspected, without horizontal clipping; action heights were about 52.4px and 44px. Full-page screenshot capture was unavailable. |
| Keyboard/live state | Ready heading received focus; Tab reached Use Research then Flagship, Shift+Tab returned, and Enter opened the focused audit. Ready was polite/nonbusy; Researching was busy. Existing component tests cover additional state transitions. |
| Reduced motion | The visible test control applied the already authored reduced-motion CSS branch. Computed action transition/animation durations became 0.00001s; Research Ready rules have no motion. This is authored-branch browser evidence, not an OS preference change. The control and viewport were restored. |
| Same-source Back | A 45-minute Monday edit survived Back to audit and Continue. This is actual browser evidence. |
| Interrupted initial submission | Deterministic hook tests cover hidden/inactive/external abort before the initial response, return to idle, explicit same-mutation replay and no automatic POST on resume. No browser initial-POST/no-run-ID refresh claim is made. Passed in the final 2358-test suite. |
| Stale source/account during Build | Deterministic component/hook/actual setup tests cover obsolete preflight results, cancellation, no stale save/navigation/queue, and owner-bound reads. No manual race-timing claim is made. Passed in the final 2358-test suite. |

At the recorded browser checkpoints both application outbound-denial counters were zero. Fake output has conservative budget accounting; no actual Provider cost or zero-cost live request is claimed.

## Disposable storage verification

| Storage path | Evidence |
| --- | --- |
| SQLite implementing D1 | Real migrations 0000–0006, foreign keys enabled, actual route/service/repository composition. Unit smoke covers fresh owner Research → current setup → planning → Complete/fresh-service replay → wrong-owner 404 → Proof submission/withdrawal, plus five atomic conflicts. Browser observations above use this separate adapter. |
| Actual local Miniflare/workerd D1 | Nonpersistent local D1 binding, no production identifiers or persisted directory. Independently passed the 9-step service chain and five same-batch conflict cases on `81c4c26`, with false receipts 0 and foreign-key violations 0; binding disposed after execution. The root independently repeated the same checks on the final clean tested commit; all passed. |

## User acceptance — guided local round, 2026-09-06

The user explicitly stated: **“确认本轮本地验收通过”** after the following guided checks. This is acceptance of the observed local main flow, not a claim that the user personally repeated every earlier engineering, negative, visual or concurrency test.

The root started a new isolated Fake preview on clean `976903c105a10e71cf4f73cfd40f05b1b82489d8`, with the same application/test code as reviewed `81c4c26`. No source code changed during this round. The previous automated counts above remain evidence from their recorded commits; the documentation-only acceptance update does not claim a fresh rerun of those suites.

| Check | User report and root observation |
| --- | --- |
| Research and Build | Owner A researched Data Product Manager, reached Ready with 1 skill, 1 source, observed 2026-09-06 and quality checks passed, then built the 18-week Measurement foundations Path with two units. User confirmed Ready and Path. |
| Completion and refresh | The user completed both units and confirmed Practicing after refresh. Root observed Data modeling, Practicing, 2 completed units and None yet as strongest Proof. |
| Proof round trip | User reported Demonstrated after submitting the prepared private Document proof, then Practicing after withdrawal. Root observed Practicing with both completions retained, one proof/version, and successful create/withdraw responses. The authored example.com artifact URL was metadata only; no artifact was fetched. |
| Account round trip | After the user signed out of A, root used the synthetic test selector to open B. Root observed sample skills with zero completions and no A research skill. The user switched back to A and reported its progress retained; root independently observed Data modeling, Practicing and 2 completed units. |
| Delay preview and Keep | Root prepared a separate B Research plan with two uncompleted units on September 6 and 7, preserving A. User opened Delay; root observed two moves, September 6→7 and 7→8, with no added/removed units and the current plan unchanged. User selected Keep current plan and confirmed no change after refresh; root verified the original dates. |
| Delay Accept and refresh | User selected Delay again, accepted the candidate and confirmed persistence after refresh. Root observed September 6 as “Rest is part of the plan.” / Open, with the two 60-minute tasks on September 7 and 8. |

Owner A Research run: `cff1e4e9-18e9-4d00-a026-6104bde24d61`. Owner B Research run: `60b256cd-0d76-466a-bba7-7bdcb5f3d077`. At the post-B-Build diagnostic checkpoint there were two owner-bound goals/workspaces/runs, two activation receipts, two planning events, one proof/version and one Fake call/audit; B reused the validated cache without another Fake call. Both outbound-denial counters were zero at that checkpoint. These counts are not presented as diagnostics freshly read after the later Delay acceptance.

The last observed page was Owner B at `http://127.0.0.1:4179/today`, showing the accepted September 7/8 schedule. The preview was left available during sign-off; it uses disposable local data, so a future resume must check the existing process/page before resetting or starting a fresh scenario. This record preserves the evidence and acceptance, not a durable backup of the temporary database.

## Remaining gates

Final root automated gates and agent-assisted browser UAT: **passed**, with the evidence limits above. Explicit user acceptance of this guided local round: **passed, 2026-09-06**. The acceptance is saved by this documentation-only update; the feature branch and worktree are retained locally. Live Provider evidence: not authorized and not performed. Merge, push, production configuration/storage changes, Sites candidate and deployment: not authorized and not performed.

Full Goal 2 live validation is not claimed.
