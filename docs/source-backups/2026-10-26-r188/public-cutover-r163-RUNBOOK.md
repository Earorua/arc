# Arc v8 public cutover preparation

Prepared 2026-10-25. This is a concrete execution sequence, not evidence that DNS, data or public Research has changed. Preserve the successful r159 Research and r160 saved plan. Do not request another paid model result to repeat those checks.

## Exact current baseline

- Owned account: `54eaadb89014252836694203c1e22546`; zone `a4c139e1f9f7b181283f90ee722e1778`; canonical domain `arcmaps.net`.
- Old Sites project `appgprj_6a6678d3e3848191a352778c6db1e7b1`, public v19, source `62f0737c94762784d41f2ec294ace080b2ae13fd`. Export route exists but is disabled. Old application source is `work/legacy-export-v18-r144`. Its own hostname is `arc-precision-path.jiahe-xu.chatgpt.site`.
- Owned Site `arc-v8-migration-shadow-20260922`, version `371701fb-1d0e-4015-82bb-2837f2fda595`; D1 `64e78443-b58a-4d13-bc15-d1a187b52bf8`, London placement. Current baseline config: `../research-new-goal-r160/site.closed.wrangler.json`.
- Owned Executor `arc-v8-migration-research-executor`, version `5633d10f-f91a-49a2-a66b-8f64075060f8`; D1 `0ca16ec5-adce-49d0-ae63-1416c631bd90`, us-west-1 placement; private R2 and service bindings retained. Baseline config: `../source-quality-single-run-r159/closed/executor.wrangler.json`.
- All Research admission/maintenance switches are currently false and Cron is empty. No model, receipt cleanup, reservation or import is pending. Preserve the documented historical r153 terminal no-result exception.
- Final application source belongs to `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`. Never replace it with this operational checkout's older app.

## Final data transition

1. Finish the remaining scoped Task15 fault/replay acceptance. Its isolated smoke resources are distinct from both production databases; its fixture records are not migration evidence.
2. Prepare and test a small old-site maintenance guard before the quiet window. While frozen, every dynamic request is answered before the application can mutate data, except the exact owner-authenticated `POST /api/admin/data-export`. Authentication for that export remains required; do not add a bypass. Sign in the owner before freezing. The mode must not silently expire back to accepting old writes after the cutover. Rollback is the retained v19/config, not an unbounded timer.
3. Freeze old writes only when the final export and domain operation are ready. Export through the already tested owner flow into a private local backup. Keep the original r144 full backup unchanged. Capture a fresh owned D1 backup and compare business data with the already restored/account-merged baseline. Session/token tables are not blindly imported. Zero R2 objects was the earlier observation; verify the final inventory rather than assuming it.
4. Apply only demonstrated old-site business deltas, with exact account mapping and atomic writes where supported. Preserve r160's new default Research goal, all old archived goals, workspaces, events and proofs. Avoid replaying the old full restore over the newer owned database. Verify counts and typed row hashes for the affected tables; the existing full restore test is not repeated.
5. Keep a narrow owned-site write-quiet window while final reconciliation is applied. Before enabling public writes, save the resulting database and asset references as the rollback baseline. Once public writes begin, a DNS rollback alone is insufficient; first freeze new writes and reconcile the new delta. Never discard newer public data by restoring an older snapshot.

## Origin and domain transition

1. Reuse the current built Site/Executor artifacts and secrets. Change `BETTER_AUTH_URL` to `https://arcmaps.net` on both sides, retaining the private executor origin and service-binding transport. Keep Research closed throughout domain/login verification. Registered Google/GitHub apex callbacks are already confirmed in `../resume-r152/oauth-callback-readback.json`; no new client or secret is needed.
2. Preserve the four original public DNS records in `../resume-r152/public-domain-readback.json`. Prepare the exact apex Worker Custom Domain attachment and old Sites domain detachment as one coordinated transition, with a reverse sequence available. Do not delete the old Sites project or databases.
3. Attach only `arcmaps.net` to the owned Site, verify the deployed Worker, TLS and an actual page response, then verify login with the existing account and the saved default/history. Keep the Executor without any public route or workers.dev/preview URL. After apex access is verified, disable the Site's shadow workers.dev entry if no longer needed.
4. Add a proxied `www` record and a single exact-host HTTPS redirect to `https://arcmaps.net`, preserving path/query. Do not use an unrestricted host wildcard or redirect unrelated domains. Verify root and www behavior directly. Old Sites hostname should then show a move notice or safe GET redirect, with old mutation endpoints closed.
5. Verify Google/GitHub session identity, refreshed Today/Path/History, a reversible learning event and Proof access, public metadata and non-owner isolation. No new Research POST is necessary merely to revalidate the already accepted model result.

## Public Research enablement and limits

The public feature remains closed until the above transition passes. The existing dedicated OpenRouter Key has a USD 5 cumulative non-resetting cap; last verified usage USD 1.358547, remaining USD 3.641453. Do not recharge, raise the cap, create another key, or automatically retry paid calls. Current request reservation is USD 3.5, user quota one/day, rate one/minute and Site day/month budgets USD 5. Recheck actual usage before enablement.

The restricted `role-research-beta` account cohort must be changed deliberately for public logged-in use, with the prior exact row retained. The final enablement packet must include that change, both active Worker configs, the quota/cost settings, and an immediate admission-close/drain/maintenance-close procedure. Enabling future user-triggered paid requests and performing a new agent-triggered paid test are distinct actions; r159's single-call license has already been consumed.

If model credits are exhausted, keep existing plans/history usable and report Research unavailability; do not silently switch to another account or paid key. The accepted source rule remains official authoritative courses, US top universities and companies preferred, Chinese top companies secondary, with references clearly distinguished from courses.

## Rollback records to retain

Record actual old/new deployment IDs, full DNS/route mutations, original cohort row, exact pre/post data hashes, and the private backup locations. Before public writes, rollback can restore the old domain/config and unfreeze v19 after confirming traffic. After public writes, use a forward fix or reconcile the new write delta first. Leaving old histories available is intentional; it is not evidence that the new default reverted.
