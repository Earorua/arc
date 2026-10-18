# Arc v8 Research Closed Release Preparation Plan

> **For agentic workers:** Use the approved superpowers:subagent-driven-development workflow with TDD, independent specification review, then quality/security review. Root owns documentation and all Git/Sites operations; no production action in this preparation.

**Goal:** Prepare a v8 release limited in feature scope, keeping public access while closing new Research admission, with the user's exact development notice at the top of every root-layout page.

**Architecture:** One static note in the existing server root layout and a small global style. Reuse existing Research configuration, eligibility, route gates and offline tests. Produce an operational worksheet; do not add a new flag system or deployment automation.

**Tech Stack:** Existing React 19/Vinext, TypeScript, CSS, Vitest, React static rendering and existing node:test built-HTML tests. Preserve dependencies, migrations and hosting configuration.

Start: clean `e2871a667dd2ded23f429f362024a00125c316a6`. Design: `docs/superpowers/specs/2026-09-07-arc-v8-research-closed-release-design.md`. User has already approved proceeding and the exact notice copy; routine placement/style choices stay within that instruction. Existing authoritative worktree and approved public development-branch backup are retained.

## Task 1: Global development notice and truthful closed-Research copy

**Files:**
- Modify `app/layout.tsx` and `app/globals.css`.
- Create `tests/components/root-layout.test.tsx`.
- Modify `tests/rendered-html.test.mjs` only to assert the note in the actual built root response.
- Modify `app/components/setup/setup-flow.tsx` and `tests/components/setup-flow.test.tsx` only for the audited ineligible+recovery disclosure.

- [x] Add one focused test before product edits. Use actual `RootLayout`, `renderToStaticMarkup` and the jsdom DOMParser. Check the rendered note's exact text, `lang=en`, single occurrence, placement before supplied main content, and unchanged skip-link. Example core:

```tsx
const html = renderToStaticMarkup(<RootLayout><main id="main-content">Page content</main></RootLayout>);
const document = new DOMParser().parseFromString(html, "text/html");
const note = document.querySelector('[role="note"]');
expect(note?.textContent).toBe("The website is currently under development.");
expect(note?.getAttribute("lang")).toBe("en");
expect(document.querySelectorAll('[role="note"]')).toHaveLength(1);
expect(note?.compareDocumentPosition(document.querySelector("main")!)! & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(document.querySelector('.skip-link')?.getAttribute("href")).toBe("#main-content");
```

- [x] Run `node node_modules/vitest/vitest.mjs run tests/components/root-layout.test.tsx` and record real missing-notice RED. Do not treat import/font/tool startup failure as RED; resolve test loading without changing product semantics.
- [x] Add the minimal static element after skip-link, before children:

```tsx
<p className="development-notice" role="note" lang="en">The website is currently under development.</p>
```

- [x] Add the global style beside base/skip-link rules:

```css
.development-notice {
  margin: 0; padding: 0.625rem 1rem;
  background: var(--charcoal); color: var(--chalk);
  font-size: 0.875rem; line-height: 1.5; text-align: center;
  overflow-wrap: anywhere;
}
```

Keep normal flow, no sticky/fixed offsets, dismissal or state. Do not change fonts, metadata, branding or existing page navigation.
- [x] Add assertions to existing built landing-page test: exactly one rendered note, with the correct text/role/language, before main. Count actual DOM elements rather than raw response text, which can also occur in React's script payload. Root performs final build/render; no product rebuild is required for test-only assertion corrections.
- [x] Re-run focused test to GREEN plus targeted lint, self-review the four notice files, report evidence, then complete the following audited copy correction before freezing. Do not stage/commit or alter docs/product outside scope; root owns Git and release prep.

- [x] Before changing setup disclosure, add a non-Flagship custom-role ineligible+recovery test in the existing test file: the recovery slot stays visible, the invitation `Research this role to use` is absent, and exact text `New research is currently unavailable. Continue keeps the proportional v7 path.` is present. Run `node node_modules/vitest/vitest.mjs run tests/components/setup-flow.test.tsx` for meaningful RED.
- [x] Keep original eligible invitation and ordinary no-recovery fallback; when signedIn/renderResearch/canResearchRole are true but researchEligible is false and researchRecoveryAvailable true, show the new exact sentence. The conditional can use this branch structure within the existing disclosure:

```tsx
signedIn && renderResearch && canResearchRole && researchEligible
  ? "Research this role to use a source-backed skill audit and adaptive schedule. Continue keeps the proportional v7 path."
  : signedIn && renderResearch && canResearchRole && researchRecoveryAvailable
    ? "New research is currently unavailable. Continue keeps the proportional v7 path."
    : <>Full skill audit and adaptive scheduling currently require Arc&apos;s reviewed AI-Native Full-Stack Engineer blueprint. This custom role will keep the proportional v7 path.</>
```

- [x] Re-run root-layout/setup-flow tests and targeted lint to GREEN; self-review final six-file product/test scope and freeze. Do not change Research controls, saved-run restoration, other error copy or flags.

## Task 2: Research-closed release worksheet and final verification

**Files:**
- Create `docs/operations/v8-research-closed-release.md`.
- Update current top of `docs/operations/v8-resume-checkpoint.md`.
- Update `docs/operations/v8-release-gates.md` with a dated closed-Research route; keep Research-enabled release gates distinct.
- Update this plan's progress/evidence.

- [x] Finish independent read-only audit of configuration/eligibility/UI/server gates. Record exact false/missing semantics, hidden vs disabled actions, recovery side effects and existing meaningful test coverage. If a real implementation gap is found, evaluate it before expanding this bounded plan.
- [x] Write a reviewable worksheet with source/runtime identity, user-selected public access, future `ARC_AI_RESEARCH_ENABLED=false`, unaffected capability expectations, no new provider execution, required production origin/auth/ledger/storage/restore checks, compatible recovery selection, success/stop criteria and final execution order. Do not read production secrets or values to fill blanks; distinguish missing evidence from passed checks.
- [x] Root runs full `npm run test:unit`, `node node_modules/typescript/bin/tsc --noEmit --incremental false`, `npm run lint`, `npm run build`, then `node --test tests/rendered-html.test.mjs`. Build inputs changed, so build/render must be fresh. Test suite includes relevant Research configuration, eligibility, setup/controller and route regressions. Do not rerun unrelated legacy recovery/retained suites unless shared inputs changed or audit finds a new reason.
- [x] Independently review final code and all current documents for spec compliance, then quality/security. Resolve findings and re-review before commit.
- [x] Root checks exact added/changed content and confidentiality, commits reviewed source/docs, ordinarily backs up only `codex/v8-openrouter-research-beta` to `https://github.com/Earorua/arc.git`, then verifies exact remote SHA, clean worktrees and unchanged master. Save actual completion evidence in checkpoint. No Sites version/candidate, deploy, master merge, PR or new provider requests.

## Evidence

- Initial worktree/branch/HEAD verified, clean. Only `.env.example` is present at the project root; no real environment file read. The existing root layout contains only skip-link and children; current Research factory requires both enabled flags to equal the literal string `true` before creating a new-call service.
- Independent read-only closure audit completed: existing backend closure is sufficient, with in-flight/recovery/cohort limits recorded in the worksheet. User selected public access, closing only Research; the provisional owner-only draft is superseded. No external mutation occurred.
- Implementer TDD: missing root notice RED 1 failure (2.07 s); non-Flagship ineligible recovery disclosure RED 1 failed/18 passed (7.77 s); GREEN 2 files/20 tests (7.80 s). Root requested exact markup presence and role checks, then focused GREEN 20/20 (7.90 s). Root's initial TypeScript check found optional DOM position arithmetic; explicit node narrowing fixed it, implementer root-layout 1/1 (1.47 s), types and targeted lint passed, and root's fresh nonincremental type check then exited 0.
- Root full unit run passed 138 files/2,643 tests (72.11 s); full lint exited 0; fresh build completed all five stages. Initial sandbox spawn EPERM failures occurred before tests/build began and are not valid RED. Built HTML run initially passed 3/4: raw text counting also included script data. Systematic diagnosis of the same build confirmed two raw text occurrences but one actual notice node. Inert jsdom assertions now check that node's exact text/role/language/order. Root final rendered check passed 4/4 (2,027.1421 ms), targeted lint for the corrected test files exited 0, and final root-layout/setup-flow tests passed 20/20 (7.82 s); product inputs have not changed after the successful full unit run/build.
- Independent specification review: P0/P1/P2 0/0/0 READY. Subsequent independent final quality/security review: P0/P1/P2 0/0/0 READY. Both reviewed the actual 11-file scope, including untracked files, and accurately relied on root's supplied runtime evidence instead of claiming repeated execution. Root scope/credential-marker review found no new issue. No merge/deployment readiness is asserted.
- Reviewed implementation/docs saved as `c2104b7e723b82f574bc2a46405693e88eecf8af`, ordinarily pushed to the approved public development branch; independent ls-remote matched that exact SHA. Remote master remained `f6c3cddbe6d3f177f3681b355142daad84f2330e`; main worktree remained clean at `f0f88b2ebdb61e2951c9d1d6c0004319c131eafa`; development worktree was clean after commit. The matching branch/commit Actions query returned zero runs, consistent with master-push/PR-only triggers; no new CI success claimed. This completion record is a subsequent docs-only save, whose final local/remote SHA is verified at handoff.
