# Arc v8 Research Closed Release Preparation Plan

> **For agentic workers:** Use the approved superpowers:subagent-driven-development workflow with TDD, independent specification review, then quality/security review. Root owns documentation and all Git/Sites operations; no production action in this preparation.

**Goal:** Prepare a small-scope v8 release with new Research admission closed and the user's exact development notice at the top of every root-layout page.

**Architecture:** One static note in the existing server root layout and a small global style. Reuse existing Research configuration, eligibility, route gates and offline tests. Produce an operational worksheet; do not add a new flag system or deployment automation.

**Tech Stack:** Existing React 19/Vinext, TypeScript, CSS, Vitest, React static rendering and existing node:test built-HTML tests. Preserve dependencies, migrations and hosting configuration.

Start: clean `e2871a667dd2ded23f429f362024a00125c316a6`. Design: `docs/superpowers/specs/2026-09-07-arc-v8-research-closed-release-design.md`. User has already approved proceeding and the exact notice copy; routine placement/style choices stay within that instruction. Existing authoritative worktree and approved public development-branch backup are retained.

## Task 1: Global development notice

**Files:**
- Modify `app/layout.tsx` and `app/globals.css`.
- Create `tests/components/root-layout.test.tsx`.
- Modify `tests/rendered-html.test.mjs` only to assert the note in the actual built root response.

- [ ] Add one focused test before product edits. Use actual `RootLayout`, `renderToStaticMarkup` and the jsdom DOMParser. Check the rendered note's exact text, `lang=en`, single occurrence, placement before supplied main content, and unchanged skip-link. Example core:

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

- [ ] Run `node node_modules/vitest/vitest.mjs run tests/components/root-layout.test.tsx` and record real missing-notice RED. Do not treat import/font/tool startup failure as RED; resolve test loading without changing product semantics.
- [ ] Add the minimal static element after skip-link, before children:

```tsx
<p className="development-notice" role="note" lang="en">The website is currently under development.</p>
```

- [ ] Add the global style beside base/skip-link rules:

```css
.development-notice {
  margin: 0; padding: 0.625rem 1rem;
  background: var(--charcoal); color: var(--chalk);
  font-size: 0.875rem; line-height: 1.5; text-align: center;
  overflow-wrap: anywhere;
}
```

Keep normal flow, no sticky/fixed offsets, dismissal or state. Do not change fonts, metadata, branding or existing page navigation.
- [ ] Add assertions to existing built landing-page test: exact note text once and its markup before the main element. Root performs final build/render; implementer may validate against an existing pre-change build to observe an additional RED, but must label that artifact identity accurately and not claim a stale build is final.
- [ ] Re-run focused test to GREEN plus targeted lint, self-review exact four-file scope, report evidence and freeze. Do not stage/commit or alter docs/product outside scope; root owns Git and release prep.

## Task 2: Research-closed release worksheet and final verification

**Files:**
- Create `docs/operations/v8-research-closed-release.md`.
- Update current top of `docs/operations/v8-resume-checkpoint.md`.
- Update `docs/operations/v8-release-gates.md` with a dated closed-Research route; keep Research-enabled release gates distinct.
- Update this plan's progress/evidence.

- [ ] Finish independent read-only audit of configuration/eligibility/UI/server gates. Record exact false/missing semantics, hidden vs disabled actions, recovery side effects and existing meaningful test coverage. If a real implementation gap is found, evaluate it before expanding this bounded plan.
- [ ] Write a reviewable worksheet with source/runtime identity, intended audience (user answer or explicitly provisional owner-only), future `ARC_AI_RESEARCH_ENABLED=false`, unaffected capability expectations, no new provider execution, required production origin/auth/ledger/storage/restore checks, compatible recovery selection, success/stop criteria and final execution order. Do not read production secrets or values to fill blanks; distinguish missing evidence from passed checks.
- [ ] Root runs full `npm run test:unit`, `node node_modules/typescript/bin/tsc --noEmit --incremental false`, `npm run lint`, `npm run build`, then `node --test tests/rendered-html.test.mjs`. Build inputs changed, so build/render must be fresh. Test suite includes relevant Research configuration, eligibility, setup/controller and route regressions. Do not rerun unrelated legacy recovery/retained suites unless shared inputs changed or audit finds a new reason.
- [ ] Independently review final code and all current documents for spec compliance, then quality/security. Resolve findings and re-review before commit.
- [ ] Root checks exact added/changed content and confidentiality, commits reviewed source/docs, ordinarily backs up only `codex/v8-openrouter-research-beta` to `https://github.com/Earorua/arc.git`, then verifies exact remote SHA, clean worktrees and unchanged master. Save actual completion evidence in checkpoint. No Sites version/candidate, deploy, master merge, PR or new provider requests.

## Evidence

- Initial worktree/branch/HEAD verified, clean. Only `.env.example` is present at the project root; no real environment file read. The existing root layout contains only skip-link and children; current Research factory requires both enabled flags to equal the literal string `true` before creating a new-call service.
- Independent read-only closure audit running. Implementation and new verification results are not yet available. Audience question pending; draft defaults to owner-only without any external mutation.
