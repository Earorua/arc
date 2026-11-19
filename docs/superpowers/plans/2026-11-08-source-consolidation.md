# Arc source consolidation plan

> **For agentic workers:** Use superpowers:executing-plans for the sequential integration and superpowers:dispatching-parallel-agents for independent, read-only source audits. Track the steps below without changing paused feature scope.

**Goal:** Preserve every current Arc source line on GitHub and establish an unambiguous starting point for future work.

**Architecture:** Reconcile the latest released application with the default branch and the completed local brand assets. Preserve the unfinished materials implementation on its own named branch, with its exact checkpoint and outstanding verification recorded. Keep historical working copies intact and route future work through one source index.

**Tech Stack:** Git, GitHub, Node.js, TypeScript, React, Vitest, Vinext, Cloudflare Workers.

## 1. Inventory and classify sources

- [x] Fetch `origin` and read current GitHub PR/default-branch state.
- [x] Enumerate registered worktrees and repository copies; record branch, HEAD, tracked-file count, and uncommitted paths in the local audit report.
- [x] Read the latest English-interface, palette/loading, materials-pause, and brand-delivery records.
- [x] Compare the dirty legacy copies by content against the latest release, materials checkpoint, and retained source history; identify every unique source file requiring preservation.
- [x] Classify each location as current application, paused development, completed brand source, or historical material.

## 2. Reconcile the current application

**Workspace:** `D:/CodexScratch/arc-source-readme-20261029`, branch `codex/source-consolidation-20261108`, initially based on `origin/master`.

- [x] Merge `codex/english-interface-20261108`, preserving both histories and the default branch's concise bilingual READMEs, ignored local environment files, and smoke-provider fix.
- [x] Port the completed brand component, editable assets, export source, and relevant integration edits from the legacy worktree. Retain current layout, authentication, English text, loading behavior, and palette.
- [x] Verify the active source contains the latest released UI changes and all required brand source assets without importing stale application files.

## 3. Make source ownership explicit

**Files:** `SOURCE_INDEX.md`, `AGENTS.md`, `docs/source/2026-11-08-inventory.json`, the current operations checkpoint/index, and concise source links in both READMEs.

- [x] Record the authoritative source role, GitHub ref, evidence, status, and file statistics for the application and materials checkpoint.
- [x] Explain that materials development remains paused and does not become a released feature through source backup.
- [x] Add checkout guidance that starts from the source index and current remote state, and prohibits replacing newer code from historical checkpoints.
- [x] Add local routing notices to stale working directories while preserving their original changes.
- [x] Keep release bookkeeping in the source index and audit record, outside the product README overview.

## 4. Verify and publish

- [x] Inspect the complete integration diff and exact staged paths; check for credentials, private data, generated dependencies, and accidental historical-source replacement.
- [x] Run `node node_modules/vitest/vitest.mjs run --maxWorkers=4`, `npm run lint`, `npx tsc --noEmit`, and `npm test`; record actual results and investigate failures without weakening checks.
- [x] Obtain an independent source-completeness and integration review; resolve actionable findings.
- Publication: the English release and exact materials checkpoint refs are already pushed and read back. Publish the verified consolidation branch as a PR, then merge after its checks pass; the PR records completion of this remote step.
- Publication verification: compare remote HEADs and inventory, read GitHub checks, and report the merged source entry point. This final remote result is recorded on the PR rather than recursively changing the audited payload.

No application deployment, live model request, or remote database migration is part of this task.
