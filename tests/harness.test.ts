import { describe, expect, it } from "vitest";

describe("Arc test harness", () => {
  it("provides a DOM environment", () => {
    expect(document.documentElement).toBeInstanceOf(HTMLElement);
  });
});
