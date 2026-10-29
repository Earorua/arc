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

## Published and verified

- Published to `https://arcmaps.net` on 2026-10-29. Release source commit: `bf188ab5c5e50761936095d1ea448f935ec3b3b6`.
- Site version `3e804198-b75f-4ecd-806a-8349dd8ef3b5`, deployment `c8ca7a31-62ea-4bc9-854a-243f487d1021`, 100% traffic. Native readback verifies all 44 bindings and runtime settings unchanged.
- Private executor remains `60b176c2-be13-4df2-8743-c899b596f6d4`, deployment `b26dda72-7151-470a-aafd-c693ea259884`, 100% traffic; no executor deployment occurred.
- Authenticated production browser verifies homepage primary + lightweight footer both continue to `/today`; AccountMenu has no new-route item; Method retains its working full-example jump; Showcase has no introductory creation prompt and one closing continue action; TimeEdit has no change-goal disclosure. Its return link reaches Path, whose Plan management still contains “新建路线”. No learning form, Research request or learning-partner message was submitted.
- Desktop 1440×960 and mobile 390×844 layouts inspected locally; production desktop shell/links checked. The captured production console had zero errors. Browser viewport restored after verification.
- Screenshot: `D:/CodexTemp/arc-entry-simplification-20261029/production-home-footer.jpg`. Native deployment evidence and sealed build checks are in the same evidence directory. Deployment scripts are consumed and must not be replayed.
