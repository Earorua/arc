// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cleanupFixture,
  fixtureHarness,
  login,
  preservedRows,
  rows,
} from "../helpers/auth-migration-fixture";

const harness = fixtureHarness();

describe("synthetic auth migration identity acceptance with the real library", () => {
  it("retains both linked provider subjects and all original business data despite another owner's email", async () => {
    const f = await harness.fixture({ linkedBoth: true });
    const before = preservedRows(f);

    await expect(cleanupFixture(f)).resolves.toMatchObject({ socialAccountsCleared: 3 });
    for (const provider of ["google", "github"] as const) {
      const result = await login(f, provider, "a", { email: "owner-b@example.test" });
      expect(result.error).toBeNull();
      expect(result.isRegister).toBe(false);
      expect(result.data?.user.id).toBe("owner-a");
      expect(result.data?.session.userId).toBe("owner-a");
    }

    expect(rows(f, "sessions").map((session) => session.user_id)).toEqual(["owner-a", "owner-a"]);
    expect(preservedRows(f)).toEqual(before);
    expect(rows(f, "users")).toHaveLength(2);
    expect(rows(f, "accounts")).toHaveLength(3);
  });

  it.each([
    { email: "owner-a@example.test", error: "account not linked" },
    { email: "new-owner@example.test", error: "signup disabled" },
  ])("rejects an unmapped subject with $email as '$error' when diagnostic signup is disabled", async ({ email, error }) => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");

    // This diagnostic option is not application policy. It isolates the
    // no-implicit-linking path from the registration counterexample below.
    const result = await login(f, "google", "a", { subject: "missing-subject", email });

    expect(result.error).toBe(error);
    expect(result.data).toBeNull();
    expect(rows(f, "sessions")).toEqual([]);
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(before);
  });

  it("refuses an orphaned provider mapping before cleanup or any email fallback", async () => {
    const f = await harness.fixture();
    f.db.database.exec("PRAGMA foreign_keys = OFF");
    f.db.database.prepare("UPDATE accounts SET user_id = 'missing-owner' WHERE id = 'google-a'").run();
    f.db.database.exec("PRAGMA foreign_keys = ON");
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");

    await expect(cleanupFixture(f)).rejects.toThrow(/^AUTH_REHEARSAL_FOREIGN_KEYS$/);

    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(before);
    expect(rows(f, "sessions")).toEqual([]);
    // Deliberately no OAuth attempt: invalid migration preconditions stop first.
  });

  it("demonstrates failed identity continuity when default signup accepts a changed subject and new email", async () => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");

    const result = await login(f, "google", "a", {
      subject: "unmapped-new-subject",
      email: "unmapped-new@example.test",
      disableSignUp: false,
    });

    expect(result.error).toBeNull();
    expect(result.isRegister).toBe(true);
    const newUserId = result.data?.user.id;
    expect(newUserId).toBeTypeOf("string");
    expect(newUserId).not.toBe("owner-a");
    expect(newUserId).not.toBe("owner-b");
    expect(result.data?.session.userId).toBe(newUserId);
    expect(rows(f, "sessions").map((session) => session.user_id)).toEqual([newUserId]);
    expect(rows(f, "users")).toHaveLength(3);
    expect(rows(f, "accounts")).toHaveLength(3);
    expect(rows(f, "accounts").filter((account) => account.user_id === newUserId)).toEqual([
      expect.objectContaining({ provider_id: "google", account_id: "unmapped-new-subject", user_id: newUserId }),
    ]);
    expect(rows(f, "accounts").filter((account) => account.user_id !== newUserId)).toEqual(accountsBefore);
    const after = preservedRows(f);
    expect({
      ...after,
      users: after.users.filter((user) => user.id !== newUserId),
      accountIdentities: after.accountIdentities.filter((account) => account.user_id !== newUserId),
    }).toEqual(before);
  });
});
