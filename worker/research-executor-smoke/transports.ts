import { z } from "zod";
import { researchCandidateSchema } from "../../app/contracts/research";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { BRIDGE_BODY_LIMITS, readBridgeBody } from "../../app/server/research/executor/body";
import type { BridgeJob } from "../../app/server/research/executor/job";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { RESEARCH_PROVIDER_LIMITS, RESEARCH_PROVIDER_VERSIONS } from "../../app/server/research/provider";
import { validAnnotations } from "../../tests/fixtures/research/valid-candidate";
import type { SmokeEvidence } from "./evidence";
import { SCENARIOS, candidateForScenario, scenarioForJob } from "./scenarios";
import type { SmokeTiming } from "./timing";

function invalid(): never { throw new Error("Invalid smoke transport"); }
function aborted(): DOMException { return new DOMException("Aborted", "AbortError"); }
const bridgePaths = Object.freeze({
  site: ["begin", "accepted", "complete", "metadata", "maintenance", "outbox"].map(name => `/api/internal/research-bridge/${name}`),
  executor: ["submit", "status", "close", "result", "acknowledge"].map(name => `/internal/research-bridge/${name}`),
});

export function createBridgeFetch(binding: Fetcher, peerOrigin: string, target: "site" | "executor"): typeof globalThis.fetch {
  if (!binding || typeof binding.fetch !== "function" || (target !== "site" && target !== "executor")) invalid();
  let peer: URL;
  try { peer = new URL(peerOrigin); } catch { return invalid(); }
  if (peer.protocol !== "https:" || peer.origin !== peerOrigin || peerOrigin.length > 256 || peer.username || peer.password) invalid();
  return async (request, init) => {
    if (!(request instanceof Request) || init !== undefined) invalid();
    const url = new URL(request.url);
    if (url.origin !== peerOrigin || url.username || url.password || url.search || url.hash
      || !bridgePaths[target].includes(url.pathname) || request.method !== "POST" || request.redirect !== "manual"
      || !request.signal || request.headers.has("origin")) invalid();
    if (request.signal.aborted) throw aborted();
    const bytes = await readBridgeBody(request, { maxBytes: BRIDGE_BODY_LIMITS.request, timeoutMs: 5_000, signal: request.signal });
    if (request.signal.aborted) throw aborted();
    // Reconstitute only after the bounded read; retain signed headers and signal.
    const response = await binding.fetch(new Request(request, { body: new Uint8Array(bytes), redirect: "manual", signal: request.signal }));
    if (request.signal.aborted || response.redirected || (response.status >= 300 && response.status < 400)) {
      void response.body?.cancel().catch(() => undefined);
      if (request.signal.aborted) throw aborted();
      invalid();
    }
    return response;
  };
}

const requestSchema = z.object({
  model: z.literal("moonshotai/kimi-k3"), stream: z.literal(false), max_tokens: z.literal(32_768),
  messages: z.tuple([
    z.object({ role: z.literal("system"), content: z.string().min(1).max(32_768) }).strict(),
    z.object({ role: z.literal("user"), content: z.string().min(1).max(4_096) }).strict(),
  ]),
  response_format: z.object({ type: z.literal("json_schema"), json_schema: z.object({
    name: z.literal("arc_research_candidate"), strict: z.literal(true), schema: z.unknown(),
  }).strict() }).strict(),
  provider: z.object({ require_parameters: z.literal(true), data_collection: z.literal("deny"), zdr: z.literal(true) }).strict(),
  reasoning: z.object({ effort: z.literal("low") }).strict(),
  tools: z.tuple([z.object({ type: z.literal("openrouter:web_search"), parameters: z.object({
    engine: z.literal("exa"), mode: z.literal("fast"), max_results: z.literal(5), max_uses: z.literal(10),
    max_total_results: z.literal(50), max_characters: z.literal(2_000),
  }).strict() }).strict()]), max_tool_calls: z.literal(10),
}).strict();
const userSchema = z.object({ role: z.string().max(640), locale: z.literal("en-US"), versions: z.unknown() }).strict();
const expectedSchema = canonicalJson(JSON.parse(JSON.stringify(z.toJSONSchema(researchCandidateSchema, { target: "draft-7" }))));
// SHA256 of the accepted real adapter's Kimi system policy. Any drift fails closed.
const systemPolicyHash = "ace9859a8c99335ae6229083e236989495defb326a66d37720aaa930acc0c076";

function isDelay(ms: number): boolean { return Number.isSafeInteger(ms) && ms >= 0 && ms <= 1_170_000; }
function snapshotTiming(timing: SmokeTiming): SmokeTiming {
  if (!timing || Object.keys(timing).length !== 3) invalid();
  for (const s of SCENARIOS) {
    const entry = timing[s.id];
    if (!entry || Object.keys(entry).length !== 2 || !isDelay(entry.headersMs) || !isDelay(entry.bodyMs)) invalid();
  }
  return Object.freeze(Object.fromEntries(SCENARIOS.map(s => [s.id, Object.freeze({ ...timing[s.id] })])) as SmokeTiming);
}

export function createSyntheticProviderFetch(options: { currentJob(): BridgeJob; evidence: SmokeEvidence; timing: SmokeTiming }): typeof globalThis.fetch {
  if (!options || typeof options.currentJob !== "function" || typeof options.evidence?.increment !== "function") invalid();
  const timing = snapshotTiming(options.timing);
  const currentJob = options.currentJob;
  const evidence = options.evidence;
  return async (input, init) => {
    // Unknown invocation identity is not attributed to another scenario's evidence.
    const job = currentJob();
    const scenario = scenarioForJob(job);
    let repair = false;
    try {
      if (input !== "https://openrouter.ai/api/v1/chat/completions" || !init || init.method !== "POST" || init.redirect !== "manual"
        || !(init.signal instanceof AbortSignal) || typeof init.body !== "string"
        || init.body.length > RESEARCH_PROVIDER_LIMITS.requestBytes || new TextEncoder().encode(init.body).byteLength > RESEARCH_PROVIDER_LIMITS.requestBytes
        || Object.keys(init).some(key => !["method", "redirect", "headers", "body", "signal"].includes(key))
        || new Headers(init.headers).get("content-type") !== "application/json") invalid();
      if (init.signal.aborted) throw aborted();
      const body = JSON.parse(init.body) as unknown;
      const parsed = requestSchema.safeParse(body);
      // Detect Repair-shaped user input even when the rest of its policy is invalid.
      if (body && typeof body === "object" && "messages" in body && Array.isArray(body.messages)) {
        const message: unknown = body.messages[1];
        if (message && typeof message === "object" && "content" in message && typeof message.content === "string") {
          const user: unknown = JSON.parse(message.content);
          repair = !!user && typeof user === "object" && ("originalContent" in user || "annotations" in user);
        }
      }
      if (!parsed.success || repair) invalid();
      const b = parsed.data;
      const user = userSchema.safeParse(JSON.parse(b.messages[1].content));
      if (!user.success || user.data.role !== scenario.role || user.data.locale !== scenario.locale
        || canonicalJson(user.data.versions) !== canonicalJson(RESEARCH_PROVIDER_VERSIONS)
        || canonicalJson(b.response_format.json_schema.schema) !== expectedSchema) invalid();
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b.messages[0].content)));
      if (Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("") !== systemPolicyHash) invalid();
      if (init.signal.aborted) throw aborted();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      await evidence.increment(scenario.jobId, "rejection");
      if (repair) await evidence.increment(scenario.jobId, "repair");
      return invalid();
    }
    const signal = init!.signal!;
    await evidence.increment(scenario.jobId, "provider");
    await waitForSmokeDelay(timing[scenario.id].headersMs, signal);
    if (signal.aborted) throw aborted();
    const bytes = new TextEncoder().encode(JSON.stringify({
      model: KIMI_RESEARCH_EXECUTION_POLICY.model,
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(candidateForScenario(scenario.id)),
        annotations: validAnnotations.map(({ type, url, title }) => ({ type, url_citation: { url, title } })),
      } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.000001, server_tool_use: { web_search_requests: 2 } },
    }));
    if (bytes.byteLength > RESEARCH_PROVIDER_LIMITS.responseBytes) invalid();
    return delayedBody(bytes, timing[scenario.id].bodyMs, signal);
  };
}

function delayedBody(bytes: Uint8Array, ms: number, signal: AbortSignal): Response {
  const controller = new AbortController();
  let settled = false;
  const onAbort = () => controller.abort();
  const cleanup = () => { signal.removeEventListener("abort", onAbort); };
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      void waitForSmokeDelay(ms, controller.signal).then(() => {
        if (settled) return;
        if (controller.signal.aborted) { settled = true; cleanup(); stream.error(aborted()); return; }
        settled = true; cleanup(); stream.enqueue(bytes); stream.close();
      }, () => { if (!settled) { settled = true; cleanup(); stream.error(aborted()); } });
    },
    cancel() { settled = true; controller.abort(); cleanup(); },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/json", "content-length": String(bytes.byteLength) } });
}

export function waitForSmokeDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (!isDelay(ms) || !(signal instanceof AbortSignal)) return Promise.reject(new Error("Invalid smoke delay"));
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(aborted()); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(aborted()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
