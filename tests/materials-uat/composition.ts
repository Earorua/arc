import { createMaterialsD1, seedUser } from "../helpers/materials-d1";
import { memoryBucket } from "../helpers/document-bucket";
import { createDocumentRuntime } from "../../app/server/documents/runtime";
import { createDocumentRoute } from "../../app/server/http/document-route-factories";
import { documentEndpointContracts, type DocumentEndpoint } from "../../app/contracts/documents-api";
import { UnauthenticatedError } from "../../app/server/auth/session";
import corpus from "../fixtures/documents/quality-corpus.json";
import type { DocumentProviderInput } from "../../app/server/documents/provider";

/** Fixed page data only. Neither the production adapter nor a qualification request imports this module. */
function corpusPrefill(input: DocumentProviderInput) {
  const doc = corpus.documents.find(row => row.kind === input.kind && row.text === input.text);
  if (!doc) return null;
  function source(ref: { segmentId: string; quote: string }) {
    const original = doc!.segments.find(segment => segment.id === ref.segmentId)!;
    const start = original.start + original.text.indexOf(ref.quote);
    const segment = input.segments.find(row => row.start <= start && start + ref.quote.length <= row.end);
    if (!segment || input.text.slice(start, start + ref.quote.length) !== ref.quote) throw new Error("Invalid rehearsal annotation");
    return { segmentId: segment.id, quote: ref.quote };
  }
  return { schemaVersion: corpus.schemaVersion, items: doc.goldFields.map(field => ({
    id: field.id, kind: field.kind, text: field.acceptedForms[0], requirementLevel: field.requirementLevel,
    skillLabels: field.skillLabels, selfLevelHint: field.selfLevelHint, source: source(field.source),
  })), reviewPoints: doc.expectedReviewPoints.map(point => ({ code: point.code, source: source(point.source) })) };
}

/** Loopback-only acceptance fixture. No provider transport exists in this composition. */
export function createMaterialsUat(origin: string) {
  const db = createMaterialsD1(); const bucket = memoryBucket(); const { objects } = bucket;
  for (const owner of ["owner-a", "owner-b"]) {
    seedUser(db, owner);
    db.database.prepare("INSERT INTO career_goals(id,user_id,role_id,level,weekly_minutes,target_weeks,status,active_slot,created_at,updated_at) VALUES (?,?,'ai-native-full-stack-engineer','beginner',420,18,'active',1,0,0)").run(`goal-${owner}`, owner);
  }
  const routingPolicy = { policyVersion: "2026.11.1", providerOrder: ["offline-only"], allowFallback: false, dataPolicy: "zdr-only" };
  const environment = {
    DB: db as unknown as D1Database, DOCUMENT_ASSETS: bucket,
    ARC_DOCUMENTS_ENABLED: "true", ARC_DOCUMENT_PLANNING_ENABLED: "true", ARC_DOCUMENT_ANALYSIS_ENABLED: "true",
    ARC_DOCUMENT_PROVIDER: "离线固定候选（没有调用模型）", ARC_DOCUMENT_MODEL: "offline-fixture",
    ARC_DOCUMENT_PROVIDER_ENDPOINT: "https://no-network.invalid/chat/completions",
    ARC_DOCUMENT_PROVIDER_POLICY_ID: "offline-fixture", ARC_DOCUMENT_PRICE_VERSION: "2026.11.1",
    ARC_DOCUMENT_ROUTING_POLICY: JSON.stringify(routingPolicy), ARC_DOCUMENT_USER_DAILY_MICRO_USD: "100000",
    ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD: "1000000", ARC_DOCUMENT_MAX_JOB_MICRO_USD: "10000",
    ARC_DOCUMENT_MAX_INPUT_TOKENS: "16000", ARC_DOCUMENT_MAX_OUTPUT_TOKENS: "4096", ARC_DOCUMENT_HTTP_TIMEOUT_MS: "10000",
    ARC_DOCUMENT_BRIDGE_SECRET: "offline-materials-uat-bridge-key-32-characters",
    ARC_DOCUMENT_PROVIDER_QUALIFICATION: JSON.stringify({ qualified: true, endpoint: "https://no-network.invalid/chat/completions", model: "offline-fixture",
      providerPolicyId: "offline-fixture", priceVersion: "2026.11.1", routingPolicy, receiptRoute: { providerName: "Fixture Provider", endpointId: "fixture-endpoint" }, inputMicroUsdPerMillionTokens: 100000,
      outputMicroUsdPerMillionTokens: 200000, inputTokenBound: "utf8-bytes-plus-4096" }),
  };
  let mode: "success" | "failure" | "unknown" | "disabled" = "success"; let sends = 0; let closed = false;
  const pending = new Set<Promise<void>>();
  const runtime = createDocumentRuntime({ ...environment, DOCUMENT_EXECUTOR: { fetch: async request => {
    const body = await request.json() as { jobId: string };
    if (new URL(request.url).pathname.endsWith("/cancel")) return Response.json({ writersTerminated: true, resultsAbsent: true });
    const work = (async () => {
      await new Promise(resolve => setTimeout(resolve, 50)); if (closed) return;
      if (!(await runtime.jobs.claim(body.jobId)).claimed) return;
      const input = await runtime.jobs.input(body.jobId);
      const scope = input.execution?.sendScope;
      if (!scope || !(await runtime.jobs.permit({ jobId: body.jobId, textVersionId: input.textVersionId, ...scope,
        configurationDigest: input.execution!.configurationDigest })).permitted) {
        await runtime.jobs.result(body.jobId, `fixture-${body.jobId}`, { kind: "not-sent", code: "aborted-before-send" });
        return;
      }
      sends++;
      if (mode === "unknown") { await runtime.jobs.result(body.jobId, `fixture-${body.jobId}`, { kind: "unknown", code: "connection-lost" }); return; }
      const segment = input.segments.find(item => item.end > item.start)!;
      const quote = input.text.slice(segment.start, Math.min(segment.end, segment.start + 900));
      const candidate = mode === "failure" ? { invalid: true } : corpusPrefill(input) ?? { schemaVersion: "2026.11.1", items: [{
        id: "fixture-fact", kind: input.kind === "jd" ? "requirement" : "experience",
        text: input.kind === "jd" ? "必须掌握 JavaScript" : "按指导完成 JavaScript 项目",
        requirementLevel: input.kind === "jd" ? "must" : null, skillLabels: ["JavaScript"],
        selfLevelHint: input.kind === "resume" ? "guided" : null, source: { segmentId: segment.id, quote },
      }], reviewPoints: [] };
      await runtime.jobs.result(body.jobId, `fixture-${body.jobId}`, { kind: "received", candidate, inputTokens: 50, outputTokens: 20, actualMicroUsd: 1, receiptId: `offline-${body.jobId}` });
    })().catch(() => undefined);
    pending.add(work); void work.finally(() => pending.delete(work));
    return Response.json({ accepted: true });
  } } });
  return {
    async fetch(request: Request, ownerId: string | null) {
      const contracts = Object.entries(documentEndpointContracts).sort(([, left], [, right]) => Number(left.path.includes("[")) - Number(right.path.includes("[")));
      for (const [name, contract] of contracts) {
        if (request.method !== contract.method) continue;
        const keys: string[] = [];
        const pattern = contract.path.replace(/\[([^\]]+)\]/gu, (_full, key: string) => { keys.push(key); return "([^/]+)"; });
        const match = new RegExp(`^${pattern}$`, "u").exec(new URL(request.url).pathname); if (!match) continue;
        const params = Object.fromEntries(keys.map((key, index) => [key, match[index + 1]!]));
        if (name === "readDocumentCapabilities" && mode === "disabled") return Response.json({ documentsEnabled: true, analysisEnabled: false, planningEnabled: true, hasDocuments: true, providerLabel: null, providerPolicyId: null, policyVersion: null, reason: "disabled" });
        return createDocumentRoute(name as DocumentEndpoint, { requireUser: async () => { if (!ownerId) throw new UnauthenticatedError(); return { id: ownerId }; },
          configuredOrigin: () => origin, createService: () => runtime, rateLimiter: { reserve: async () => ({ allowed: true }) } })(request, { params });
      }
      return new Response(null, { status: 404 });
    },
    setMode(value: typeof mode) { mode = value; },
    async maintain() { await runtime.maintenance(); },
    stats() { return { fakeAnalyses: sends, objects: objects.size, jobs: db.database.prepare("SELECT state,count(*) total FROM document_jobs GROUP BY state").all() }; },
    async close() { closed = true; await Promise.allSettled([...pending]); db.close(); },
  };
}
