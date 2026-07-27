import { describe, expect, it } from "vitest";
import { requireD1 } from "../../db/d1";

describe("D1 binding access", () => {
  it("returns the injected D1 binding", () => {
    const binding = { prepare: () => undefined } as unknown as D1Database;

    expect(requireD1(binding)).toBe(binding);
  });

  it("fails clearly when the logical DB binding is missing", () => {
    expect(() => requireD1(undefined)).toThrow("`DB`");
  });
});
