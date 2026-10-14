# Arc v8 release source integration

This is local preparation within the user's existing approval for full Cloudflare migration and local implementation. It preserves already implemented behavior; it does not authorize another account recovery, cloud deployment, real Research request or migration of live data. Task15's accepted source/artifact set remains untouched.

## Inputs and workspace

- Research working tree: `C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta`, HEAD `7090153b4acad7b12df6a7ee4d675b46c41871dc` plus the current uncommitted runtime/test changes.
- Cloudflare migration baseline: `ddfa1b45fcca44827c86dc418ff6f734eeb19bb4`.
- Sites v11: `4d122dbc74d2322c17c88c1f4c08294924de1b42`, compared with v10 `2b0ed9376e8693250277c194c297076ff975a257`. Exact source is retained in `outputs/local-durable-executor-20261014/sites-source-inspection-v11-r1` under the Research tree.
- Destination: `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`, created from the Cloudflare migration baseline. Original trees are read-only inputs.

## Chosen approach

Assemble the existing Research changes onto the Cloudflare migration baseline in the separate destination, then integrate the v11 source behavior. This retains the verified Cloudflare build adapter and login diagnostics while preserving the Research executor implementation. Replacing the Research tree would invalidate frozen rehearsal references; replacing the migration tree directly would obscure the working login baseline. Neither is necessary.

Copy only versioned or non-ignored source/test files in `app`, `db`, `drizzle`, `worker`, `scripts`, `tests`, plus `package.json`, `package-lock.json`, `.env.example` and `worker-configuration.d.ts`, when they differ from Research HEAD. Do not copy outputs, ignored files, dependencies, credentials, runtime data or cloud operation state. Record the exact source hashes and retain the Cloudflare-only files. The shared SQLite test helper changed in both branches and requires a deliberate merge.

Preserve v11's authenticated learning continuation, sign-in error handling, account-recovery audit/service/route and retired-session rejection. Keep account recovery disabled unless its bounded server configuration is deliberately provided; no such configuration is supplied here. Preserve the Cloudflare diagnostic logger and normal account-link hooks while adding v11's session creation guard.

## Database history

Research migrations 0000–0011 stay unchanged. Add the v11 account-recovery table as `0012_account_recovery.sql` in the destination, and append its journal entry without replacing Research's 0007 snapshot or history. Schema generation must accurately represent the combined current schema and retain the existing migration chain; do not let a generator recreate previously applied Research tables merely because historical snapshots lag the hand-written SQL migrations. Verify the resulting snapshot/journal against the actual combined schema before accepting generated output.

This candidate migration chain is for an appropriate independently prepared destination. It must not be run blindly against the Sites v11 database, which already has a different 0007 migration. Actual source/destination ledger reconciliation and full D1/R2 restore remain separate prerequisites for cutover. Local schema compatibility is not live-data migration acceptance.

## Acceptance

1. A source inventory records imported files, hashes, exact inputs and deliberately merged conflicts. Original trees and frozen Task15 references are unchanged.
2. Ported v11 UI/auth/database tests expose missing behavior before implementation; focused tests then pass, including the actual installed Better Auth callback/retired-session scenario.
3. Existing Research public/executor/bridge tests and Cloudflare auth-diagnostic/migration tests pass together; neither account linking nor retired-owner rejection is weakened.
4. The appended migration is additive, old SQL bytes are preserved, an empty combined database passes foreign-key/integrity checks, and its schema agrees with the application schema. No live ledger or user data is touched.
5. Main and executor type checks, Cloudflare candidate build/preflight and independent specification then quality review pass before local acceptance.
6. Research and account recovery remain disabled by default. No cloud mutation, provider request, production recovery, DNS change or secret handling occurs.

The result is a locally validated release source candidate, not a completed Task15, Task16 or public release.
