# Arc v8 — r207 saved state, 2026-10-27

The user asked to save progress and push the latest source before closing Codex. The first public-release goal remains **complete**. This save operation does not disable production, change its resource bindings, restart a cloud simulation, or authorize a new paid model request.

- Official site: https://arcmaps.net
- Research entry: https://arcmaps.net/setup
- Production Site version: `0d8c98f4-c3a8-4b0d-a599-7890dc52237a`
- Private Executor version: `58ce29e7-80df-4d78-8a28-c7dcdf614555`
- Final release receipt: r206, SHA-256 `9a457b731c5fb6cade8980801f2c60054533e895b3c7737f1fabb7a8c4820f84`
- Task15 functionality and actual closure were accepted using the independent r202 supplement. The original r198 failure remains unchanged. No smoke task or control-secret C input remains pending.
- Google/GitHub login, new Research plan, old history, official learning resources and actual proposal/discard cloud persistence passed release checks. Private backups and original data remain on the owner's machine/account.
- Public Research remains active with the existing limits: USD 5 cumulative provider-key cap, non-resetting; last observed remaining allowance approximately USD 3.64; USD 3.50 reservation, one request/user/day and one/minute, USD 5 site day/month limits. Do not recharge or raise limits without the user's instruction. Failed model calls can still cost money.

The old Sites project record still advertises its platform URL. A fresh check on 2026-10-27 found no Sites custom domain attached, old URL HEAD 307 to `https://arcmaps.net/`, and direct apex HEAD 200. The old-link redirect remains on Sites; the current application, data and Research run independently in the owner's Cloudflare account. Always provide the canonical domain. The repository README has been updated accordingly; this is a documentation-only change after release.

Canonical application source is at `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`. The active development/recovery checkout is `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`. Both remain intact. The public snapshot uses canonical application source, the latest development documentation, and the already merged Node 24.14.1 CI workflow. Current operation-tool source is archived separately; consumed tools are historical source, not fresh commands.

GitHub snapshot branch: `Earorua/arc` → `codex/arc-v8-source-snapshot-20261027`. Exact commit and remote verification are recorded in the local `outputs/github-source-20261027/push-receipt.json` after pushing. The default branch and production deployment are not changed by this source backup. Actual secrets, live database/object data, installed dependencies, generated bundles and raw operational logs are excluded.

Local release detail: `outputs/local-resource-access-20261027/public-cutover-r199/FINAL-r206.md` and `release-receipt-r206.json`. The dated GitHub backup directory also contains portable copies of the release and this checkpoint, plus a source manifest.

Closing Codex leaves the live website running. Production maintenance remains enabled for real requests; the separate smoke maintenance is closed. Do not restore a pre-release database over new public writes. Future work starts from the current live state and the user's next request; do not reopen completed rollout tasks based on older notes.

Suggested continuation: **继续 Arc v8，从 r207 保存点继续，先阅读正式发布记录和 GitHub 备份回执。**
