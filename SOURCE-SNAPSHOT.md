# Arc v8 source snapshot — 2026-10-26 / r188

This branch backs up the latest working source requested by the project owner. The release goal remains paused at **r188**. This source upload does not deploy the website, restart a Research job, or enable public Research.

## Source layout

- The repository root contains the current **release-integration** application, private Research Executor, schema migrations, build tools, tests, and locked dependencies, including the previously uncommitted working files. The current Research source-authority rules, learning history, account recovery, and learning-agent source are included.
- `docs/` combines the integration documentation with the latest development plans and progress notes. The development copy wins when a documentation path exists in both trees.
- The CI workflow retains the Node **24.14.1** runtime fix already merged into remote `master` at `99c68c9986fec7f9a66cbed3f3e597a80ee7bba4`. Its source commit is identified in the manifest; the older integration workflow is preserved in the archive.
- [Recovery records](docs/source-backups/2026-10-26-r188/) contain the r188 checkpoint, original LONG acceptance progress, remaining continuation plan, and prepared public-cutover notes.
- [Development and rehearsal source archive](docs/source-backups/2026-10-26-r188/research-development-and-rehearsal-source.zip) preserves **1,090 files**: the separate development checkout, current U10 rehearsal tools and pinned source dependencies, r185/r186 helpers, and prepared cutover tools/configuration. Its internal manifest records every archived file's SHA-256. These tools retain original paths and consumed-operation guards; they are historical source, not fresh cloud commands.
- [Source manifest](docs/source-backups/2026-10-26-r188/source-manifest.json) identifies **928 root source/handoff files**, the selected source locations, and the archive hash. The previous r126 backup remains available in this branch's history and under its dated backup directory.

No application behavior was changed for this backup. Verification covers source completeness, unchanged original files, source/archive hashes and archive readback, plus a credential-pattern scan. It does not assert new functional tests, cloud acceptance, or release completion.

## Current status

Real Research generation, the authoritative-source learning plan, and persistence passed before this snapshot. The original U10 simulated LONG task also reached ready after 19 minutes 30 seconds. Admission and maintenance are closed, with Cron empty. The original combined rehearsal proof remains incomplete; final receipt/drain verification and the remaining fault/replay checks are outstanding. The r187 continuation is a plan, not implemented runtime code.

After those checks, the remaining release work is the final data delta/backup, domain and OAuth cutover, and public Research enablement with release verification. Read the checkpoint for exact boundaries rather than treating old scripts or configuration examples as current deployment instructions.

## Excluded material

Actual secrets, credential files, installed dependencies, generated application bundles, raw operational responses/logs, databases, and object-store contents are excluded. `.env.example` contains placeholders. Some recovery records refer to evidence intentionally retained only on the original computer. This source snapshot is not a backup of live user data or all local operational evidence.

## Resume

Read [CHECKPOINT-r188.md](docs/source-backups/2026-10-26-r188/CHECKPOINT-r188.md) and the top section of [the recovery checkpoint](docs/operations/v8-resume-checkpoint.md). Preserve the demonstrated LONG result; do not rerun it to repair expired local evidence. Do not reuse consumed commands or old single-run paid-model authorizations.

Suggested continuation request:

> 继续 Arc v8，从 r188 暂停检查点继续，先完成已关闭演练的剩余核对，保留 LONG 成功结果，不要重新启动长任务。
