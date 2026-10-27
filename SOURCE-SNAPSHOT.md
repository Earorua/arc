# Arc v8 public-release source snapshot — 2026-10-27 / r207

This branch backs up the latest working source and saved progress requested by the owner. The first public-release goal was completed at **r206**; **r207** records the state before closing Codex. The live site is [arcmaps.net](https://arcmaps.net), and [Research](https://arcmaps.net/setup) is enabled for signed-in users. This backup does not redeploy the site, restart Research or change its budget.

## Source layout

- The repository root contains the current **release-integration** application, private Research Executor, schema migrations, build tools, tests, and locked dependencies, including the previously uncommitted working files. The current Research source-authority rules, learning history, account recovery, and learning-agent source are included.
- `docs/` combines the integration documentation with the latest development plans and progress notes. The development copy wins when a documentation path exists in both trees.
- The CI workflow retains the Node **24.14.1** runtime fix already merged into remote `master` at `99c68c9986fec7f9a66cbed3f3e597a80ee7bba4`. Its source commit is identified in the manifest; the older integration workflow is preserved in the archive.
- [Recovery records](docs/source-backups/2026-10-27-r207/) contain the r207 checkpoint, r206 release record and hashed receipt, and accepted Task15 functional closure.
- [Development and rehearsal source archive](docs/source-backups/2026-10-27-r207/research-development-and-rehearsal-source.zip) preserves **1,186 files**: the separate development checkout, U10 tools and pinned dependencies, subsequent continuation and read-only closure diagnostics, and final cutover tools/configuration. Its internal manifest records each file's SHA-256. These tools retain original paths and consumed-operation guards; they are historical source, not fresh cloud commands.
- [Source manifest](docs/source-backups/2026-10-27-r207/source-manifest.json) identifies **923 root source/handoff files**, selected source locations and the archive hash. Previous r126/r188 backups remain in the branch's history and dated directories.

No application behavior was changed for this backup. The README was corrected to the official domain and current release state. Verification covers source completeness, source/archive byte identity and readback, and a credential-pattern scan. Existing deployment and functional acceptance are linked evidence; they were not rerun merely to create a source backup.

## Current status

Real Research and official-course sourcing, all required background functional scenarios and replay, full migration, final-domain Google/GitHub login, old/new plan history and persisted proposal/discard flow have passed their recorded release checks. The overdue-unit Delay fix is included in the latest deployed source. The original r198 nonzero exit remains unchanged; a separate complete read-only supplement established actual functional closure. No repeated smoke or control-secret C input is pending.

Production Research and its private executor maintenance remain enabled when Codex closes. The separate smoke environment is closed. The provider key remains capped at USD 5 cumulatively without reset; last displayed remaining allowance was approximately USD 3.64, against a USD 3.50 reservation per run. Existing quotas and day/month caps remain. The agent made no paid model call during cutover or this source backup.

## Excluded material

Actual secrets, credential files, installed dependencies, generated application bundles, raw operational responses/logs, databases, and object-store contents are excluded. `.env.example` contains placeholders. Some recovery records refer to evidence intentionally retained only on the original computer. This source snapshot is not a backup of live user data or all local operational evidence.

## Resume

Read [CHECKPOINT-r207.md](docs/source-backups/2026-10-27-r207/CHECKPOINT-r207.md), [the public-release record](docs/source-backups/2026-10-27-r207/PUBLIC-RELEASE-r206.md) and the top of [the recovery checkpoint](docs/operations/v8-resume-checkpoint.md). Do not rerun completed simulations, reuse consumed commands or spend against old single-run approvals. Never restore a pre-release database over newer public writes.

Suggested continuation request:

> 继续 Arc v8，从 r207 保存点继续，先阅读正式发布记录和 GitHub 备份回执。
