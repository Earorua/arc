# Arc v8 release source integration implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the single integrated source task and independent specification then quality review. Root coordinates the existing cloud rehearsal separately.

**Goal:** Produce a local Cloudflare candidate preserving Research and Sites v11 account continuity.

**Architecture:** Start from the clean Cloudflare migration checkout, overlay the exact existing Research source delta, and port v11 changes using its tested v10-to-v11 patch as the reference. Append account-recovery schema after Research's migration history.

**Tech Stack:** React/Vinext, Better Auth, TypeScript, Vitest, SQLite/D1, Cloudflare Workers.

## Task 1: Assemble and verify the combined local candidate

Work only in `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`. Source paths and constraints are in the companion design. Record sanitized local results under this destination's ignored `outputs/release-source-integration-20261014/` directory.

- [ ] Verify destination HEAD equals `ddfa1b45fcca44827c86dc418ff6f734eeb19bb4` and has no user changes. Read any applicable instructions. Capture the clean baseline identity.
- [ ] Read Research `git status --porcelain=v1 -z -uall`; select only the allowlisted source roots/files from the design. For each selected path, record SHA-256 and copy exact bytes to the destination. Preserve existing migration-only paths. Do not copy any ignored `.env`, `.dev.vars`, outputs or node_modules. Handle `tests/helpers/sqlite-d1.ts` as the three-way merge of the common HEAD, Research disk and migration baseline. Save the input manifest before edits; do not copy newer input silently if its hash changes.
- [ ] Install the exact resulting package lock using `npm ci --offline --no-audit --no-fund`; if a package is absent from cache, use the same lock with normal `npm ci --no-audit --no-fund`, without changing versions. Run the existing Research/auth/Cloudflare migration baseline tests before adding v11 behavior. Investigate any baseline failures; don't weaken assertions.
- [ ] Port v11's behavioral tests first: `tests/server/account-recovery.test.ts`, `tests/api/account-recovery.test.ts`, and its changes to `tests/pages/home.test.tsx`, `tests/components/sign-in-panel.test.tsx`, `tests/server/auth-runtime.test.ts`. Merge the v11 database assertions into the existing Research tests with the destination filename `0012_account_recovery.sql`. Preserve all existing Research migration assertions and append the new expected entry. Run the focused set and record failures caused by the absent v11 feature/migration.
- [ ] Port v11 implementation: new `app/server/account-recovery/{http,service,session-guard}.ts`, `app/api/admin/account-recovery/route.ts`, `app/components/account/learning-entry.tsx`, and its changes to the account menu/sign-in panel/site header/home. Merge auth runtime/session changes preserving Cloudflare diagnostics. Add the exact account-recovery schema declaration to `db/schema.ts` and optional `ARC_ACCOUNT_RECOVERY` environment type without losing Research bindings.
- [ ] Add the exact additive SQL body from v11 as `drizzle/0012_account_recovery.sql`; append journal metadata. Create an accurate current-schema snapshot without replacing historical snapshots or generating duplicate Research DDL. Keep prior SQL unchanged and verify every journal tag maps to the intended file. Test the recovery service with the combined SQLite fixture and installed Better Auth hooks, including rollback, stale sessions and ordinary account-link rejection.
- [ ] Run `node node_modules/vitest/vitest.mjs run` for the focused imported UI/auth/recovery tests, all database tests, Research public/executor/bridge integration, and existing auth migration/diagnostic tests. Record command, exit code and actual totals. Run main `node node_modules/typescript/bin/tsc --noEmit` and executor `node node_modules/typescript/bin/tsc --noEmit -p worker/research-executor/tsconfig.json`.
- [ ] Build the Cloudflare candidate using the existing migration build configuration and inspect its resulting preflight script requirements. Run its local preflight and rendered checks using the actual build. Do not run deploy, remote D1, operator recovery, smoke controls or model calls. Keep public Research disabled until the separate cloud/paid acceptance.
- [ ] Self-review the full diff and input manifest. Record any remaining limitations honestly. Do not commit, push or change original working trees in this task; retain the candidate for Root review and later release integration.

## Review and handoff

- [ ] Independent specification review reads actual files, manifest and test evidence; resolve concrete findings.
- [ ] Independent quality/security review follows specification pass, focusing on authentication hooks, migration history, source completeness, disabled recovery configuration and preservation of Research semantics.
- [ ] Root verifies the resulting candidate and original frozen Task15 hashes, then records the exact handoff in the main recovery checkpoint. Local acceptance does not authorize or prove cloud release.
