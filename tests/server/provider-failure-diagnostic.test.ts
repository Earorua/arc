// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { ResearchProviderError } from "../../app/server/research/provider";

const request = { role: "Data Product Manager", locale: "en-US" } as const;
const config = { OPENROUTER_API_KEY: "synthetic-diagnostic-key", ARC_AI_MODEL_RESEARCH: "test/research-fixed" };
const canary = "CANARY-private-provider-evidence";

describe("OpenRouter failure diagnostic boundary", () => {
  it("reports only fixed diagnostic fields for a parsed HTTP 403 permission error", async () => {
    const onFailureDiagnostic = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      id: canary, request_id: canary, error: { code: 403, message: canary,
        metadata: { error_type: "permission_denied", provider_code: canary, raw: canary, flagged_input: canary, reasons: [canary] } },
    }, { status: 403, headers: { "x-request-id": canary } }));
    const dependencies = { fetch, onFailureDiagnostic };
    const provider = new OpenRouterResearchProvider(config, dependencies);
    const error = await provider.research(request).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ResearchProviderError);
    expect(error).toMatchObject({ code: "unavailable", retryable: false, charged: false, actualModel: null, usage: null });
    expect(onFailureDiagnostic).toHaveBeenCalledOnce();
    expect(onFailureDiagnostic.mock.calls[0]).toEqual([{
      httpStatus: 403, location: "http-error", errorCode: 403, errorCodeState: "recognized",
      errorType: "permission_denied", errorTypeState: "recognized",
    }]);
    expect(JSON.stringify([error, onFailureDiagnostic.mock.calls])).not.toContain(canary);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
