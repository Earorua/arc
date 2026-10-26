# Account-owned role intelligence

Decision confirmed by the site owner on 2026-10-15.

## Product boundary

- The public header does not expose an Intelligence destination. The retired
  `/intelligence` sample redirects to `/stack`, which requires a confirmed Arc
  account. Public examples belong in `/showcase` and must be identified as examples.
- Skill importance, recommended resources, clickable source links and verification
  dates belong next to the corresponding skill in the account's Stack workspace.
- Stack loads the signed-in account's saved planning context. It must never fill an
  empty account with unclaimed device history, another account's data or the public
  flagship sample. Missing plans have an explicit empty state; unavailable plans
  keep their recovery state.

## Requirements for future role research presentation

Real job requirements, skill priorities and evidence sources must remain within a
confirmed account session. Any future Intelligence page is an account feature, not
a public landing-page destination.

- Resolve ownership from the verified Arc server session. Do not trust a browser
  supplied user id. Apply the same ownership rule to reads, writes, retries,
  downloadable results and linked evidence. Shared catalogue content may be reused
  internally, but access to a user's research run and selected plan remains owner-scoped.
- Show only the active account's selected research/plan context. Key client state by
  account identity, reject responses from an earlier identity, and clear visible
  personal content on sign-out, expiration or account switching.
- Keep anonymous requests unauthorized and foreign-account resources undisclosed.
  Existing research routes use `requireArcUser`; research/planning repositories
  enforce owner ids. New presentation features must preserve those boundaries.
- Retain clickable, validated public source URLs and their recorded dates. Explain
  the recommendation and its priority without presenting an unverified sample as
  current research. Missing evidence must remain visibly unavailable.
- Before release, check anonymous access, account A versus B, delayed responses after
  account switches, empty accounts, session expiration and logout. Public Showcase
  must never load personal research or account evidence.

This change does not enable a new research provider or change research eligibility.
