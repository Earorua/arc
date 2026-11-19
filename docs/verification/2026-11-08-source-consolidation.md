# Source consolidation — 2026-11-08

The application source now combines the GitHub default branch with the latest released English interface, ink/teal palette, quiet workspace loading, and the completed local Arc identity. Paused materials work is preserved on its own branch. [SOURCE_INDEX.md](../../SOURCE_INDEX.md) is the entry point for future tasks.

## Source reconciliation

The audit covered 19 source/backup locations, including 16 working copies connected directly to Earorua/arc, two historical local Git snapshots, and one directory of prior exported checkouts. Source selection used Git ancestry and file content, not timestamps.

| Source | Disposition |
| --- | --- |
| Default branch `d49100abe4408468aa6742ab55a56fc995ebeca9` | Retain concise bilingual READMEs, the fixed Research smoke-provider hash, and local environment ignore rules. |
| Released UI `43179bcd3d5d62441d3bf1f439541fcb8ab46a5f` | Merge history and application changes: homepage hierarchy, mist/ink-teal palette, quiet loading, and English interface. |
| Uncommitted November 4 identity | Port completed geometry into current components; retain current English copy, account boundaries, workspace structure, and palette. Preserve editable original source and provide a portable exporter. |
| Materials `714ea9e54d87b91a1fee4883176d4f1dd06ecf63` | Push the exact paused checkpoint, including 30 previously local commits. Do not merge the unfinished feature into the application. |
| Historical Research copies | Retain represented source through Git history and existing backups; archive unique older variants separately. |

The latest released UI and materials branch heads were pushed and read back at exactly the SHAs above. The source integration itself does not deploy the website, migrate data, enable materials, or perform model calls.

## Completeness evidence

- Release-integration worktree: all 389 dirty files already represented in selected source/history.
- Replay/ack worktree: 348 of 358 dirty files represented; ten distinct older versions retained in the historical archive.
- Outer Research worktree, excluding 18 brand-related paths: 43 represented files and two unique historical documentation assemblies.
- Existing source backup ZIPs: all 3,228 entries matched their manifests. All 480 still-present source scripts explicitly referenced by those manifests were represented; the one missing local script remains available in its committed archive.
- Earlier materials receipt worktree: an ancestor of the latest checkpoint; all paths retained.
- Dirty phase-one materials worktree: all 71 files differing from the latest checkpoint match exact historical Git blobs. Its sole absent path is a superseded translation plan, retained as the thirteenth historical archive file.
- The [new historical archive](../source-backups/2026-11-08/manifest.json) preserves those 13 versions byte-for-byte, with ZIP integrity and individual SHA-256 checks. They are not executable application inputs.
- The application repository's stale origin/HEAD pointed at the old Research branch; it was corrected to origin/master, matching GitHub's default branch.
- Fifteen older local working copies received ignored source-routing notices. Existing application changes were preserved; the canonical repository contains a tracked [AGENTS.md](../../AGENTS.md).

See the [machine-readable inventory](../source/2026-11-08-inventory.json) for file classifications, source identities, byte counts, and hashes. The inventory identifies the application payload independently from the audit documents that describe it.

## File statistics

The application inventory contains 1,095 versioned files, including 792 application, test, configuration, tooling, and brand/asset files; 303 are general documentation and source accounting. The paused materials tree contains 2,896 versioned files. Counts include source fixtures and assets, not dependencies or build caches.

| Category | Application | Paused materials |
| --- | ---: | ---: |
| Application | 295 | 369 |
| Workers | 37 | 67 |
| Database schema and migrations | 28 | 32 |
| Build and tools | 27 | 40 |
| Tests and fixtures | 359 | 472 |
| Public assets | 6 | 2 |
| Brand sources and assets | 21 | 0 |
| Root configuration | 18 | 20 |
| Automation | 1 | 1 |
| General documentation | 303 | 1,893 |

The documentation category includes root READMEs; this explains why the materials docs/ directory count alone is 1,892. The application payload lists exact file hashes; the paused tree lists every Git blob under its immutable commit.

## Materials status

The preserved branch has 2,896 tracked files: 1,004 files outside docs/ (including its README) and 1,892 files under docs/. Both earlier materials checkpoints are ancestors. The latest checkpoint remains **PAUSED_UNVERIFIED**: the recorded run had two failures and 257 passes; the subsequent minimal edit was not retested. No new feature-success claim is made by this backup.

New materials changes contain text source/evidence using synthetic inputs. Known credential-pattern and file-type checks found no new API credentials, raw uploaded documents, databases, or private keys. This is a scoped source review, not a security certification. Ignored secrets and private local state were not included.

## Validation

- Clean dependency installation completed with Node.js 24.14.1. The install audit reported existing dependency advisories; this source task did not perform unrelated package upgrades.
- The first complete suite ran 6,910 tests: 6,909 passed and one failed because an old preview test still expected the former Chinese default. The released API deliberately defaults to English. The test expectation and description were updated; all five tests in that API suite then passed. Application behavior was not changed to satisfy the obsolete assertion.
- Full ESLint passed with zero errors and four existing unused-variable warnings. TypeScript passed with incremental caching disabled.
- Portable brand export passed independently from a clean temporary output directory; generated identity/social assets were visually inspected. The Linux workflow also runs this check.
- Independent integration review found no actionable regressions. Current UI behavior, accessible links, logo geometry, source archive, dependencies, and retained smoke-provider hash were checked.
- All 792 application/tooling/asset payload hashes match the staged Git tree. All 105 relative links in nine active documents resolve; bilingual README commands match. Changed paths and known credential signatures were checked without including ignored private state.
- Final full-suite rerun passed: 287 files and 6,910 tests, using `node node_modules/vitest/vitest.mjs run --maxWorkers=4`. This directly forwarded the concurrency option; the first npm wrapper invocation did not.
- `npm test` passed: production build plus all five rendered HTML/client artifact tests.
- Whitespace checks passed with the existing CRLF endings accounted for. No tests or source checks were disabled.
- GitHub runs the same source through clean Linux dependency installation, the portable brand check, unit tests, lint, production build, and rendered HTML. The PR/commit checks provide the publication result; the application payload hashes in the inventory identify the verified local source.

Local audit evidence: `D:/CodexTemp/arc-source-audit-20261108`. Original worktrees and historical failure evidence are preserved.
