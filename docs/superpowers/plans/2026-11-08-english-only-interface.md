# English-only interface implementation plan

> **For agentic workers:** Use bounded independent-domain implementation and review. Preserve the current production baseline and all user-owned content.

**Goal:** Use English for all Arc-authored website text, remove duplicate bilingual expressions, and preserve readable desktop and mobile layouts.

**Architecture:** Continue from production commit `3ebfd0a` in the ink-teal worktree. Update copy and language defaults in existing components; retain source metadata, multilingual input aliases, existing records, the published palette, and quiet workspace loading. Keep paused materials work out of this release.

**Tech Stack:** React, Vinext, TypeScript, CSS, Vitest, Cloudflare Workers.

- [x] Translate public pages, navigation, account screens, and the product showcase; collapse bilingual headings and tabs.
- [x] Translate Setup, role research states, workspace pages, proof editing, learning companions, default role content, and accessible labels.
- [x] Set root and Open Graph language to English, use English dates and generation defaults, and retain compatibility with historical input.
- [x] Reconcile translations onto the latest production source; preserve all palette color values and the 300 ms quiet loading behavior.
- [x] Adjust English heading wrapping, single-label tab spacing, action wrapping, and font loading.
- [x] Pass 1,357 related component, page, library, and service tests; pass TypeScript and whitespace checks.
- [x] Inspect 19 desktop/mobile route views with synthetic data; verify English interface copy, no horizontal overflow, and current teal colors.
- [ ] Complete source review, production build, rendered HTML checks, and artifact provenance verification.
- [ ] Publish only the website application with unchanged runtime configuration, then verify deployed state and page output.

Source and test snapshots and intermediate evidence are retained under `D:/CodexTemp/arc-english-20261108` and ignored `work/english-only-20261108`. The older materials worktree was consulted because its checkpoint was stale; the final release uses the newer production worktree above.
