import { describe, expect, it } from "vitest";
import { safeReturnTo, setupHref, signInHref } from "../../app/lib/navigation-context";

describe("safe return navigation", () => {
  it.each([
    "/", "/today", "/path?skill=research-basics#unit-2",
    "/setup?mode=edit&section=time", "/proof?compose=1&unit=unit-a&returnTo=%2Ftoday",
    "/stack?skill=data-analysis&category=reading", "/coach", "/history?page=2",
    "/method", "/showcase?tab=path", "/intelligence", "/admin",
  ])("preserves the recognized destination %s", (destination) => {
    expect(safeReturnTo(destination)).toBe(destination);
  });

  it.each([
    undefined, null, "", "https://outside.example/path", "//outside.example", "javascript:alert(1)",
    "/\\outside.example", "/today\\outside", "/%2f%2foutside.example", "/%255coutside.example",
    "/today%3fnext=//outside.example", "/today%0a", "/today?skill=%0d%0aevil", "/today?skill=%255cevil",
    "/sign-in", "/sign-in?next=%2Ftoday", "/sign-in/", "/today/../sign-in", "/api/auth/sign-out",
    "/unknown", " /today", "/today?invalid=%E0%A4%A", "/today?next=https%3A%2F%2Foutside.example",
    "/today?returnTo=%252F%252Foutside.example", "/proof?returnTo=%2Fsign-in",
  ])("falls back for an unsafe or unsupported destination %s", (destination) => {
    expect(safeReturnTo(destination)).toBe("/today");
    expect(safeReturnTo(destination, "/setup?mode=create")).toBe("/setup?mode=create");
  });

  it("validates a caller-provided fallback too", () => {
    expect(safeReturnTo(null, "//outside.example")).toBe("/today");
  });

  it("encodes nested query and hash state once in the sign-in URL", () => {
    const destination = "/proof?compose=1&returnTo=%2Ftoday#draft";
    const href = signInHref(destination);
    expect(href).toBe(`/sign-in?next=${encodeURIComponent(destination)}`);
    expect(new URL(href, "https://arc.example").searchParams.get("next")).toBe(destination);
    expect(signInHref("https://outside.example")).toBe("/sign-in?next=%2Ftoday");
  });

  it("carries the validated original operation through required setup", () => {
    const destination = "/proof?compose=1&unit=old-unit&returnTo=%2Ftoday#draft";
    expect(setupHref(destination)).toBe(`/setup?mode=create&returnTo=${encodeURIComponent(destination)}`);
    expect(setupHref("//outside.example")).toBe("/setup?mode=create&returnTo=%2Ftoday");
    expect(setupHref("/proof?returnTo=%2Fsign-in")).toBe("/setup?mode=create&returnTo=%2Ftoday");
  });
});
