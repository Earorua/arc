# Arc Experience Redesign Implementation Plan

> **For agentic workers:** Use focused implementation tasks with spec and quality reviews. Independent ownership domains may run in parallel under the dispatching-parallel-agents workflow.

**Goal:** Implement the approved whole-site audit: coherent editorial pages, focused learning surfaces, reliable navigation and resumable user input.
**Architecture:** Preserve the current production data contracts and confirmation boundaries where possible. Introduce explicit page modes, validated URL state and owner-scoped drafts; compose UI from the existing production components. Never substitute public fixtures for account data.
**Tech Stack:** React 19, TypeScript, Vinext/Next routing, Vitest/Testing Library, existing Playwright tooling.

Baseline: 3bd2c4949fe479a7f6e6f1854310b465592887bf, branch codex/experience-redesign-20261028.
Approved design: C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta/outputs/experience-audit-20261028/Arc-全站体验评审与重设计方案-2026-10-28.md.
Existing worktree is reused; no production credentials, records, or paid calls in local verification.

## Ownership and integration

1. Navigation/account domain owns account components, sign-in, workspace/public headers, login-return utility, account-aware route boundary; do not change learning components.
2. Setup domain owns app/setup, setup components/CSS, draft helper, setup tests; do not change shared navigation.
3. Evidence/resources domain owns Stack/Proof components/pages/tests and their local CSS; do not change Today, headers, or shared stylesheet.
4. Root owns Today/Path/Coach/History/public editorial pages, global visual rules, integration, full verification.
5. Shared navigation contracts are communicated before integration. Root reviews any backend/contract changes separately.

## Task 1 — Navigation and identity

Files: app/components/account/*; app/sign-in/page.tsx; app/components/workspace/workspace-header.tsx; app/components/brand/site-header.tsx; new app/lib/navigation-context.ts; relevant component/page tests.
- [x] Add failing tests for safe next URL (valid same-site path/query, external/protocol-relative/backslash/login recursion rejected), callback retention and homepage staying visible.
- [x] Implement safe return routing, Chinese focused sign-in, default post-login destination resolving actual plan presence.
- [x] Update four primary destinations, goal/tools menu, current page markers, mobile bottom navigation. Keep explicit homepage reachable; remove automatic homepage redirect.
- [x] Provide reusable authenticated boundary which preserves login destination and gives public sample/local-progress explanation. Root wires pages after review.
- [x] Run targeted account/header tests and inspect spec compliance then code quality.

Expected contract:
```ts
safeReturnTo(value: string | null | undefined, fallback?: string): string
signInHref(destination: string, reauthenticate?: boolean): string
setupHref(destination: string): string
// Only recognized internal pages and permitted query state; no external navigation.
```

## Task 2 — Setup and editing time

Files: app/setup/page.tsx; app/components/setup/*; app/lib/setup-draft.ts; setup tests.
- [x] Add failing cases for legacy Back, refresh restoration, user/source isolation and current-plan time edit preserving goal.
- [x] Use named steps and expandable skill categories. Keep existing four evaluation levels; uncertainty/short calibration is explicitly a separate data-model feature, not silently invented here.
- [x] Save validated owner/source-bound draft fields, restore after refresh/login intentionally, prevent cross-account recovery, clear on successful completion.
- [x] Implement mode=edit&section=time from current planning workspace using existing availability_changed event and existing PlanDiffReview. Do not regenerate a goal to edit time.
- [x] Clarify mode=create and archive/new-goal consequences; inspect existing new-goal limits. If contract support needs extending, report concrete evidence before touching server files.
- [x] Show creation success/continue-to-task context through Path URL state; preserve retry/idempotency and research recovery.
- [x] Run setup tests including existing research activation/race coverage.

Expected time-edit path:
```ts
await planning.record({kind:"availability_changed",availability:validatedAvailability,planningDate});
// Show candidate review; only planning.accept changes active plan.
// Goal identity and completed events remain unchanged.
```

## Task 3 — Resources and evidence

Files: app/stack/page.tsx; app/proof/page.tsx; app/components/stack/*; app/components/proof/*; tests/components/stack-browser.test.tsx; tests/components/proof-workspace.test.tsx.
- [x] Add failing tests for skill/category URL selection, Back restoration, proof selection, missing proof, composing with valid task context and no invalid prefill.
- [x] Keep master/detail, put recommended material/action ahead of audit metadata; retain all source facts in disclosure.
- [x] Support /stack?skill=&category= and purposeful route/learning actions; do not imply a different skill is today's task.
- [x] Proof defaults to list with Add action; selected proof/detail and compose/revise are distinct views. Consume proof parameter, handle unavailable IDs, focus restoration and return context.
- [x] Preselect unit/skill only from allowed current data; keep private default, ownership enforcement, review distinctions and immutable versions.
- [x] Conditional validation/upload information; maintain current safe upload lifecycle, explain required draft step with direct action rather than navigation puzzle.
- [x] Add owner-scoped draft recovery if forms lose input when browsing; no credential or sensitive content in URLs.
- [x] Run resource/evidence tests, spec review, quality review.

Contract used by Today:
```text
/proof?compose=1&unit=<owned-unit-id>&returnTo=%2Ftoday
/path?skill=<skill-id>
/stack?skill=<skill-id>
```

## Task 4 — Core learning surfaces

Files: app/components/today/{adaptive-today-session,today-session}.tsx; app/today/page.tsx; app/components/workspace/{adaptive-path,seven-day-timeline}.tsx; app/path/page.tsx; related tests.
- [x] Add failing tests for completion-to-proof context, route-to-current-task CTA, read-only unit detail and valid URL selection.
- [x] Make Today task/deliverable/resources/steps/completion readable in order; collapse supporting rationale and weekly plan. Keep completion gating and adjustment review.
- [x] Unify old and adaptive type scale; after completing, explicit in-page completion and optional contextual evidence action.
- [x] Path summary + continue CTA; compact unit rows with URL-restorable details and transparent prerequisite status. History reuse stays read-only.
- [x] Add account boundary without dropping device history or mistaking fixtures for account plans.
- [x] Run Today/Path tests and integration checks.

## Task 5 — Coach and history state

Files: app/components/agents/learning-coach.tsx; agent-companion.tsx; app/components/workspace/plan-history.tsx; app/history/page.tsx; owner-draft helper/tests.
- [x] Add failing tests for owner/goal draft restore, handoff replacement rules, clearing on logout, leave-running warning, history URL pagination/detail.
- [x] Coach empty intentional input; compact current goal, time-edit link; request/results/review distinct states; saved proposal locator and post-accept return to Today.
- [x] Guard leaving active generation and preserve input; do not claim background execution unsupported by service.
- [x] History URL state and compact readonly detail. Back preserves page/list state; valid owner fetch is still mandatory.
- [x] Companion more concise, fixed non-overlapping entry, preserve keyboard/modal behavior.
- [x] Run coach/history/companion tests.

## Task 6 — Editorial pages and complete visual system

Files: app/{method,showcase,admin}/page.tsx; app/components/showcase/*; app/not-found.tsx; app/discovery-theme.css or coherent successor; app/layout.tsx; ui-preview harness.
- [x] Method concrete continuous example + sample/create actions; current navigation state.
- [x] Showcase restrained heading, immediately accessible example, clear read-only identity, URL tab restoration.
- [x] Compact admin state and branded 404; verify built runtime really serves the custom 404.
- [x] Consolidate workspace/intro/form typography, spacing, borders, action priority; preserve homepage art direction.
- [x] Mobile four-tab navigation with safe-area spacing; no assistant/input/action overlap; typography minimums and reduced motion.
- [x] Ensure previews use actual revised components rather than stale demo titles.

## Task 7 — Verification, review and delivery

- [x] Meaningful targeted red/green tests per domain; don't add tests for purely visual CSS.
- [x] Integrated component/page tests, affected lib/server tests, TypeScript, changed-file ESLint.
- [x] Build + rendered HTML tests; source whitespace check.
- [x] Playwright all pages with desktop/mobile, setup Back/refresh, login return utility, Stack/proof deep link, Coach draft, history navigation, keyboard/reduced motion and 200% scale checks.
- [x] Audit 18 acceptance groups; use isolated data for mutation checks. Explicitly disclose any real OAuth/model/production steps not executed.
- [x] Independent spec review, then code quality review; fix findings before closing.
- [x] Update delivery record and current pointer. Save source commit(s) only from this worktree; do not stage unrelated root files.

The accepted report explicitly separates future background generation and uncertain-skill calibration from this implementation. These features must not be advertised unless their underlying contracts are implemented and independently verified.

## Final verification — 2026-10-28

48 files / 605 component, page and navigation tests passed; TypeScript and changed-file ESLint passed without warnings. Production build, 5 HTML checks, 13 SSR routes, 32 desktop/mobile views, 36 responsive views, 8 browser flows and 8 accessibility/content checks passed. Independent review findings are resolved.

Browser zoom was checked through equivalent 720px reflow rather than a physical 200% zoom action. OAuth, paid model calls, production writes and deployment were not executed. Older browsers without a cancellable Navigation API cannot guarantee interception of same-document Back; input remains saved. Existing backend limits on new goals and time editing remain explicit. See ../2026-10-28-experience-redesign-delivery.md for all 18 acceptance groups and boundaries.
