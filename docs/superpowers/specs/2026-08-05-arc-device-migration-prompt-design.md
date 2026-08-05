# Arc. Device Migration Prompt v7.2 Design

## Purpose

Stop the signed-in workspace from repeatedly showing the same device-state migration prompt while preserving Arc.'s explicit-consent rule: local learning data is never imported or deleted without a deliberate user action.

## Observed problem

Arc. correctly treats a changed setup—role, level, weekly minutes, or target weeks—as meaningful local work even when it contains zero completed units and zero proofs. The current prompt displays only the role and progress counts, so the reason for the prompt is hidden. Its **Not now** action is stored only in component memory, so route changes and reloads mount a fresh prompt.

## Approaches considered

1. **Hide all zero-progress prompts.** Simple, but loses a learner's customized schedule and violates the existing definition of meaningful local work.
2. **Dismiss for the current component mount.** This is the current behavior and does not survive navigation or reload.
3. **Dismiss the exact local snapshot for the current Arc. account.** Recommended. It suppresses only the already-reviewed snapshot, reappears when local data changes, and keeps different signed-in accounts isolated.

## Approved behavior

- The prompt appears only when a signed-in learner has meaningful device-local state that has not been dismissed for that Arc. account.
- **Not now** stores a browser-local dismissal for the exact combination of signed-in Arc. user and local-state fingerprint.
- The same prompt remains dismissed across Today, Path, Stack, Proof, and page reloads.
- A changed local setup, completion, or proof produces a new fingerprint and may prompt again.
- Signing into a different Arc. account does not inherit another account's dismissal.
- A successful import acknowledges that exact local snapshot and clears the visible migration state, so the already-imported prompt does not return after navigation. No local learning bytes are deleted by this change.
- If browser storage is unavailable, **Not now** still dismisses the current render; failure to persist the preference must not block learning.

## Prompt content

Keep the existing restrained editorial layout. Add a compact plan summary so a zero-progress prompt explains what was found:

`Beginner · 420 min/week · 18 weeks`

The existing completed-unit and proof counts remain. No modal, card, new color, animation, or additional decision is introduced.

## Components and data flow

- `demo-store.ts` exposes a deterministic fingerprint for the validated local state.
- A focused migration-dismissal helper reads and writes the account-scoped fingerprint in browser storage without storing OAuth credentials, tokens, email addresses, or provider data.
- `use-arc-state.ts` determines whether the meaningful local snapshot is still eligible for display and exposes a dismissal action.
- `WorkspaceShell` passes the dismissal action to `MigrationBanner`.
- `MigrationBanner` remains presentational: it renders the plan summary and invokes the supplied action.

The dismissal key uses the stable internal Arc. user ID plus a deterministic local-state fingerprint. It is a device-local UI preference, not authoritative learning state and not synchronized to D1.

## Error and privacy boundaries

- Malformed or unavailable dismissal storage fails open: Arc. may show the prompt again, but never imports or deletes data.
- Dismissal metadata contains no secret, OAuth credential, provider token, or email address.
- Existing import conflict handling, account ownership checks, and cloud-state authority remain unchanged.

## Tests

Add failing tests first for:

1. a changed setup with zero progress showing its plan details;
2. **Not now** surviving component remount and page-style controller remount;
3. changed local data making the prompt eligible again;
4. a different Arc. user not inheriting the dismissal;
5. unavailable storage retaining safe current-render dismissal;
6. existing explicit import and conflict-resolution behavior remaining unchanged.

Run focused tests, the full unit suite, lint, TypeScript, the production build, and rendered-artifact checks before publishing.

## Non-goals

- No change to OAuth linking, account merging, D1 learning data, migration conflict resolution, or offline mutation replay.
- No deletion of device-local state.
- No v8 learning-content or AI-planning features.

## Acceptance criteria

- The reproduced prompt no longer returns during normal cross-route navigation or reload for the same account and unchanged device snapshot after **Not now**.
- The prompt honestly explains meaningful setup-only work even at zero completed units and zero proofs.
- A new snapshot or different account can prompt independently.
- All existing authentication, cloud-state, migration, and release checks remain green.
