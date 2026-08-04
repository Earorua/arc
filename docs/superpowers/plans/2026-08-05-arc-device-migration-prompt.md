# Arc. Device Migration Prompt v7.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make **Not now** dismiss the exact device-state migration prompt across workspace navigation and reloads for the current Arc. account, while explaining setup-only local work and preserving explicit import consent.

**Architecture:** Keep D1 and OAuth behavior unchanged. Add a deterministic device-state fingerprint plus a browser-local, account-scoped acknowledgement helper; make `useArcState` own the migration eligibility decision and expose a dismissal action, while `MigrationBanner` remains a presentational surface with more honest plan details.

**Tech Stack:** TypeScript 5.9, React 19.2, Vinext/Next compatibility routes, browser `localStorage`, Vitest 4, Testing Library, ESLint, Cloudflare Workers, OpenAI Sites.

---

## Locked file structure

| Path | Responsibility |
| --- | --- |
| `app/lib/demo-store.ts` | Validate device state and produce its deterministic, non-security fingerprint. |
| `app/lib/migration-dismissal.ts` | Read/write account-scoped acknowledgement metadata with safe storage failure behavior. |
| `app/lib/use-arc-state.ts` | Decide whether the current meaningful local snapshot is eligible to prompt and expose dismissal. |
| `app/components/sync/migration-banner.tsx` | Render plan/progress context and forward explicit import/dismiss actions. |
| `app/components/workspace/workspace-shell.tsx` | Connect the state controller's dismissal action to the banner. |
| `app/{today,path,stack,proof}/page.tsx` | Pass the controller dismissal action into the shared shell. |
| `app/globals.css` | Preserve the editorial hierarchy for the additional plan/progress line. |
| `tests/lib/demo-store.test.ts` | Prove fingerprint stability and change detection. |
| `tests/lib/migration-dismissal.test.ts` | Prove account isolation and safe storage failures. |
| `tests/lib/use-arc-state.test.tsx` | Prove remount/reload-style persistence, changed-snapshot eligibility, and import acknowledgement. |
| `tests/components/migration-banner.test.tsx` | Prove honest setup-only copy and explicit dismissal delegation. |
| `docs/operations/sites-oauth-feasibility.md` | Record the passed ownership-conflict test and v7.2 release evidence. |
| `docs/superpowers/plans/2026-08-01-arc-secure-cross-email-account-linking.md` | Close checklist item 7 without overstating deferred linking/log checks. |

### Task 1: Fingerprint validated device state

**Files:**
- Modify: `tests/lib/demo-store.test.ts`
- Modify: `app/lib/demo-store.ts`

- [ ] **Step 1: Write the failing fingerprint test**

Add `fingerprintDemoState` to the existing import and append:

```ts
it("fingerprints the validated snapshot deterministically and detects every migration-relevant change", () => {
  const initial = createDemoState();
  const same = createDemoState();
  const setupChanged = mergeSetup(initial, { ...initial.setup, weeklyMinutes: 300 });
  const progressChanged = completeDemoUnit(initial, flagshipRole.today);

  expect(fingerprintDemoState(initial)).toBe(fingerprintDemoState(same));
  expect(fingerprintDemoState(setupChanged)).not.toBe(fingerprintDemoState(initial));
  expect(fingerprintDemoState(progressChanged)).not.toBe(fingerprintDemoState(initial));
  expect(fingerprintDemoState(initial)).toMatch(/^v1-[0-9a-f]{16}$/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test:unit -- tests/lib/demo-store.test.ts
```

Expected: FAIL because `fingerprintDemoState` is not exported.

- [ ] **Step 3: Implement the deterministic fingerprint**

Append to `app/lib/demo-store.ts`:

```ts
export function fingerprintDemoState(state: DemoState): string {
  const serialized = JSON.stringify({
    setup: state.setup,
    completedUnitIds: state.completedUnitIds,
    proofs: state.proofs,
  });
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return `v1-${hash.toString(16).padStart(16, "0")}`;
}
```

The fingerprint is a deterministic UI snapshot identifier, not a credential, integrity proof, or security boundary.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: all `demo store` tests pass.

### Task 2: Persist account-scoped acknowledgement safely

**Files:**
- Create: `tests/lib/migration-dismissal.test.ts`
- Create: `app/lib/migration-dismissal.ts`

- [ ] **Step 1: Write the failing acknowledgement tests**

Create `tests/lib/migration-dismissal.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  acknowledgeMigrationSnapshot,
  isMigrationSnapshotAcknowledged,
} from "../../app/lib/migration-dismissal";

beforeEach(() => window.localStorage.clear());

describe("migration dismissal", () => {
  it("acknowledges one snapshot for one Arc user only", () => {
    expect(isMigrationSnapshotAcknowledged("user-a", "v1-state-a")).toBe(false);
    expect(acknowledgeMigrationSnapshot("user-a", "v1-state-a")).toBe(true);
    expect(isMigrationSnapshotAcknowledged("user-a", "v1-state-a")).toBe(true);
    expect(isMigrationSnapshotAcknowledged("user-a", "v1-state-b")).toBe(false);
    expect(isMigrationSnapshotAcknowledged("user-b", "v1-state-a")).toBe(false);
  });

  it("fails open when browser storage is unavailable", () => {
    const unavailable = {
      getItem(): string | null { throw new Error("unavailable"); },
      setItem(): void { throw new Error("unavailable"); },
    };
    expect(isMigrationSnapshotAcknowledged("user-a", "v1-state-a", unavailable)).toBe(false);
    expect(acknowledgeMigrationSnapshot("user-a", "v1-state-a", unavailable)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
npm run test:unit -- tests/lib/migration-dismissal.test.ts
```

Expected: FAIL because `app/lib/migration-dismissal.ts` does not exist.

- [ ] **Step 3: Implement the focused storage helper**

Create `app/lib/migration-dismissal.ts`:

```ts
type MigrationDismissalStorage = Pick<Storage, "getItem" | "setItem">;

const keyPrefix = "arc-migration-dismissal-v1:";

function resolveStorage(storage?: MigrationDismissalStorage): MigrationDismissalStorage | undefined {
  return storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
}

function keyForUser(userId: string): string {
  return `${keyPrefix}${encodeURIComponent(userId)}`;
}

export function isMigrationSnapshotAcknowledged(
  userId: string,
  fingerprint: string,
  storage?: MigrationDismissalStorage,
): boolean {
  try {
    return resolveStorage(storage)?.getItem(keyForUser(userId)) === fingerprint;
  } catch {
    return false;
  }
}

export function acknowledgeMigrationSnapshot(
  userId: string,
  fingerprint: string,
  storage?: MigrationDismissalStorage,
): boolean {
  try {
    const resolved = resolveStorage(storage);
    if (!resolved) return false;
    resolved.setItem(keyForUser(userId), fingerprint);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the new test and verify GREEN**

Run the Step 2 command. Expected: 2/2 new tests pass.

- [ ] **Step 5: Commit the foundational behavior**

```powershell
git add app/lib/demo-store.ts app/lib/migration-dismissal.ts tests/lib/demo-store.test.ts tests/lib/migration-dismissal.test.ts
git commit -m "fix: persist migration snapshot acknowledgement"
```

### Task 3: Make the controller own prompt eligibility

**Files:**
- Modify: `tests/lib/use-arc-state.test.tsx`
- Modify: `app/lib/use-arc-state.ts`

- [ ] **Step 1: Write failing controller tests**

Use this session helper so account identity is explicit:

```ts
const signedInSessionFor = (id: string) => () => ({
  data: { user: { id, name: "Arc Learner", email: "learner@example.com" } },
  isPending: false,
});
```

Add this test:

```ts
it("keeps one snapshot dismissed for the same user until device work changes", async () => {
  const local = mergeSetup(createDemoState(), {
    ...createDemoState().setup,
    weeklyMinutes: 300,
  });
  saveDemoState(local);
  const client = fakeClient();

  const first = renderHook(() => useArcState({
    client,
    useSession: signedInSessionFor("user-owner"),
  }));
  await waitFor(() => expect(first.result.current.migration).toBe("available"));
  act(() => first.result.current.dismissMigration());
  expect(first.result.current.migration).toBe("none");
  first.unmount();

  const sameUser = renderHook(() => useArcState({
    client,
    useSession: signedInSessionFor("user-owner"),
  }));
  await waitFor(() => expect(sameUser.result.current.source).not.toBe("restoring"));
  expect(sameUser.result.current.migration).toBe("none");
  sameUser.unmount();

  saveDemoState(mergeSetup(local, { ...local.setup, weeklyMinutes: 360 }));
  const changedSnapshot = renderHook(() => useArcState({
    client,
    useSession: signedInSessionFor("user-owner"),
  }));
  await waitFor(() => expect(changedSnapshot.result.current.migration).toBe("available"));
  changedSnapshot.unmount();

  saveDemoState(local);
  const otherUser = renderHook(() => useArcState({
    client,
    useSession: signedInSessionFor("user-other"),
  }));
  await waitFor(() => expect(otherUser.result.current.migration).toBe("available"));
});
```

In the successful import test, change the workspace mock to remain available after the two existing calls:

```ts
loadWorkspace: vi.fn()
  .mockResolvedValueOnce(null)
  .mockResolvedValue(cloudSnapshot),
```

Then append:

```ts
unmount();
const remounted = renderHook(() => useArcState({
  client,
  useSession: signedInSessionFor("user-owner"),
}));
await waitFor(() => expect(remounted.result.current.source).toBe("cloud"));
expect(remounted.result.current.migration).toBe("none");
```

- [ ] **Step 2: Run the controller test and verify RED**

Run:

```powershell
npm run test:unit -- tests/lib/use-arc-state.test.tsx
```

Expected: FAIL because the controller does not expose `dismissMigration` and does not consult acknowledgement storage.

- [ ] **Step 3: Implement eligibility and dismissal**

In `app/lib/use-arc-state.ts`:

1. import `fingerprintDemoState`;
2. import `acknowledgeMigrationSnapshot` and `isMigrationSnapshotAcknowledged`;
3. add `dismissMigration(): void` to `ArcStateController`;
4. when a signed-in workspace loads, expose a meaningful local snapshot only when its account-scoped fingerprint is not acknowledged;
5. after a successful import, acknowledge the imported local fingerprint before setting `migration` to `"imported"`;
6. implement `dismissMigration` so it acknowledges the current meaningful local snapshot, sets `migration` to `"none"`, and clears `localMigrationState` even if storage rejects the write;
7. return `dismissMigration` from the controller.

Use this single eligibility calculation in both the successful and failed cloud-load branches:

```ts
const meaningful = hasMeaningfulDemoState(local);
const acknowledged = meaningful && isMigrationSnapshotAcknowledged(
  userId,
  fingerprintDemoState(local),
  storageRef.current,
);
const available = meaningful && !acknowledged;
setMigration(available ? "available" : "none");
setLocalMigrationState(available ? local : null);
```

Use this callback for explicit dismissal:

```ts
const dismissMigration = useCallback(() => {
  const local = loadDemoState(storageRef.current);
  const currentUserId = userIdRef.current;
  if (currentUserId && hasMeaningfulDemoState(local)) {
    acknowledgeMigrationSnapshot(
      currentUserId,
      fingerprintDemoState(local),
      storageRef.current,
    );
  }
  setMigration("none");
  setLocalMigrationState(null);
}, []);
```

- [ ] **Step 4: Run the controller test and verify GREEN**

Run the Step 2 command. Expected: all controller tests pass, including remount, changed snapshot, different user, and successful import acknowledgement.

### Task 4: Explain setup-only work and connect Not now

**Files:**
- Modify: `tests/components/migration-banner.test.tsx`
- Modify: `app/components/sync/migration-banner.tsx`
- Modify: `app/components/workspace/workspace-shell.tsx`
- Modify: `app/today/page.tsx`
- Modify: `app/path/page.tsx`
- Modify: `app/stack/page.tsx`
- Modify: `app/proof/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing banner tests**

Add `onDismiss={vi.fn()}` to existing renders, then add:

```ts
it("explains setup-only device work and delegates Not now", async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  const state = mergeSetup(createDemoState(), {
    ...createDemoState().setup,
    weeklyMinutes: 300,
    targetWeeks: 12,
  });

  render(
    <MigrationBanner
      onDismiss={onDismiss}
      onImport={vi.fn()}
      state={state}
      status="available"
    />,
  );

  expect(screen.getByText(/Beginner · 300 min\/week · 12 weeks/)).toBeInTheDocument();
  expect(screen.getByText(/0 completed units · 0 proofs/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Not now" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the banner test and verify RED**

Run:

```powershell
npm run test:unit -- tests/components/migration-banner.test.tsx
```

Expected: FAIL because `onDismiss` and plan-detail copy do not exist.

- [ ] **Step 3: Implement the presentational change**

In `migration-banner.tsx`, add required `onDismiss: () => void`, preserve current-render dismissal state, and call the controller action before hiding:

```tsx
const levelLabels: Record<DemoState["setup"]["level"], string> = {
  new: "New",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

<p>
  {getRoleDisplayName(state.setup.roleId)} · {levelLabels[state.setup.level]} · {state.setup.weeklyMinutes} min/week · {state.setup.targetWeeks} weeks
</p>
<p className="migration-progress">
  {completed} completed {completed === 1 ? "unit" : "units"} · {proofs} {proofs === 1 ? "proof" : "proofs"}
</p>

<button
  disabled={busy}
  onClick={() => {
    onDismiss();
    setDismissed(true);
  }}
  type="button"
>
  Not now
</button>
```

The role name remains at the start of the same line. Do not add a card, modal, icon, or new accent.

Add one spacing rule:

```css
.migration-copy .migration-progress { margin-top: 5px; color: var(--stone); }
```

Add `onDismissMigration?: () => void` to `WorkspaceShell`, pass it to `MigrationBanner`, and have Today, Path, Stack, and Proof pass `arc.dismissMigration`.

- [ ] **Step 4: Run focused UI and controller tests**

```powershell
npm run test:unit -- tests/components/migration-banner.test.tsx tests/lib/use-arc-state.test.tsx tests/lib/demo-store.test.ts tests/lib/migration-dismissal.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the integrated fix**

```powershell
git add app/components/sync/migration-banner.tsx app/components/workspace/workspace-shell.tsx app/globals.css app/today/page.tsx app/path/page.tsx app/stack/page.tsx app/proof/page.tsx app/lib/use-arc-state.ts tests/components/migration-banner.test.tsx tests/lib/use-arc-state.test.tsx
git commit -m "fix: stop repeated device migration prompts"
```

### Task 5: Verify, document, publish, and close v7

**Files:**
- Modify: `docs/operations/sites-oauth-feasibility.md`
- Modify: `docs/superpowers/plans/2026-08-01-arc-secure-cross-email-account-linking.md`
- Modify: `docs/superpowers/plans/2026-08-05-arc-device-migration-prompt.md`

- [ ] **Step 1: Run the complete release gate**

```powershell
npm run test:unit
npm run lint
npx tsc --noEmit
npm run build
node --test tests/rendered-html.test.mjs
git diff --check
```

Expected: every command exits 0; record fresh test counts and build result rather than reusing v7.1 evidence.

- [ ] **Step 2: Record precise production-test evidence**

Mark account-link checklist item 7 complete and append that the owned Google target was rejected with the generic no-merge result; the source GitHub account, source learning state, target Google account, and target learning state all remained independent and unchanged.

Keep checklist items 5–6 explicitly deferred because no safe unused Google identity exists. Keep checklist item 8 open for replay and direct application-bypass evidence. Keep checklist item 9 open because the recent Worker log stream returned no observable events. Record the repeated migration prompt as the root cause for v7.2 and include the fresh automated verification results.

- [ ] **Step 3: Commit documentation and push the feature branch**

```powershell
git add docs/operations/sites-oauth-feasibility.md docs/superpowers/plans/2026-08-01-arc-secure-cross-email-account-linking.md docs/superpowers/plans/2026-08-05-arc-device-migration-prompt.md
git commit -m "docs: close v7 account isolation verification"
git push origin feature/arc-beta-foundation
```

Verify that the remote branch head equals local `HEAD` and that draft PR #3 reflects the pushed commits.

- [ ] **Step 4: Save and deploy the exact verified source as product v7.2**

Read `.openai/hosting.json`, package the exact successful build with the Sites helper, save one new version from the pushed `HEAD`, and deploy it publicly under the user's existing approval. Do not change OAuth credentials, runtime variables, D1 schema, R2 bindings, access policy, or the production slug. Poll until deployment reaches `succeeded`; retain Sites version 6 as the rollback artifact.

- [ ] **Step 5: Perform production smoke without mutating learning data**

Open the production URL, confirm `/today` and the session endpoint respond normally, and confirm deployment status remains successful. Ask the user for one final UX observation: on the existing Google account, select **Not now**, navigate among workspace pages, and reload once; the same unchanged prompt must remain absent. A changed local setup may prompt again by design.

- [ ] **Step 6: Close the release checkpoint**

Append the Sites version/deployment evidence and final UX result after the user reports it. If the smoke passes, mark this plan complete and move the project from v7 stabilization to the already-approved v8 product-planning phase. If authentication, account identity, learning state, or import consent regresses, roll back to Sites version 6 and keep v7 open.
