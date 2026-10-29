# Learning entry simplification — 2026-10-29

The approved CTA audit reduces repeated creation prompts while keeping a clear route into learning.

## Changes

- Remove the Showcase introduction creation link, Method footer creation link, AccountMenu new-route item, and TimeEdit change-goal disclosure.
- Keep Path → Plan management → New route and confirmed no-plan empty-state exits.
- Keep the homepage hero primary action; make its footer action a lightweight text link. Showcase retains one closing action. Method closes with the full-example link.
- Public body actions share a read-only state check: new learner → create; own draft → resume; saved cloud or guest route → continue. Pending first creation preserves `/setup?mode=create` and its recovery locks. Errors offer retry, never permission to overwrite a plan.
- The signed-in header uses the neutral “学习工作区” navigation label. Every owner/session lifecycle starts a fresh read; late responses and A→B→A transitions cannot reuse prior absence decisions.
- No dependency, schema, budget, model invocation, credential, access policy or backend mutation change. Public-page reads never migrate local data, submit setup or create a plan.

## Verification

- Regression-first entry tests exposed interrupted-creation and account-roundtrip cases before repair. Final entry suite: 17 passing cases, including session-error hydration.
- Related page/navigation/empty-state suites: 124 passing cases in 11 files (before adding the final hydration case).
- Entry + real-client/SQLite setup activation + setup completion: 130 passing cases in 3 files. Integration checks cover locked recovery and guest continuation without local writes. These runs overlap in the entry suite; they are not additive independent totals.
- TypeScript and changed-file ESLint pass. Independent review reports no remaining P1/P2 in this scope.
- Sealed candidate `D:/CodexTemp/arc-research-candidates/entry-simplification-20261029-r1`: 361 artifacts, manifest SHA256 `84249faf6483e1885d29d6e81696f221b26c7c937402919d86f27f0cbe65f1fd`. All five rendered-bundle checks pass against that exact output. The executor artifact hash exactly matches the already deployed October 29 candidate.
- Local browser confirms removed Method/Showcase introduction prompts. Local auth is unavailable, so the public action correctly offers state-read retry; successful account states are verified by the tests and production readback.

## Release boundary

Build a sealed candidate on D: from this branch, retaining the October 29 Research response repair. Publish only the Site bundle; the private executor remains on `60b176c2-be13-4df2-8743-c899b596f6d4`. Verify all 44 Site bindings and runtime settings remain unchanged. Pre-release Site: `149f4e31-d1da-416a-96a1-7a628e141eaf`.

Evidence directory: `D:/CodexTemp/arc-entry-simplification-20261029`. Append actual release/readback evidence after deployment; this section alone is not a claim of publication.
