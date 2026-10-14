// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { explainProviderErrorMessage } from "../../scripts/live-research/safe-error-explanation";

describe("pure provider error message explanation", () => {
  const cases = [
    ["Invalid API key supplied", "invalid-or-disabled-key", "Provider reported that the API key may be invalid or disabled."],
    ["Account suspended", "account-restricted", "Provider reported that the account may be disabled or restricted."],
    ["Insufficient credits", "insufficient-credits", "Provider reported that available credits may be insufficient."],
    ["Country is not supported", "region-restriction", "Provider reported a possible country or region restriction."],
    ["Request blocked by moderation", "guardrail-or-moderation", "Provider reported a possible guardrail or moderation restriction."],
    ["No endpoints found matching your data policy", "privacy-or-routing", "Provider reported that no route may satisfy the request constraints."],
    ["Invalid model ID", "invalid-model", "Provider reported that the requested model may be invalid or unavailable."],
    ["Rate limit exceeded", "rate-limit", "Provider reported that a rate limit may have been reached."],
    ["Permission denied", "permission", "Provider reported a possible permission restriction."],
    ["Provider returned error", "provider-error", "Provider reported an unspecified provider error."],
  ] as const;

  it.each(cases)("maps %s to a finite static explanation", (message, category, summary) => {
    expect(explainProviderErrorMessage(message)).toEqual({ state: "recognized", category, summary });
  });

  it.each([
    [undefined, { state: "missing", category: null, summary: "Provider did not include an error message." }],
    [null, { state: "missing", category: null, summary: "Provider did not include an error message." }],
    [403, { state: "invalid", category: null, summary: "Provider returned an invalid error message." }],
    [{}, { state: "invalid", category: null, summary: "Provider returned an invalid error message." }],
    ["opaque failure", { state: "unrecognized", category: null, summary: "Provider returned an unrecognized error message." }],
  ] as const)("handles non-actionable message %j", (message, expected) => {
    expect(explainProviderErrorMessage(message)).toEqual(expected);
  });

  it("recognizes useful variants within each family", () => {
    expect(explainProviderErrorMessage("Authentication failed")).toMatchObject({ category: "invalid-or-disabled-key" });
    expect(explainProviderErrorMessage("Your account was flagged and disabled")).toMatchObject({ category: "account-restricted" });
    expect(explainProviderErrorMessage("Payment required: add credits")).toMatchObject({ category: "insufficient-credits" });
    expect(explainProviderErrorMessage("This model is unavailable in your region")).toMatchObject({ category: "region-restriction" });
    expect(explainProviderErrorMessage("Content policy violation")).toMatchObject({ category: "guardrail-or-moderation" });
    expect(explainProviderErrorMessage("No matching endpoints for ZDR")).toMatchObject({ category: "privacy-or-routing" });
    expect(explainProviderErrorMessage("Model not found")).toMatchObject({ category: "invalid-model" });
    expect(explainProviderErrorMessage("Too many requests")).toMatchObject({ category: "rate-limit" });
    expect(explainProviderErrorMessage("Forbidden")).toMatchObject({ category: "permission" });
    expect(explainProviderErrorMessage("Upstream provider error")).toMatchObject({ category: "provider-error" });
  });

  it("never echoes secrets or arbitrary suffixes attached to recognizable phrases", () => {
    const canary = "Bearer sk-CANARY abc@example.com https://private.example request-id=abc123\u0000\u0007";
    for (const [prefix] of cases) {
      const result = explainProviderErrorMessage(`${prefix}: ${canary}`);
      expect(result.state).toBe("recognized");
      expect(JSON.stringify(result)).not.toMatch(/CANARY|Bearer|abc@example|private\.example|abc123|\\u0000|\\u0007/u);
    }
    const unknown = explainProviderErrorMessage(canary);
    expect(unknown).toMatchObject({ state: "unrecognized", category: null });
    expect(JSON.stringify(unknown)).not.toMatch(/CANARY|Bearer|abc@example|private\.example|abc123/u);
  });

  it("inspects no more than 4096 characters", () => {
    expect(explainProviderErrorMessage(`${"x".repeat(4096)} Invalid API key`)).toMatchObject({ state: "unrecognized", category: null });
    expect(explainProviderErrorMessage(`Invalid API key ${"x".repeat(5000)}`)).toMatchObject({ state: "recognized", category: "invalid-or-disabled-key" });
  });

  it("has no imports or side-effect channels", () => {
    const source = readFileSync("scripts/live-research/safe-error-explanation.ts", "utf8");
    expect(source).not.toMatch(/^\s*import\s|import\(|process\.|globalThis\.|fetch\(|console\.|localStorage|sessionStorage/mu);
  });
});
