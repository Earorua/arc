# Arc v8 source snapshot — 2026-10-18 / r126

This branch is a source backup requested by the project owner. The Research implementation and migration goal remain paused at checkpoint **r126**. This commit is not a deployment or a claim that public Research acceptance is complete.

## Source layout

- The repository root contains the current **release-integration** application, private Research Executor, schema migrations, build tools, tests, and locked dependencies. These are the actual working files, including previously uncommitted changes, rather than an archive of an older Git commit.
- `docs/` combines the integration documentation with the latest development plans and progress notes. The development copy wins when a documentation path exists in both trees.
- [Recovery records](docs/source-backups/2026-10-18-r126/) preserve the r126 handoff, checkpoint, Task2 review conclusions, and acceptance record.
- [Development and rehearsal source archive](docs/source-backups/2026-10-18-r126/research-development-and-rehearsal-source.zip) preserves the separate Research development checkout and the current local rehearsal tools, including their tests and referenced source dependencies. Its internal manifest records every archived file's SHA-256. These archived tools retain their original workspace paths and consumed-operation guards; they are not fresh commands to run against the cloud.
- [Source manifest](docs/source-backups/2026-10-18-r126/source-manifest.json) records the original source hashes and archive hash. The original worktrees were left unchanged.

The 252 source inputs recorded by the existing `research-local-closed-20261016-r5` candidate matched the current integration source when this backup was prepared. No application behavior was changed to create this backup. Verification for this commit concerns source completeness, unchanged original bytes, archive readback, and secret exclusion; it does not rerun cloud acceptance or assert new end-to-end test results.

## Excluded material

Actual secrets, credential files, installed dependencies, generated application bundles, raw operational logs, databases, and object-store contents are not part of this backup. The checked-in `.env.example` contains placeholders. Local recovery records may reference evidence that is intentionally retained only on the original computer. This is a source backup, not a complete backup of live user data or all local operational evidence.

## Resume

Read [save-handoff-r126.md](docs/source-backups/2026-10-18-r126/save-handoff-r126.md) before continuing. Task2 is accepted locally; Task3, the remaining complete fault/replay/closure sequence, a capped real Research test, data migration, and public release acceptance remain outstanding. Do not repeat consumed preparation commands or reuse old paid-model authorization.

Suggested continuation request:

> 继续 Arc v8，从 r126 保存检查点继续，优先核对受限真实 Research 测试路径。
