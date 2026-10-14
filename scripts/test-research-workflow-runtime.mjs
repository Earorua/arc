import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, version as esbuildVersion } from "esbuild";
import { Miniflare } from "miniflare";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = resolve(root, "outputs/local-durable-executor-20260914");
const runtimeRoot = resolve(evidenceRoot, "task13-runtime");
const args = process.argv.slice(2);
const encoder = new TextEncoder();

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function safeName(value) {
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(value)) throw new Error("invalid report name");
  return value;
}

function assertInside(parent, child) {
  const prefix = `${resolve(parent)}${sep}`;
  if (!resolve(child).startsWith(prefix)) throw new Error("runtime path escaped evidence directory");
}

function portable(value) {
  return relative(root, resolve(value)).split(sep).join("/");
}

function packageVersion(name) {
  return require(`${name}/package.json`).version;
}

async function pollStatus(dispatch, kind, id, terminal, timeoutMs = 60_000) {
  const end = performance.now() + timeoutMs;
  let last;
  while (performance.now() < end) {
    const response = await dispatch("/probe/status", { kind, id });
    if (!response.ok) throw new Error(`status route failed ${response.status}`);
    const payload = await response.json();
    last = payload.status;
    if (terminal.includes(last?.status)) return last;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`workflow status timeout: ${String(last?.status)}`);
}

async function migration(name) {
  return (await readFile(resolve(root, "worker/research-executor/migrations", name), "utf8"))
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const reportName = safeName(option("--report-name", `task13-runtime-${Date.now()}`));
const reportFile = resolve(evidenceRoot, `${reportName}.json`);
const runDirectory = resolve(runtimeRoot, `${reportName}-${randomUUID()}`);
const bundlePath = resolve(runDirectory, "workflow-runtime.mjs");
const helperPath = resolve(runDirectory, "host-helper.mjs");
for (const path of [reportFile, runDirectory, bundlePath, helperPath]) assertInside(evidenceRoot, path);

let runtime;
let disposed = false;
let report;
const counters = { siteBegin: 0, siteAccepted: 0, siteComplete: 0, provider: 0, repair: 0, unexpected: 0 };

try {
  await mkdir(runDirectory, { recursive: true });
  await build({
    entryPoints: [resolve(root, "tests/fixtures/research/workflow-runtime-entry.ts")],
    outfile: bundlePath,
    bundle: true,
    platform: "neutral",
    format: "esm",
    target: "es2022",
    external: ["cloudflare:*"],
    sourcemap: false,
    logLevel: "silent",
  });
  await build({
    stdin: {
      contents: `
        export { signBridgeMessage, verifyBridgeMessage, BRIDGE_AUTH_PROTOCOL } from "./app/server/research/executor/auth.ts";
        export { encodeBridgeBeginReply, matchBridgeBeginReply } from "./app/server/research/executor/begin.ts";
        export { encodeBridgeDto, matchAcceptedProof, matchReceiptNotice } from "./app/server/research/executor/bridge-contract.ts";
        export { decodeBridgeJson } from "./app/server/research/executor/body.ts";
        export { parseBridgeJob, hashBridgeJob } from "./app/server/research/executor/job.ts";
        export { hashBridgeProviderReceipt } from "./app/server/research/executor/receipt.ts";
        export { D1BridgeJobStore } from "./worker/research-executor/d1-job-store.ts";
        export { ExecutorReceiptStore } from "./worker/research-executor/receipt-store.ts";
        export { PAID_STEP_CONFIG } from "./worker/research-executor/workflow-policy.ts";
        export { validResearchCandidate, validProviderCitationAnnotations } from "./tests/fixtures/research/valid-candidate.ts";
      `,
      resolveDir: root,
      sourcefile: "task13-runtime-host-helper.ts",
      loader: "ts",
    },
    outfile: helperPath,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: false,
    logLevel: "silent",
  });
  const helper = await import(`${pathToFileURL(helperPath).href}?run=${randomUUID()}`);
  const policy = helper.PAID_STEP_CONFIG;
  if (policy?.timeout !== "21 minutes" || policy?.retries?.limit !== 0 || policy?.retries?.delay !== "1 second") {
    throw new Error("production paid-step policy mismatch");
  }

  const now = Date.now();
  const job = helper.parseBridgeJob({
    protocol: helper.BRIDGE_AUTH_PROTOCOL,
    executor: "cloudflare-workflow-v1",
    jobId: randomUUID(),
    runId: `runtime-${randomUUID()}`,
    requestId: `runtime-request-${randomUUID()}`,
    inputFingerprint: `p2-${randomBytes(16).toString("hex")}`,
    configFingerprint: `p2-${randomBytes(16).toString("hex")}`,
    policyId: "kimi-low-output32k-v3",
    role: "Data Product Manager",
    locale: "en-US",
    createdAt: now,
    queueExpiresAt: now + 120_000,
  });
  const requestHash = await helper.hashBridgeJob(job);
  const siteOrigin = "https://site.runtime.invalid";
  const executorOrigin = "https://executor.runtime.invalid";
  const siteToExecutorSecret = randomBytes(32);
  const executorToSiteSecret = randomBytes(32);
  const executorToSiteKeyId = "runtime-executor-site";
  const requestNonces = new Set();

  async function verifiedSiteRequest(request, operation) {
    const body = new Uint8Array(await request.arrayBuffer());
    const path = `/api/internal/research-bridge/${operation}`;
    const context = { direction: "executor-to-site", kind: "request", method: "POST", path,
      audience: siteOrigin, jobId: job.jobId, status: null };
    await helper.verifyBridgeMessage({ context, body, headers: request.headers,
      keyId: executorToSiteKeyId, keyBytes: executorToSiteSecret, now: Date.now,
      nonces: { claim: async ({ scope, nonce }) => {
        const key = `${scope}:${nonce}`;
        if (requestNonces.has(key)) return false;
        requestNonces.add(key);
        return true;
      } },
    });
    return { body, path };
  }

  async function signedSiteResponse(path, status, value) {
    const body = helper.encodeBridgeDto(value, 16_384);
    const context = { direction: "executor-to-site", kind: "response", method: "POST", path,
      audience: siteOrigin, jobId: job.jobId, status };
    const headers = await helper.signBridgeMessage({ context, body,
      keyId: executorToSiteKeyId, keyBytes: executorToSiteSecret, now: Date.now });
    headers.set("content-type", "application/json");
    headers.set("cache-control", "no-store");
    return new Response(body, { status, headers });
  }

  async function outboundService(request) {
    const url = new URL(request.url);
    if (url.origin === siteOrigin && request.method === "POST") {
      if (url.pathname === "/api/internal/research-bridge/begin") {
        counters.siteBegin += 1;
        const { body, path } = await verifiedSiteRequest(request, "begin");
        const identity = helper.decodeBridgeJson(body);
        if (identity.jobId !== job.jobId || identity.requestHash !== requestHash) throw new Error("begin identity mismatch");
        const beganAt = Date.now();
        const grant = { protocol: helper.BRIDGE_AUTH_PROTOCOL, jobId: job.jobId, requestHash,
          beganAt, executionExpiresAt: beganAt + 1_260_000 };
        const reply = { grant, observedAt: beganAt, remainingMs: 1_260_000 };
        await helper.matchBridgeBeginReply(reply, job);
        return signedSiteResponse(path, 200, reply);
      }
      if (url.pathname === "/api/internal/research-bridge/accepted") {
        counters.siteAccepted += 1;
        const { body, path } = await verifiedSiteRequest(request, "accepted");
        const proof = await helper.matchAcceptedProof(helper.decodeBridgeJson(body), job);
        return signedSiteResponse(path, 200, proof);
      }
      if (url.pathname === "/api/internal/research-bridge/complete") {
        counters.siteComplete += 1;
        const { body, path } = await verifiedSiteRequest(request, "complete");
        const notice = await helper.matchReceiptNotice(helper.decodeBridgeJson(body), job);
        return signedSiteResponse(path, 200, { ...notice, accounting: "settled" });
      }
  }
  if (url.origin === "https://openrouter.ai" && url.pathname === "/api/v1/chat/completions"
      && request.method === "POST") {
      const providerRequest = await request.clone().json();
      const record = providerRequest !== null && typeof providerRequest === "object"
        && !Array.isArray(providerRequest) ? providerRequest : null;
      const messages = Array.isArray(record?.messages) ? record.messages : [];
      const userMessage = messages[1] !== null && typeof messages[1] === "object"
        && !Array.isArray(messages[1]) ? messages[1] : null;
      let userContent;
      try { userContent = typeof userMessage?.content === "string" ? JSON.parse(userMessage.content) : null; }
      catch { userContent = null; }
      const repair = record?.max_tokens === 8_000
        || (userContent !== null && typeof userContent === "object" && Object.hasOwn(userContent, "originalContent"));
      const research = record?.model === "moonshotai/kimi-k3" && record.max_tokens === 32_768
        && Array.isArray(record.tools) && record.tools.length === 1
        && userContent !== null && typeof userContent === "object" && !Object.hasOwn(userContent, "originalContent");
      if (repair) {
        counters.repair += 1;
        throw new Error("REPAIR_REQUEST_REJECTED");
      }
      if (!research) {
        counters.unexpected += 1;
        throw new Error("UNRECOGNIZED_PROVIDER_REQUEST");
      }
      counters.provider += 1;
      return Response.json({
        model: "moonshotai/kimi-k3",
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.000001,
          server_tool_use: { web_search_requests: 2 } },
        choices: [{ finish_reason: "stop", message: {
          content: JSON.stringify(helper.validResearchCandidate),
          annotations: helper.validProviderCitationAnnotations.map((citation) => ({
            type: citation.type,
            url_citation: { url: citation.url, title: citation.title },
          })),
        } }],
      });
    }
    counters.unexpected += 1;
    throw new Error("EXTERNAL_NETWORK_DISABLED");
  }

  runtime = new Miniflare({
    modules: true,
    scriptPath: bundlePath,
    compatibilityDate: "2026-05-15",
    cf: false,
    d1Databases: ["EXECUTOR_DB"],
    r2Buckets: ["EXECUTOR_RECEIPTS"],
    workflows: {
      RESEARCH_WORKFLOW: { name: "arc-research-local", className: "ResearchWorkflow" },
      ZERO_RETRY_PROBE: { name: "arc-zero-retry-probe", className: "ZeroRetryProbe" },
    },
    bindings: {
      BETTER_AUTH_URL: siteOrigin,
      ARC_AI_RESEARCH_EXECUTOR_URL: executorOrigin,
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: "runtime-site-executor",
      ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX: siteToExecutorSecret.toString("hex"),
      ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: executorToSiteKeyId,
      ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX: executorToSiteSecret.toString("hex"),
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false",
      OPENROUTER_API_KEY: `synthetic-${randomBytes(12).toString("hex")}`,
    },
    outboundService,
  });

  const db = await runtime.getD1Database("EXECUTOR_DB");
  const bucket = await runtime.getR2Bucket("EXECUTOR_RECEIPTS");
  for (const name of ["0000_research_bridge_nonces.sql", "0001_research_executor_jobs.sql",
    "0002_research_executor_results.sql", "0003_research_executor_maintenance.sql"]) {
    for (const statement of await migration(name)) await db.prepare(statement).run();
  }
  await db.prepare("CREATE TABLE test_counter(id INTEGER PRIMARY KEY, value INTEGER NOT NULL)").run();
  await db.prepare("INSERT INTO test_counter VALUES(1,0)").run();

  const dispatch = async (path, body) => runtime.dispatchFetch(`https://fixture.runtime.invalid${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

  const zeroId = randomUUID();
  const zeroCreate = await dispatch("/probe/create", { kind: "zero", id: zeroId });
  if (!zeroCreate.ok) throw new Error(`zero probe create failed ${zeroCreate.status}`);
  const zeroStatus = await pollStatus(dispatch, "zero", zeroId, ["errored"]);
  await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
  const zeroCounter = await db.prepare("SELECT value FROM test_counter WHERE id = 1").first("value");
  const zeroSameInstance = await dispatch("/probe/status", { kind: "zero", id: zeroId });
  const zeroSameStatus = (await zeroSameInstance.json()).status;
  const zeroCounterAfterGet = await db.prepare("SELECT value FROM test_counter WHERE id = 1").first("value");
  if (zeroStatus.status !== "errored" || zeroSameStatus.status !== "errored"
    || zeroCounter !== 1 || zeroCounterAfterGet !== 1) throw new Error("zero-retry probe assertion failed");

  const firstJobs = new helper.D1BridgeJobStore(db);
  await firstJobs.accept(job, now);
  await firstJobs.recordWorkflowAccepted(job, job.jobId, now + 1);
  const researchCreate = await dispatch("/probe/create", { kind: "research", id: job.jobId });
  if (!researchCreate.ok) throw new Error(`research workflow create failed ${researchCreate.status}`);
  const researchStatus = await pollStatus(dispatch, "research", job.jobId, ["complete", "errored"]);
  if (researchStatus.status !== "complete") throw new Error(`research workflow failed: ${JSON.stringify(researchStatus.error ?? null)}`);
  const outputBytes = encoder.encode(JSON.stringify(researchStatus.output ?? null)).byteLength;
  if (outputBytes < 1 || outputBytes > 4_096 || researchStatus.output?.state !== "recorded"
    || Object.keys(researchStatus.output).sort().join(",") !== "jobId,receiptHash,state"
    || researchStatus.output.jobId !== job.jobId || typeof researchStatus.output.receiptHash !== "string"
    || !/^[0-9a-f]{64}$/u.test(researchStatus.output.receiptHash)) {
    throw new Error(`research workflow output is not a tiny recorded reference: ${JSON.stringify(researchStatus.output ?? null)}`);
  }

  const jobRow = await db.prepare("SELECT dispatch_state, request_hash FROM research_executor_jobs WHERE job_id = ?1")
    .bind(job.jobId).first();
  const resultRows = await db.prepare("SELECT count(*) AS count, min(receipt_hash) AS receipt_hash FROM research_executor_results WHERE job_id = ?1")
    .bind(job.jobId).first();
  const receiptKey = `research-receipts/v1/${job.jobId}/${requestHash}.json`;
  const receiptObject = await bucket.get(receiptKey);
  if (jobRow?.dispatch_state !== "claimed" || jobRow?.request_hash !== requestHash
    || resultRows?.count !== 1 || typeof resultRows?.receipt_hash !== "string" || !receiptObject) {
    throw new Error("durable production workflow assertions failed");
  }
  const bodyReceiptHash = await helper.hashBridgeProviderReceipt(await receiptObject.json());
  if (researchStatus.output.receiptHash !== resultRows.receipt_hash || bodyReceiptHash !== resultRows.receipt_hash) {
    throw new Error("workflow/D1/R2 receipt hash mismatch");
  }
  if (counters.provider !== 1 || counters.repair !== 0 || counters.unexpected !== 0) {
    throw new Error(`first production execution request counts mismatch: ${JSON.stringify(counters)}`);
  }
  const countersBeforeRepeat = JSON.stringify(counters);

  const repeatCreate = await dispatch("/probe/create", { kind: "research", id: job.jobId });
  if (!repeatCreate.ok) throw new Error(`repeat create/get failed ${repeatCreate.status}`);
  const repeatPayload = await repeatCreate.json();
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  const repeatGet = await dispatch("/probe/status", { kind: "research", id: job.jobId });
  if (!repeatGet.ok) throw new Error("same-id get failed");
  const repeatGetPayload = await repeatGet.json();
  if (typeof repeatPayload.createAcknowledged !== "boolean" || repeatPayload.id !== job.jobId
    || repeatPayload.status?.status !== "complete" || repeatGetPayload.id !== job.jobId
    || repeatGetPayload.status?.status !== "complete"
    || JSON.stringify(repeatGetPayload.status.output) !== JSON.stringify(researchStatus.output)
    || JSON.stringify(counters) !== countersBeforeRepeat) {
    throw new Error("same-id create/get changed the workflow output or request effects");
  }

  const reopenedJobs = new helper.D1BridgeJobStore(db);
  const reopenedReceipts = new helper.ExecutorReceiptStore(db, bucket);
  const reopenedJob = await reopenedJobs.get(job.jobId);
  const reopenedReceipt = await reopenedReceipts.recover(job.jobId, Date.now());
  if (reopenedJob?.requestHash !== requestHash || reopenedJob.dispatchState !== "claimed"
    || reopenedReceipt?.metadata.receiptHash !== resultRows.receipt_hash
    || reopenedReceipt.bodyState !== "available" || reopenedReceipt.receipt === null) {
    throw new Error("reinstantiated durable readers did not recover original receipt");
  }
  if (reopenedReceipt.receipt.outcome.kind !== "response") {
    throw new Error("production provider response did not produce a successful durable receipt");
  }
  const deliveryRow = await db.prepare("SELECT receipt_hash, completed_at, stopped_code FROM research_executor_delivery WHERE job_id = ?1")
    .bind(job.jobId).first();
  if (deliveryRow?.receipt_hash !== resultRows.receipt_hash || deliveryRow.completed_at === null
    || deliveryRow.stopped_code !== null || reopenedReceipt.siteAcknowledgedAt === null) {
    throw new Error("native signed completion acknowledgement was not durably recorded");
  }
  if (counters.provider !== 1 || counters.repair !== 0 || counters.unexpected !== 0 || counters.siteBegin !== 1
    || counters.siteComplete !== 1) throw new Error(`runtime request counters mismatch: ${JSON.stringify(counters)}`);

  report = {
    status: "passed",
    scope: "local installed Workerd smoke with synthetic credentials and intercepted transport",
    versions: { esbuild: esbuildVersion, miniflare: packageVersion("miniflare"), workerd: packageVersion("workerd") },
    policy: { retryLimit: policy.retries.limit, retryDelay: policy.retries.delay, timeout: policy.timeout,
      elapsedClaimed: false },
    zeroRetry: { status: zeroStatus.status, counter: zeroCounterAfterGet, waitedAfterTerminalMs: 1_500,
      sameIdStatus: zeroSameStatus.status },
    production: { status: researchStatus.status, dispatchState: jobRow.dispatch_state, resultRows: resultRows.count,
      r2Body: true, receiptHashMatchedAcrossOutputD1R2: true, outputFields: Object.keys(researchStatus.output).sort(),
      outputJobIdMatched: true, receiptHashMatchedAfterReaderReinstantiation: true, outputBytes,
      sameIdCreateAcknowledged: repeatPayload.createAcknowledged, sameIdGetStatus: repeatGetPayload.status.status,
      sameIdNoFurtherEffects: true, receiptOutcome: reopenedReceipt.receipt.outcome.kind,
      completionAcknowledgement: { deliveryReceiptHashMatched: true, deliveryCompleted: true,
        deliveryStoppedCode: null, receiptSiteAcknowledged: true },
      acceptance: "host-seeded; Workflow smoke does not exercise bootstrap accepted callback",
      siteAccountingCoverage: false },
    counters,
    network: { cf: false, unknownTargetsRejected: true },
    syntheticCredentialsOnly: true,
    bundle: portable(bundlePath),
  };
} catch (error) {
  report = { status: "failed", reason: error instanceof Error ? error.message : String(error), counters,
    versions: { esbuild: esbuildVersion, miniflare: packageVersion("miniflare"), workerd: packageVersion("workerd") } };
  process.exitCode = 1;
} finally {
  if (runtime) await runtime.dispose();
  disposed = true;
}

report.disposed = disposed;
await mkdir(dirname(reportFile), { recursive: true });
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ ...report, report: portable(reportFile) }));
