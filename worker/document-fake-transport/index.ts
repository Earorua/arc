import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { z } from "zod";
import { readDocumentBridgeBody } from "../../app/server/documents/executor-bridge";
import { segmentDocumentText } from "../../app/server/documents/text";
import { documentAcceptanceCases, utf8Sha256 } from "../document-executor/acceptance-policy";
import { documentProviderQualificationSchema, type DocumentProviderQualification } from "../document-executor/provider-http";

interface SyntheticEnvironment {
  SYNTHETIC_QUALIFICATION: string;
  SYNTHETIC_RECEIPTS: DurableObjectNamespace<DocumentSyntheticReceipts>;
}

// Each configuration has one counter. Its random prefix and gap-free sequence prove issuance
// across Worker restarts without retaining a document, prompt, header or per-request record.
export class DocumentSyntheticReceipts extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS receipt_counter (singleton INTEGER PRIMARY KEY CHECK (singleton=1), prefix TEXT NOT NULL, issued INTEGER NOT NULL)");
  }
  async issue(): Promise<string> {
    const row = this.ctx.storage.sql.exec<{ prefix: string; issued: number }>(
      "INSERT INTO receipt_counter VALUES (1, ?, 1) ON CONFLICT(singleton) DO UPDATE SET issued=issued+1 WHERE issued < ? RETURNING prefix, issued",
      crypto.randomUUID(), Number.MAX_SAFE_INTEGER,
    ).one();
    return "gen-" + row.prefix + "-" + row.issued;
  }
  async isIssued(id: string): Promise<boolean> {
    const row = this.ctx.storage.sql.exec<{ prefix: string; issued: number }>("SELECT prefix, issued FROM receipt_counter WHERE singleton=1").toArray()[0];
    if (!row) return false;
    const prefix = "gen-" + row.prefix + "-";
    const sequence = Number(id.slice(prefix.length));
    return Number.isSafeInteger(sequence) && sequence > 0 && sequence <= row.issued && id === prefix + sequence;
  }
}

const chat = z.strictObject({
  model: z.string(),
  messages: z.tuple([z.strictObject({ role: z.literal("system"), content: z.string() }),
    z.strictObject({ role: z.literal("user"), content: z.string() })]),
  stream: z.literal(false), response_format: z.strictObject({ type: z.literal("json_object") }),
  provider: z.strictObject({
    only: z.tuple([z.string()]), order: z.tuple([z.string()]), allow_fallbacks: z.literal(false),
    require_parameters: z.literal(true), data_collection: z.literal("deny"), zdr: z.literal(true),
    max_price: z.strictObject({ prompt: z.number().nonnegative(), completion: z.number().nonnegative(), request: z.literal(0) }),
  }),
});
const kimiChat = chat.extend({ max_tokens: z.literal(4096) });
const standardChat = chat.extend({ max_completion_tokens: z.literal(4096), temperature: z.literal(0) });
const document = z.strictObject({ kind: z.enum(["resume", "jd"]),
  segments: z.array(z.strictObject({ segmentId: z.string(), text: z.string().min(1) })).min(1).max(64) });
// A new system prompt must be reviewed against the frozen candidate before this fixture accepts it.
const promptSha256 = "d898968f77f383d3a83a849e6bc1995a8c51ccd0eb52fcaea0f0588ebceb3d13";
const usage = { prompt_tokens: 100, completion_tokens: 20, cost: 0 };
const noStore = { "cache-control": "no-store" };
const empty = (status = 404) => new Response(null, { status, headers: noStore });

async function fixtureCandidate(request: Request, qualification: DocumentProviderQualification) {
  const bytes = await readDocumentBridgeBody(request, 32 * 1024);
  const upstream = qualification.routingPolicy.providerOrder[0];
  const isKimi = qualification.model === "moonshotai/kimi-k3.1-pro" && upstream === "moonshotai/mxfp4";
  const body = (isKimi ? kimiChat : standardChat).parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  if (body.model !== qualification.model || body.provider.only[0] !== upstream || body.provider.order[0] !== upstream
    || body.provider.max_price.prompt !== qualification.inputMicroUsdPerMillionTokens / 1_000_000
    || body.provider.max_price.completion !== qualification.outputMicroUsdPerMillionTokens / 1_000_000
    || await utf8Sha256(body.messages[0].content) !== promptSha256) return null;
  const data = document.parse(JSON.parse(body.messages[1].content));
  const text = data.segments.map(segment => segment.text).join("");
  const digest = await utf8Sha256(text);
  if (!Object.entries(documentAcceptanceCases).some(([id, hash]) => id.startsWith(data.kind + "-") && hash === digest)) return null;
  const segments = segmentDocumentText(text);
  if (segments.length !== data.segments.length || segments.some((segment, i) => segment.id !== data.segments[i]!.segmentId
    || text.slice(segment.start, segment.end) !== data.segments[i]!.text)) return null;
  // Deterministic, source-backed UI fixture. No model runs and evaluator annotations stay offline.
  for (const segment of data.segments) {
    const quote = segment.text.split("\n").map(line => line.trim()).find(line => line && !line.startsWith("[SYNTHETIC"));
    if (quote) {
      const evidence = quote.slice(0, 256);
      return { schemaVersion: "2026.11.1", items: [{ id: "synthetic-fact", kind: data.kind === "jd" ? "requirement" : "experience",
        text: evidence, requirementLevel: data.kind === "jd" ? "unspecified" : null, skillLabels: [], selfLevelHint: null,
        source: { segmentId: segment.segmentId, quote: evidence } }], reviewPoints: [] };
    }
  }
  return null;
}

async function receipts(env: SyntheticEnvironment) {
  const scope = await utf8Sha256(env.SYNTHETIC_QUALIFICATION);
  return env.SYNTHETIC_RECEIPTS.getByName(scope);
}

export class DocumentFakeTransport extends WorkerEntrypoint<SyntheticEnvironment> {
  async fetch(request: Request): Promise<Response> {
    const env = this.env;
    if (request.headers.get("authorization") !== "Bearer synthetic-transport-only") return empty();
    let qualification: DocumentProviderQualification;
    try { qualification = documentProviderQualificationSchema.parse(JSON.parse(env.SYNTHETIC_QUALIFICATION)); }
    catch { return empty(); }
    const endpoint = new URL(qualification.endpoint), route = qualification.receiptRoute;
    if (!endpoint.hostname.endsWith(".invalid") || qualification.routingPolicy.providerOrder.length !== 1) return empty();
    if (request.method === "POST" && request.url === endpoint.href) {
      if (request.headers.get("content-type") !== "application/json") return empty(400);
      const candidate = await fixtureCandidate(request, qualification).catch(() => null);
      if (!candidate) return empty(400);
      const registry = await receipts(env);
      const id = await registry.issue();
      return Response.json({ id, model: qualification.model, provider: route.providerName, usage,
        choices: [{ message: { content: JSON.stringify(candidate) } }] }, { headers: noStore });
    }
    const id = new URL(request.url).searchParams.get("id");
    if (request.method !== "GET" || !id || !/^gen-[0-9a-f-]{36}-[1-9][0-9]{0,15}$/u.test(id)) return empty();
    endpoint.pathname = endpoint.pathname.replace(/\/chat\/completions$/u, "/generation");
    endpoint.searchParams.set("id", id);
    if (request.url !== endpoint.href) return empty();
    const registry = await receipts(env);
    if (!await registry.isIssued(id)) return empty();
    return Response.json({ data: { id, model: qualification.model, provider_name: route.providerName,
      provider_responses: [{ status: 200, endpoint_id: route.endpointId, provider_name: route.providerName }],
      native_tokens_prompt: usage.prompt_tokens, native_tokens_completion: usage.completion_tokens, total_cost: usage.cost } }, { headers: noStore });
  }
}

const syntheticWorker = { fetch: () => empty() };
export default syntheticWorker;
