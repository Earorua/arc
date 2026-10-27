import { createGuardedTransport, SafeValidationError, type KeyCheckDiagnostics } from "./transport";
import { extractProviderFailureDiagnostic, type ProviderFailureDiagnostic } from "../../app/server/research/provider-failure-diagnostic";
import { explainProviderErrorMessage } from "./safe-error-explanation";

const MODEL = "moonshotai/kimi-k3";
const URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 120_000;
const MAX_BYTES = 65_536;
const MAX_COST_MICROS = 5_000_000;
const body = JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "Reply exactly OK." }],
  max_tokens: 512, stream: false, provider: { require_parameters: true, data_collection: "deny", zdr: true } });

type Reason = "transport-denied" | "key-invalid" | "key-check-failed" | "key-policy-denied" | "validation-incomplete"
  | "timeout" | "network-error" | "invalid-response" | "provider-error" | "no-visible-output" | "cost-over-limit";
class ProbeFailure extends Error {
  constructor(readonly reason: Reason) { super(reason); }
}
type Usage = { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null; costMicros: number | null };
export type MinimalProbeSummary = {
  mode: "minimal-probe-one" | "offline-minimal-probe";
  timestamp: string; outcome: "passed" | "incomplete"; reason: Reason | null;
  requestedModel: string; actualModel: string | null;
  keyHttpStatus: number | null; inferenceHttpStatus: number | null;
  keyDiagnostics: KeyCheckDiagnostics | null;
  inferenceDiagnostics: ProviderFailureDiagnostic | null;
  messageExplanation: ReturnType<typeof explainProviderErrorMessage> | null;
  output: "not-observed" | "expected-ok" | "other-text" | "empty";
  usage: Usage | null;
  realRequestCount: number; keyRequestCount: number; inferenceRequestCount: number;
  researchRequestCount: 0; repairRequestCount: 0;
};
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function usage(value: unknown): Usage {
  const data = record(value);
  const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const cost = data?.cost;
  if (cost != null && (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > Number.MAX_SAFE_INTEGER / 1_000_000)) {
    throw new ProbeFailure("invalid-response");
  }
  return { promptTokens: integer(data?.prompt_tokens), completionTokens: integer(data?.completion_tokens), totalTokens: integer(data?.total_tokens),
    costMicros: typeof cost === "number" ? Math.ceil(cost * 1_000_000) : null };
}
function cancel(response: Response | undefined) {
  try { void response?.body?.cancel().catch(() => undefined); } catch { /* No response details escape cleanup. */ }
}

/** Standalone fixed-text diagnostic; the default only exercises a synthetic transport. */
export async function runMinimalProbe(options: { executeOne?: boolean; key?: string; fetch?: typeof globalThis.fetch } = {}): Promise<MinimalProbeSummary> {
  const live = options.executeOne === true;
  const summary: MinimalProbeSummary = {
    mode: live ? "minimal-probe-one" : "offline-minimal-probe", timestamp: new Date().toISOString(), outcome: "incomplete", reason: null,
    requestedModel: MODEL, actualModel: null, keyHttpStatus: null, inferenceHttpStatus: null, keyDiagnostics: null,
    inferenceDiagnostics: null, messageExplanation: null, output: "not-observed", usage: null,
    realRequestCount: 0, keyRequestCount: 0, inferenceRequestCount: 0, researchRequestCount: 0, repairRequestCount: 0,
  };
  let transport: ReturnType<typeof createGuardedTransport> | undefined;
  let key: string | undefined;
  try {
    if (live && !options.fetch) throw new ProbeFailure("transport-denied");
    key = live ? options.key : "synthetic-minimal-probe-key";
    const fixture: typeof globalThis.fetch = async (url) => url === URL
      ? Response.json({ model: MODEL, choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12, cost: 0.001 } })
      : Response.json({ data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, byok_usage: 0, is_management_key: false } });
    transport = createGuardedTransport(key!, live ? options.fetch! : fixture);
    await transport.inspectKey();
    const outbound = transport.fetch;
    const controller = new AbortController();
    const startedAt = Date.now();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let response: Response | undefined;
    let complete = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new ProbeFailure("timeout")); }, TIMEOUT_MS);
    });
    try {
      const exchange = async () => {
        response = await outbound(URL, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body, signal: controller.signal });
        if (controller.signal.aborted) { cancel(response); throw new ProbeFailure("timeout"); }
        const claimed = response.headers.get("content-length");
        if (!response.body || claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_BYTES)) throw new ProbeFailure("invalid-response");
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        let text = "";
        while (true) {
          const chunk = await reader.read();
          if (controller.signal.aborted) throw new ProbeFailure("timeout");
          if (chunk.done) { complete = true; break; }
          bytes += chunk.value.byteLength;
          if (bytes > MAX_BYTES) throw new ProbeFailure("invalid-response");
          try { text += decoder.decode(chunk.value, { stream: true }); } catch { throw new ProbeFailure("invalid-response"); }
        }
        try { text += decoder.decode(); } catch { throw new ProbeFailure("invalid-response"); }
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new ProbeFailure("invalid-response"); }
        if (controller.signal.aborted || Date.now() - startedAt >= TIMEOUT_MS) throw new ProbeFailure("timeout");
        const data = record(parsed);
        if (!data) throw new ProbeFailure("invalid-response");
        summary.actualModel = data.model === MODEL ? MODEL : null;
        // A malformed completion can still carry a valid charge receipt.
        // Preserve it before validating choices, without masking a provider error.
        let invalidUsage = false;
        try { summary.usage = usage(data.usage); } catch { invalidUsage = true; }
        const diagnose = (error: unknown, location: ProviderFailureDiagnostic["location"]) => {
          summary.inferenceDiagnostics = extractProviderFailureDiagnostic(response!.status, location, error);
          summary.messageExplanation = explainProviderErrorMessage(record(error)?.message);
        };
        if (response.status !== 200 || data.error != null) {
          diagnose(data.error, response.status === 200 ? "top-level-error" : "http-error");
          throw new ProbeFailure("provider-error");
        }
        const choices = data.choices;
        const choice = Array.isArray(choices) && choices.length > 0 ? record(choices[0]) : null;
        if (!choice) throw new ProbeFailure("invalid-response");
        const message = record(choice.message);
        if (choice.error != null || message?.error != null || choice.finish_reason === "error") {
          diagnose(choice.error ?? message?.error, "choice-error");
          throw new ProbeFailure("provider-error");
        }
        if (!message || message.content != null && typeof message.content !== "string") throw new ProbeFailure("invalid-response");
        const content = typeof message.content === "string" ? message.content.trim() : "";
        summary.output = !content ? "empty" : content === "OK" ? "expected-ok" : "other-text";
        if (invalidUsage || !summary.usage) throw new ProbeFailure("invalid-response");
        if (summary.usage.costMicros !== null && summary.usage.costMicros > MAX_COST_MICROS) throw new ProbeFailure("cost-over-limit");
        if (!content) throw new ProbeFailure("no-visible-output");
        summary.outcome = "passed";
      };
      await Promise.race([exchange(), deadline]);
    } finally {
      clearTimeout(timer);
      if (!complete) {
        controller.abort();
        if (reader) { try { void reader.cancel().catch(() => undefined); } catch { /* Cleanup only. */ } }
        else cancel(response);
      }
      try { reader?.releaseLock(); } catch { /* A cancelled pending read may still hold its lock. */ }
    }
  } catch (error) {
    summary.outcome = "incomplete";
    summary.reason = error instanceof ProbeFailure ? error.reason : error instanceof SafeValidationError ? error.code : "network-error";
  } finally {
    key = undefined;
    if (transport) {
      const counts = transport.counts();
      summary.keyHttpStatus = counts.keyHttpStatus;
      summary.inferenceHttpStatus = counts.researchHttpStatus;
      summary.keyDiagnostics = transport.diagnostics();
      summary.keyRequestCount = counts.getCount;
      summary.inferenceRequestCount = counts.postCount;
      summary.realRequestCount = live ? counts.getCount + counts.postCount : 0;
      transport.clear();
    }
  }
  return summary;
}
