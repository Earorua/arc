# Arc v8 public release — r206

Released on 2026-10-27. The owned Cloudflare application is live at https://arcmaps.net. Research is available to signed-in users at https://arcmaps.net/setup under the existing quotas and budget. The final UI read at 13:09:57 UTC showed an enabled **Research this role** button for 数据产品经理. The agent did not click it or create another paid run.

## Deployed state

| Component | Verified version / state |
| --- | --- |
| Site: arc-v8-migration-shadow-20260922 | `0d8c98f4-c3a8-4b0d-a599-7890dc52237a`; deployment `6719e59b-a450-404f-ac62-4373afae92e3` |
| Private executor: arc-v8-migration-research-executor | `58ce29e7-80df-4d78-8a28-c7dcdf614555`; deployment `0d3eb1ac-9378-4d27-b2fa-a70d4a0e1f5d` |
| Research cohort | `role-research-beta`, enabled, empty cohort restriction; authentication, ownership and usage checks remain |
| Canonical domain | `arcmaps.net`, owned Worker custom domain; workers.dev and previews disabled |
| WWW | Proxied CNAME to apex; 308 to HTTPS apex, preserving path and query |
| Old Sites hostname | v20 / env revision 13; 307 for normal GET/HEAD, API/mutation access closed; old custom domain detached |
| Smoke environment | Site `b38bd5c0-662f-49fb-90d5-7e2295498034`; executor `fb78e3d4-ff9d-450e-bc98-bee0ed2cf348`; accepted closure, no further C input required |

The production executor intentionally has its minute schedule enabled to recover and finish real requests. This is separate from the closed smoke executor. Its endpoint and receipts remain private; the Site uses a service binding.

## Accepted evidence

- Task15: all six controls and 18 signed replay steps passed, exactly once. Independent `closure-reconciliation-r202/result.json` verifies both drains, secret disposal and a 95.026-second Scheduled observation with no observed invocation. This does not prove permanent absence of platform invocations. The original r198 failure remains unchanged; its final read timed out after the functional scenarios had passed. No scenario was repeated to replace that record.
- Existing r159 real Research evidence is retained: accepted result, 8 skills, 15 sources, 24 units, 10 searches, USD 0.339742. No new model request was made for this cutover.
- Final legacy private export: 45 tables / 849 rows / 0 objects. Learning and Research data had no new business delta. Credential metadata and obsolete sessions were preserved in backup but not blindly imported. New and original learning histories both remain; the default is the Research 数据产品经理 plan.
- Google and GitHub sign-in on the final domain both reached the same merged account. Today, Path, Proof and old plan history were opened. Microsoft/MIT official sources were visible.
- An overdue-unit Delay error was reproduced offline and fixed by applying the exception on the event's planning date. Two regression cases failed before the fix; 74 related tests, typecheck, local backup replay and production build passed. Twenty-one ownership/history tests also passed. The real proposal persisted across reload; discard persisted across reload and preserved the active schedule.
- Eight anonymous HTTP/redirect checks passed. A separate non-owner live sign-in was not performed; this limitation is preserved alongside the ownership tests and signed-control evidence.
- Final Site and Executor deployments, exact configurations and native version readbacks passed. The public cohort was applied once and read back. The final signed-in UI showed the Research button and no closed notice.

The Today checklist is a local interaction; ticking it alone is not a persisted completion event. This release verification exercised the persisted planning proposal/discard flow, not a claim that checkbox state survives reload.

## Source and backups

Canonical source: `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`.

Frozen deployed candidate: `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/restricted-research-candidates/public-planning-overdue-closed-20261027-r203`, 129 artifacts, manifest SHA-256 `7bf7bcad7b0fc75cb722b58cb4c23417243fb9537ad2e524a52774c6336caee9`. Only the planning reducer differs from the prior accepted application source; executor code is unchanged. The exact active/closed/drain configurations are under `final-config-r203/`; packet SHA-256 `33e4752dfd844ffccac170dede06eca139124befda339c5c6b5fc21b9653ddad`.

Private backups: `C:/Users/XF/.codex/private-backups/arc-v8/final-cutover-20261027-r193`, restricted to XF and SYSTEM. Owned pre-release SQL SHA-256 `2a301a24801af6b6720b5d995584db2e83be0f654248898a6bf9dbe78408c5d2`. Older complete restore evidence remains valid. Old projects and databases have not been deleted. No new GitHub push was performed in this cutover turn; the final reducer fix is retained in canonical source and the frozen deployed snapshot.

## Operating limits and recovery

The dedicated OpenRouter key still has a USD 5 cumulative, non-resetting limit. Last visible usage was approximately USD 1.3585, leaving USD 3.64. Per-request reservation is USD 3.50; after a successful request the remaining allowance may be insufficient for another reservation. Do not silently raise the cap, recharge or create another key. Per-user quota remains one request per day, one per minute; site day/month caps remain USD 5. Automatic paid repair is disabled. Model calls initiated by the agent during cutover: zero.

If an incident requires closing intake, first deploy the exact Site public-closed configuration, then the Executor drain configuration (new intake off, maintenance on). Reconcile all active jobs, deliveries and reservations before deploying Executor public-closed (maintenance off, no Cron). Preserve all Secrets and production resource identities. The deployment helpers in this directory are single-use; do not rerun consumed commands. Prepare a scoped new operation against freshly read versions if recovery is actually needed.

Never restore the pre-release database snapshot over new public writes. Freeze and reconcile the later data before any restore; prefer a forward fix. The exact cohort rollback SQL is retained in `public-cohort-r205/restore-restricted.sql`. Do not revert DNS to the old Sites app independently of application/data state.

## Current next action

The first public-release objective is achieved. The user can sign in, open `/setup`, enter a role, and deliberately select **Research this role**. Merely opening the page does not submit Research. No further smoke round or control-secret input is needed. Future design changes, higher usage limits and additional paid test runs are separate work.

Read `release-receipt-r206.json` for hashes of the final evidence and `public-research-enabled.png` for the visible result. Historical failures and earlier closed/pending checkpoints are retained; they do not describe the current production state.
