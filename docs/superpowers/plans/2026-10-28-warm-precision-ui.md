# Warm Precision UI implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and independent specification / quality review. The user approved the 2026-10-28 UI proposal and asked to implement it. Continue without another design approval.

**Goal:** Make the released Arc learning workspace readable, coherent and useful on desktop/mobile while preserving all research, planning, account and evidence contracts.

**Baseline:** r207 application source plus the clean-checkout fixes at `a0fe017`. Isolated branch `codex/ui-warm-precision-20261028`. Do not modify other worktrees, production state, budgets, migrations, provider settings or issue paid requests.

**Architecture:** Keep the existing routes, hooks and server contracts. Extract a shared workspace header for the four learning destinations plus secondary Coach/History routes. Use the existing companion view to reserve a desktop side region and a separate mobile chat view. Present existing data progressively; preserve source identities, ephemeral step checks and explicit proposal acceptance.

**Tech Stack:** React 19, TypeScript, Vinext/Vite, existing CSS and Motion, Vitest/Testing Library. Reuse installed locked dependencies.

**Visual thesis:** Warm ivory and charcoal, one vermilion signal, compact Chinese working typography, editorial brand pages. No decorative dashboard cards. Each working page leads with its action and context.

**Content plan:** Today is task-first; Research is state-first; Coach is request-first for authenticated users; Stack is a compact skill index; Path is current-phase-first; Proof is evidence-first; History is explicitly read-only; public pages reuse Showcase.

**Interaction thesis:** Reserved-space companion, accessible progressive disclosure, short focus/selection transitions with reduced-motion support.

## 1. Baseline and workspace
- [x] Read release/checkpoint and identify canonical released source.
- [x] Create isolated worktree from the latest source snapshot and preserve source branch.
- [x] Reuse dependencies with matching lockfile; run `node node_modules/vitest/vitest.mjs run tests/components tests/pages --maxWorkers=2` and `npx tsc --noEmit --incremental false` to record the baseline.

## 2. Today, Research and Setup
**Files:** `app/components/today/adaptive-today-session.tsx`, `app/components/workspace/seven-day-timeline.tsx`, `app/components/setup/role-research-panel.tsx`, `app/components/setup/setup-flow.tsx`, `app/components/setup/adaptive-setup-flow.tsx`; their focused component tests. Local presentation CSS can be added in `app/components/today/today-refinement.css` / `app/components/setup/setup-refinement.css` and imported by root.
- [x] Add behavioral regression tests for short template title vs full objective, overdue scheduled-date context, unchanged event planning date and explicit completion, disclosure of adjustment actions.
- [x] Verify new assertions fail, then implement the presentational changes while preserving `record`, `accept`, `discard` and resource URLs.
- [x] Put deliverable and steps before extended rubric; keep checked steps local and require explicit Complete. Clearly label the viewed week and overdue work.
- [x] Localize Research labels, show real discrete stages, preserve `backgroundAccepted` gating and uncertain-request recovery. Existing run recovery never starts a new paid request. Ready summary links to existing result/use flow, no unsupported counters or statuses.
- [x] Improve Setup labels, grouped input density and stable actions using existing controls. Retain scope-choice and research/continue separation.
- [x] Run focused regression tests and report changes/limitations.

## 3. Shared frame, companion, Coach and visual foundation
**Files:** `app/components/workspace/workspace-header.tsx` (new), `workspace-shell.tsx`, `app/history/page.tsx`, `app/coach/page.tsx`, `app/components/agents/{agent-companion,agent-context,learning-coach}.tsx`, `app/components/agents/agents.css`, `app/layout.tsx`, `app/globals.css`, focused tests.
- [x] Add regressions for the same four primary links on all authenticated work routes, read-only History secondary state, disabled assistant without misleading sign-in/configuration controls, and preserved close/focus behavior.
- [x] Implement shared navigation and compact current context. Make signed-in Coach request-first, preserve public introduction and its current foreground-only execution warning.
- [x] Reserve one desktop companion column using a root class driven by authenticated chat visibility; on narrow viewports make chat a separate fixed sheet with close/focus return. Respect stored preference and start new users collapsed. Do not change privacy or billing.
- [x] Use 16px body, 14px regular controls, 12–13px metadata, 32–44px working headings, 32–40px page top space. Make long Chinese objectives ordinary body text. Deepen action/link accent for contrast; retain bright vermilion for markers.
- [x] Remove obsolete global development banner while preserving accurate per-feature restrictions. Maintain skip links, focus visibility, responsive safe areas and reduced motion.
- [x] Run affected tests and type check.

## 4. Stack, Path, History and Proof
**Files:** `app/components/stack/stack-browser.tsx`, `app/components/workspace/{adaptive-path,plan-history,plan-diff-review}.tsx`, `app/components/proof/{proof-profile,proof-workspace}.tsx`, `app/{path,stack,proof}/page.tsx`, focused tests; presentation CSS in `app/components/workspace/workspace-refinement.css`.
- [x] Add interaction regressions for skill selection/filter stability, accessible detail disclosure, current-phase default expansion, history read-only semantics and unchanged evidence/visibility actions.
- [x] Build compact skill summaries with one selected detail view and explicit mobile return. Retain all source facts, criteria and links; use “核验日期” instead of ambiguous learner “Verified”. Missing fields remain unknown.
- [x] Expand current phase by default, summarize other phases, provide expand-all. Retain dependency and deferred-skill explanation. Present proposal effects before detailed diff and never implicitly accept.
- [x] Preserve History pagination/selection and show read-only context. Fold version history; keep historical data and sources unchanged.
- [x] Lead Proof with inspectable work, make profile metrics secondary, retain real verification meaning and privacy controls; fold per-work version history.
- [x] Run focused component/API preservation tests and type check.

## 5. Public pages and language consistency
**Files:** `app/page.tsx`, `app/components/brand/{site-header,precision-path-hero,story-rail}.tsx`, `app/components/account/account-menu.tsx`, `app/components/showcase/*`, `app/components/proof/proof-editor.tsx` where copy needs alignment, existing public-page tests.
- [x] Reuse Showcase and mark sample durations/scope. Provide existing-account continue entry and explicit new-path action. Avoid claiming all roles/assistants are always available.
- [x] Apply shared type, spacing and controls to public/editorial surfaces, forms and account menus. Preserve existing authentication/ownership behavior.
- [x] Check localized accessible names and update assertions only where presentation intentionally changed.

## 6. Verification and delivery
- [x] Independently review specification coverage, then code quality; fix material findings.
- [x] Run all relevant component/page tests, affected planning/research/agent tests, full TypeScript, lint and production build. Run rendered HTML checks against the unchanged build. UI tests: 416/416; full run: 6516/6517, with an unchanged backend smoke file failing intermittently at local nonce-file replacement. Record this limitation in the delivery note; no backend changes or deployment.
- [x] Inspect representative desktop and mobile views in a local-only preview; use synthetic local UI data where authenticated state is needed, without production cookies/secrets or real paid calls. Verify long Chinese titles, companion open/closed, keyboard operation, disclosures, disabled states and 200% layout behavior.
- [x] Save screenshots and record exact checks, baseline issues and any verification limits. Review `git diff --check` and ensure no backend policy/migration/secret changes.
- [x] Commit the reviewed implementation on the isolated branch. Report preview and changed behavior, with production publication status explicitly stated.
