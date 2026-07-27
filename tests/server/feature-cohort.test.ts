import { describe, expect, it } from "vitest";
import { D1FeatureCohort } from "../../app/server/entitlements/d1-feature-cohort";

class FakeStatement {
  values: unknown[] = [];
  constructor(private readonly row: unknown, readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return this.row as T | null; }
}

function cohort(row: unknown) {
  const calls: FakeStatement[] = [];
  const db = {
    prepare(sql: string) {
      const statement = new FakeStatement(row, sql);
      calls.push(statement);
      return statement;
    },
  } as unknown as D1Database;
  return { policy: new D1FeatureCohort(db), calls };
}

describe("D1FeatureCohort", () => {
  it("fails closed when the flag is missing, disabled, or malformed", async () => {
    await expect(cohort(null).policy.allows("role-research-preview", "user-owner")).resolves.toBe(false);
    await expect(cohort({ enabled: 0, cohort_json: "{}" }).policy.allows(
      "role-research-preview",
      "user-owner",
    )).resolves.toBe(false);
    await expect(cohort({ enabled: 1, cohort_json: "not-json" }).policy.allows(
      "role-research-preview",
      "user-owner",
    )).resolves.toBe(false);
  });

  it("allows the full enabled cohort represented by an empty policy", async () => {
    const harness = cohort({ enabled: 1, cohort_json: "{}" });
    await expect(harness.policy.allows("role-research-preview", "user-owner")).resolves.toBe(true);
    expect(harness.calls[0].values).toEqual(["role-research-preview"]);
  });

  it("exact-matches an explicit user cohort", async () => {
    const policy = cohort({
      enabled: 1,
      cohort_json: JSON.stringify({ userIds: ["user-owner"] }),
    }).policy;

    await expect(policy.allows("role-research-preview", "user-owner")).resolves.toBe(true);
    await expect(policy.allows("role-research-preview", "user-owner-attacker")).resolves.toBe(false);
  });
});
