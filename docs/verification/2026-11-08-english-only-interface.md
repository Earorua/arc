# English interface release — 2026-11-08

Published to https://arcmaps.net/. Arc-authored interface text now uses English across public pages, sign-in and account states, Setup and research progress, Today, Path, Stack, Proof, history, and learning companions. Duplicate bilingual labels have been collapsed into single English labels.

## Changes

- English visible copy, accessibility labels, placeholders, notifications, error/recovery states, default role content, and dates. Document language is `en` and Open Graph locale is `en_US`.
- Website research requests and legacy preview defaults use `en-US`; companion and planner prompts request English. Existing multilingual role aliases and user-entered content remain compatible.
- Simplified showcase tabs, adjusted heading wrapping and navigation spacing, and allowed long action groups to wrap. Removed the unused Chinese font import.
- Preserved all palette color literals, including mist `#f2f6f5`, ink `#182b30`, accent `#237a74`, and action `#176b68`. The 300 ms quiet loading behavior and parallel workspace reads from the preceding release remain intact.

## Source reconciliation

The older checkpoint incorrectly pointed to the materials worktree. This release was reconciled onto production baseline `3ebfd0ad03bcbf87ba262f05bf4029d800609a83` in `C:/Users/XF/.codex/worktrees/arc-ink-teal/ui-warm-precision`, retaining the latest palette and loading changes. Paused materials work is not included.

Translation edits made in the older worktree were archived and its 144 affected application/test files restored byte-for-byte to their pre-task snapshots, preserving the pre-existing materials changes. Evidence is under `D:/CodexTemp/arc-english-20261108/stale-source-translations` and `stale-before`.

## Verification

- 1,357 related component, page, library, API, and service tests passed. After final pluralization and JSX punctuation fixes, all 87 tests across the seven affected suites passed again.
- TypeScript, ESLint for all 64 changed application TS/TSX files, and whitespace checks passed. Source review found no remaining authored Chinese UI text; retained Chinese parsing/alias patterns are compatibility behavior.
- Production build passed; the sealed candidate verified 161 artifacts and source provenance. All five rendered HTML/client artifact checks passed.
- Local synthetic data checks covered 19 desktop/mobile route views, with no Chinese interface text or horizontal overflow. Actual production SSR/hydration and the Path/Today/Proof showcase tabs also passed browser inspection.
- Production browser checks covered the home page, Method, Showcase, sign-in, Setup, and the Today account boundary. Desktop 1366×900 and mobile 390×844 Showcase views retained the current palette and had no horizontal overflow. No browser errors or warnings appeared during these checks.
- No paid model calls, database migrations, or business-data writes were performed. Authenticated generation was covered by local tests; no live model generation was triggered.

## Deployment

| Item | Result |
| --- | --- |
| Source branch | `codex/english-interface-20261108` |
| Application source | `19a81a500b5f87085f3aaddb27fc0e9b050fc48c` |
| Site version | `f56682e8-ac26-446e-a6dd-c87d38f3684a` |
| Deployment | `19cab0f2-aecc-4019-a140-8bf319758ced`, 100% traffic |
| Previous Site version | `b00536ab-83b0-4b7e-9aaa-db9f11150a2e` |
| Artifact manifest SHA-256 | `776bfbc560a2c78550c2f49c9eb415e8a39e5beeff1b8ea87d65fc48fb2241ff` |
| Runtime configuration | All 44 bindings and runtime settings verified unchanged |
| Research executor | Unchanged at `60b176c2-be13-4df2-8743-c899b596f6d4`, 100% traffic |

Candidate: `D:/CodexTemp/arc-research-candidates/english-interface-20261108-r1`. Release evidence and active configuration: `D:/CodexTemp/arc-english-20261108`, `site.english-interface.active.json`. Deployment succeeded in one attempt after a dry run and fresh remote state verification. No secret values were read. Do not rerun consumed release scripts.

Production screenshots: `D:/CodexTemp/arc-english-20261108/english-desktop.jpg` and `english-mobile.jpg`. Browser viewport overrides were reset and temporary local preview servers stopped after verification.
