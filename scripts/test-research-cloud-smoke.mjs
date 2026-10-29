import { createHash, randomUUID } from "node:crypto";
import { constants, fstatSync } from "node:fs";
import { mkdir, writeFile, realpath, open, rename, unlink } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { buildSmoke } from "./build-research-executor-smoke.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(root, "outputs/local-durable-executor-20260914/task15-smoke");
const hash = value => createHash("sha256").update(value).digest("hex");
const hex = /^[0-9a-f]{64}$/u;
const safeName = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const scenarioJobs = { long: "", "after-r2": "", "after-d1": "" };
const safeFailureCodes = new Set(["arguments", "report-name", "scenario", "file-limit", "inventory-path", "inventory-unavailable",
  "inventory-invalid", "inventory-origin", "artifact-ineligible", "artifact-alias-proof", "inventory-fields", "resource-identity",
  "resource-isolation", "deployment-artifact", "artifact-digest", "source-inventory", "source-digest", "credential-channel",
  "credential-format", "nonce-store", "nonce-capacity", "response-shape", "response-identity", "response-acceptance",
  "response-authentication", "approval-invalid"]);
const reject = code => { throw Object.assign(Error("Smoke driver refused"), { safeCode: code }); };
const exactKeys = (value, keys) => !!value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const inside = (parent, child) => { const path = relative(parent, child); return !!path && !path.startsWith("..") && !path.includes(`:${sep}`) && !resolve(parent, path).startsWith(`${parent}${sep}..`); };
async function boundedFile(path, limit = 1_000_000) {
  const file = await open(path, "r");
  try { if ((await file.stat()).size > limit) reject("file-limit"); return await file.readFile(); }
  finally { await file.close(); }
}
function parseArgs(args) {
  if (!Array.isArray(args) || args.some(value => typeof value !== "string" || hex.test(value))) reject("arguments");
  const [mode, ...rest] = args;
  if (!["local", "start", "status", "replay"].includes(mode)) reject("arguments");
  const keys = mode === "local" ? ["--report-name"] : ["--inventory", "--artifact-report", "--scenario", "--report-name",
    ...(mode === "replay" ? ["--approval"] : [])];
  if (rest.length !== keys.length * 2) reject("arguments");
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!keys.includes(rest[i]) || Object.hasOwn(options, rest[i])) reject("arguments");
    options[rest[i]] = rest[i + 1];
  }
  if (!safeName.test(options["--report-name"])) reject("report-name");
  if (mode !== "local" && !Object.hasOwn(scenarioJobs, options["--scenario"])) reject("scenario");
  return { mode, reportName: options["--report-name"], scenarioId: options["--scenario"], inventory: options["--inventory"], artifactReport: options["--artifact-report"], approval: options["--approval"] };
}
async function cloudInventory(options) {
  let inventory, inventoryBytes, report, reportBytes, reportPath;
  try {
    const inventoryPath = await realpath(resolve(root, options.inventory));
    reportPath = await realpath(resolve(root, options.artifactReport));
    if (!inside(evidence, inventoryPath) || !inside(resolve(evidence, "build/cloud"), reportPath)) reject("inventory-path");
    inventoryBytes = await boundedFile(inventoryPath, 32_768);
    inventory = JSON.parse(inventoryBytes.toString());
    reportBytes = await boundedFile(reportPath); report = JSON.parse(reportBytes.toString());
  } catch (error) { reject(error.safeCode ?? "inventory-unavailable"); }
  if (!exactKeys(inventory, ["schemaVersion", "verified", "isolated", "verifiedAt", "accountId", "controlOrigin", "controlKeyId", "artifactReportSha256", "resources"])
    || inventory.schemaVersion !== "arc-smoke-isolation-v1" || inventory.verified !== true || inventory.isolated !== true
    || !Number.isSafeInteger(inventory.verifiedAt) || inventory.verifiedAt <= 0
    || !/^[0-9a-f]{32}$/u.test(inventory.accountId) || !/^[A-Za-z0-9_-]{1,32}$/u.test(inventory.controlKeyId)) reject("inventory-invalid");
  try { const url = new URL(inventory.controlOrigin);
    if (url.protocol !== "https:" || url.origin !== inventory.controlOrigin || url.username || url.password) reject("inventory-origin");
  } catch { reject("inventory-origin"); }
  if (inventory.artifactReportSha256 !== hash(reportBytes) || report.status !== "passed" || report.profile !== "cloud" || report.deployable !== true
    || reportPath !== resolve(root, report.report) || report.cloudElapsedProved !== false
    || report.timing?.long?.headersMs !== 1_140_000 || report.timing?.long?.bodyMs !== 30_000
    || report.policy?.timeout !== "21 minutes" || report.policy?.retries !== 0 || report.policy?.providerDeadlineMs !== 1_200_000
    || report.policy?.executionLeaseMs !== 1_260_000) reject("artifact-ineligible");
  const runtime = "worker/research-executor/runtime.ts", wrapper = "worker/research-executor-smoke/runtime.ts";
  const expectedEdges = [
    ["runtime-rewrite", "worker/research-executor/index.ts", "./runtime", runtime, wrapper],
    ["runtime-rewrite", "worker/research-executor/workflow.ts", "./runtime", runtime, wrapper],
    ["runtime-bypass", wrapper, "../research-executor/runtime", runtime, runtime],
  ].map(edge => JSON.stringify(edge)).sort();
  if (!Array.isArray(report.aliasEdges) || report.aliasEdges.some(edge => !edge || Object.keys(edge).length !== 5)
    || JSON.stringify(report.aliasEdges.map(edge => JSON.stringify([edge.kind, edge.importer, edge.specifier, edge.original, edge.resolved])).sort())
      !== JSON.stringify(expectedEdges)) reject("artifact-alias-proof");
  const resources = inventory.resources;
  const resourceFields = { siteWorker: ["id", "name", "revision", "artifactSha256", "entry", "peerId"],
    executorWorker: ["id", "name", "revision", "artifactSha256", "entry", "peerId", "public"],
    siteD1: ["id", "name"], executorD1: ["id", "name"], receipts: ["id", "name", "private"], workflow: ["id", "name", "workerId"] };
  if (!exactKeys(resources, Object.keys(resourceFields)) || Object.entries(resourceFields).some(([key, fields]) => !exactKeys(resources[key], fields))) reject("inventory-fields");
  const names = [], ids = [];
  for (const key of ["siteWorker", "executorWorker", "siteD1", "executorD1", "receipts", "workflow"]) {
    const resource = resources?.[key];
    if (!resource || !/^[a-z0-9][a-z0-9-]{1,62}$/u.test(resource.name)
      || typeof resource.id !== "string" || !/^[A-Za-z0-9_-]{3,80}$/u.test(resource.id)) reject("resource-identity");
    names.push(resource.name); ids.push(resource.id);
  }
  if (new Set(names).size !== names.length || new Set(ids).size !== ids.length || resources.receipts.private !== true
    || resources.executorWorker.public !== false || resources.workflow.workerId !== resources.executorWorker.id
    || resources.siteWorker.peerId !== resources.executorWorker.id || resources.executorWorker.peerId !== resources.siteWorker.id) reject("resource-isolation");
  for (const key of ["site", "executor"]) {
    const resource = resources[`${key}Worker`], artifact = report[key];
    if (!artifact || !hex.test(artifact.sha256) || resource.artifactSha256 !== artifact.sha256 || resource.entry !== artifact.output
      || typeof resource.revision !== "string" || !/^[A-Za-z0-9_-]{3,100}$/u.test(resource.revision)
      || !artifact.output.endsWith(".js") || !Array.isArray(artifact.inputs)
      || artifact.inputs.some(path => path.includes("cloud-smoke-local") || path.startsWith("scripts/"))) reject("deployment-artifact");
    const output = await realpath(resolve(root, artifact.output));
    if (!inside(dirname(reportPath), output) || hash(await boundedFile(output, 5_000_000)) !== artifact.sha256) reject("artifact-digest");
  }
  if (!report.inputHashes || !Object.keys(report.inputHashes).length) reject("source-inventory");
  for (const [path, digest] of Object.entries(report.inputHashes)) {
    const actual = await realpath(resolve(root, path));
    if (!inside(root, actual) || !hex.test(digest) || hash(await boundedFile(actual, 5_000_000)) !== digest) reject("source-digest");
  }
  return { inventory, inventoryDigest: hash(inventoryBytes), report, reportDigest: hash(reportBytes) };
}

async function hostHelper(directory) {
  const outfile = resolve(directory, "host-helper.mjs");
  await build({ absWorkingDir: root, entryPoints: [resolve(root, "tests/helpers/research-cloud-smoke-fixture.ts")],
    outfile, bundle: true, platform: "node", format: "esm", target: "node24", packages: "external", logLevel: "silent" });
  return import(pathToFileURL(outfile).href);
}

async function credential(input) {
  if (input) {
    if (input.isTTY !== false || typeof input.read !== "function") reject("credential-channel");
    const bytes = await input.read();
    let decoded;
    try {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > 66) reject("credential-format");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!/^[0-9a-f]{64}(?:\r?\n)?$/u.test(text)) reject("credential-format");
      decoded = Buffer.from(text.trim(), "hex");
      return Uint8Array.from(decoded);
    } finally { if (bytes instanceof Uint8Array) bytes.fill(0); decoded?.fill(0); }
  }
  const stdin = fstatSync(0);
  const windowsPipe = process.platform === "win32" && (stdin.mode & constants.S_IFMT) === constants.S_IFIFO;
  if (process.stdin.isTTY || !(stdin.isFIFO() || stdin.isFile() || windowsPipe)) reject("credential-channel");
  const bytes = await new Promise((yes, no) => {
    const chunks = []; let size = 0, settled = false;
    const finish = (error) => {
      if (settled) return; settled = true;
      clearTimeout(timer); process.stdin.off("data", data); process.stdin.off("end", end);
      process.stdin.off("error", failure); process.stdin.pause();
      try { if (error) no(error); else yes(Buffer.concat(chunks)); }
      catch { no(Object.assign(Error(), { safeCode: "credential-format" })); }
      finally { for (const chunk of chunks) chunk.fill(0); chunks.length = 0; }
    };
    const failure = () => finish(Object.assign(Error(), { safeCode: "credential-channel" }));
    const data = chunk => { chunks.push(chunk); size += chunk.length; if (size > 66) failure(); };
    const end = () => finish();
    const timer = setTimeout(failure, 1_000);
    process.stdin.on("data", data); process.stdin.once("end", end); process.stdin.once("error", failure); process.stdin.resume();
  });
  return credential({ isTTY: false, read: async () => bytes });
}

/** A shared bounded nonce file outlives individual CLI invocations; contention fails closed. */
function responseNonces(inventory, record) {
  const directory = resolve(evidence, "t15p4-response-nonces");
  const key = hash(`${inventory.accountId}|${inventory.controlOrigin}|${inventory.controlKeyId}`);
  const target = resolve(directory, `${key}.json`), lockPath = resolve(directory, `${key}.lock`);
  const errorCodes = new Set(["EPERM", "EACCES", "EBUSY", "EEXIST", "ENOENT", "ENOSPC", "EIO", "EMFILE", "ENFILE", "EROFS"]);
  return { claim: async ({ scope, nonce, expiresAt, now }, check) => {
    // A failed/crashed invocation must not poison later attempts with its temporary file.
    const temporary = resolve(directory, `${key}.${process.pid}.${randomUUID()}.tmp`);
    let lock, ownsTemporary = false, operation = "mkdir", attempts = 0;
    const failure = (error, stage = operation) => record({ operation: stage,
      code: errorCodes.has(error?.code) ? error.code : "UNKNOWN", attempts, recovered: false });
    try {
      check();
      await mkdir(directory, { recursive: true });
      operation = "lock";
      lock = await open(lockPath, "wx");
      operation = "read";
      let entries = [];
      try { entries = JSON.parse((await boundedFile(target, 65_536)).toString()); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (!Array.isArray(entries) || entries.length > 512 || entries.some(item => !item || !hex.test(item.scope)
        || !/^[0-9a-f]{32}$/u.test(item.nonce) || !Number.isSafeInteger(item.expiresAt))) reject("nonce-store");
      entries = entries.filter(item => item.expiresAt >= now);
      const scopeHash = hash(scope);
      if (entries.some(item => item.scope === scopeHash && item.nonce === nonce)) return false;
      if (entries.length >= 512) reject("nonce-capacity");
      entries.push({ scope: scopeHash, nonce, expiresAt });
      check();
      operation = "write";
      const file = await open(temporary, "wx");
      ownsTemporary = true;
      try { await file.writeFile(JSON.stringify(entries)); } finally { await file.close(); }
      operation = "replace";
      for (;;) {
        check();
        attempts++;
        try { await rename(temporary, target); break; }
        catch (error) {
          // Windows can briefly deny replacement even after our own handles are closed.
          // Retain the lock and the complete temporary file; never delete/truncate the ledger.
          if (process.platform !== "win32" || error.code !== "EPERM" || attempts >= 5) throw error;
          await new Promise(resolve => setTimeout(resolve, 20 * 2 ** (attempts - 1)));
        }
      }
      if (attempts > 1) record({ operation, code: "EPERM", attempts, recovered: true });
      return true;
    } catch (error) { failure(error); throw error; }
    finally {
      try {
        if (ownsTemporary) await unlink(temporary).catch(error => {
          if (error.code !== "ENOENT") { failure(error, "cleanup"); throw error; }
        });
      } finally {
        if (lock) {
          try { await lock.close(); }
          finally { await unlink(lockPath).catch(error => { failure(error, "unlock"); throw error; }); }
        }
      }
    }
  } };
}

function safeStatus(body, scenarioId, scenarios) {
  const scenario = scenarios.find(value => value.id === scenarioId);
  if (!body || typeof body !== "object" || body.scenarioId !== scenarioId || typeof body.backgroundAccepted !== "boolean"
    || !["initializing", "not-started", "queued", "researching", "validating", "ready", "failed", "needs-review"].includes(body.state)) reject("response-shape");
  if (body.jobId !== undefined && body.jobId !== scenario.jobId) reject("response-identity");
  if (body.backgroundAccepted && (body.jobId !== scenario.jobId || !hex.test(body.requestHash) || !Number.isSafeInteger(body.acceptedAt))) reject("response-acceptance");
  return { scenarioId, state: body.state, backgroundAccepted: body.backgroundAccepted,
    ...(body.jobId ? { jobId: body.jobId } : {}), ...(hex.test(body.requestHash) ? { requestHash: body.requestHash } : {}),
    ...(Number.isSafeInteger(body.acceptedAt) ? { acceptedAt: body.acceptedAt } : {}), settled: body.settled === true };
}

async function control(options, configuration, helper, keyBytes, transport, recordNonceStorage) {
  const { inventory } = configuration;
  const end = performance.now() + (options.mode === "start" ? 10_000 : 5_000);
  const nonces = responseNonces(inventory, recordNonceStorage);
  const request = async operation => {
    const context = { direction: "executor-to-site", kind: "request", method: "POST", path: `/_smoke/${operation}`,
      audience: inventory.controlOrigin, jobId: "collection", status: null };
    const body = new TextEncoder().encode(JSON.stringify({ scenarioId: options.scenarioId }));
    const headers = await helper.signBridgeMessage({ context, body, keyId: inventory.controlKeyId, keyBytes, now: Date.now });
    const controller = new AbortController();
    const check = () => { if (controller.signal.aborted || performance.now() >= end) throw Error("Control deadline"); };
    const remaining = Math.max(1, Math.floor(end - performance.now()));
    let timer;
    try {
      const response = await Promise.race([transport(new Request(new URL(context.path, context.audience), { method: "POST", headers, body, redirect: "error", signal: controller.signal })),
        new Promise((_, no) => { timer = setTimeout(() => { controller.abort(); no(Object.assign(Error(), { pending: true })); }, remaining); })]);
      const bytes = await helper.readBridgeBody(response, { maxBytes: 4096, timeoutMs: Math.max(1, Math.min(4500, Math.floor(end - performance.now()))), signal: controller.signal });
      try { await helper.verifyBridgeMessage({ context: { ...context, kind: "response", status: response.status }, body: bytes,
        headers: response.headers, keyId: inventory.controlKeyId, keyBytes, now: Date.now,
        nonces: { claim: async claim => { check(); const accepted = await nonces.claim(claim, check); check(); return accepted; } } }); }
      catch { reject("response-authentication"); }
      if (response.status >= 500) return { pending: true };
      if (response.status !== 200) return { rejected: true, httpStatus: response.status };
      let parsed; try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { reject("response-shape"); }
      return { view: safeStatus(parsed, options.scenarioId, helper.SCENARIOS) };
    } finally { clearTimeout(timer); controller.abort(); }
  };
  for (let attempt = 0; attempt < (options.mode === "start" ? 3 : 1) && performance.now() < end; attempt++) {
    let result;
    try { result = await request(attempt === 0 ? options.mode : "status"); }
    catch (error) { if (error.safeCode) throw error; result = { pending: true }; }
    if (result.rejected) return { status: "rejected", accepted: false, scenarioId: options.scenarioId, httpStatus: result.httpStatus };
    if (result.view && (options.mode === "status" || result.view.backgroundAccepted)) return {
      status: result.view.backgroundAccepted ? "accepted" : "pending", accepted: result.view.backgroundAccepted, view: result.view };
  }
  return { status: "pending", accepted: false, scenarioId: options.scenarioId, reason: "acceptance-unknown" };
}

async function replayApproval(options, configuration, helper) {
  try {
    const path = await realpath(resolve(root, options.approval));
    if (!inside(evidence, path)) reject("approval-invalid");
    const bytes = await boundedFile(path, 4096);
    const roster = helper.parseSmokeReplayRoster(new TextDecoder("utf-8", { fatal: true }).decode(bytes), configuration.inventoryDigest);
    const approved = roster.scenarios.find(value => value.scenarioId === options.scenarioId);
    if (!approved) reject("approval-invalid");
    return { approved, inventorySha256: configuration.inventoryDigest,
      nativeEvidenceSha256: roster.nativeEvidenceSha256, approvalFileSha256: hash(bytes) };
  } catch { reject("approval-invalid"); }
}

function matchReplayApproval(reply, approved, previousQueueExpiry) {
  if ("identity" in reply && Object.entries(reply.identity).some(([key, value]) => value !== approved[key])) return false;
  if ("original" in reply) {
    for (const key of ["acceptedAt", "beganAt", "executionExpiresAt"]) if (reply.original[key] !== approved[key]) return false;
    if (previousQueueExpiry !== undefined && reply.original.queueExpiresAt !== previousQueueExpiry) return false;
    if (reply.receipt.receiptHash !== approved.receiptHash || reply.receipt.metadataSha256 !== approved.receiptMetadataSha256) return false;
  }
  return true;
}

/** One monotonic bound covers signing, transport, body, authentication and nonce persistence. */
async function requestReplayStep(options, inventory, approval, helper, keyBytes, transport, nonces, step, queueExpiry) {
  const controller = new AbortController(), end = performance.now() + 5000;
  let timer;
  const check = () => { if (controller.signal.aborted || performance.now() >= end) throw Error("Replay deadline"); };
  const operation = async () => {
    const context = { direction: "executor-to-site", kind: "request", method: "POST", path: "/_smoke/replay",
      audience: inventory.controlOrigin, jobId: "collection", status: null };
    const request = helper.parseSmokeReplayRequest({ scenarioId: options.scenarioId, step });
    const body = new TextEncoder().encode(JSON.stringify(request));
    const headers = await helper.signBridgeMessage({ context, body, keyId: inventory.controlKeyId, keyBytes, now: Date.now });
    check();
    const response = await transport(new Request(new URL(context.path, context.audience), {
      method: "POST", headers, body, redirect: "error", signal: controller.signal }));
    check();
    const bytes = await helper.readBridgeBody(response, { maxBytes: 4096,
      timeoutMs: Math.max(1, Math.min(4500, Math.floor(end - performance.now()))), signal: controller.signal });
    check();
    await helper.verifyBridgeMessage({ context: { ...context, kind: "response", status: response.status }, body: bytes,
      headers: response.headers, keyId: inventory.controlKeyId, keyBytes, now: Date.now,
      nonces: { claim: async claim => { check(); const accepted = await nonces.claim(claim, check); check(); return accepted; } } });
    check();
    if ([400, 401, 409].includes(response.status)) return { result: "rejected", httpStatus: response.status };
    if (response.status !== 200) return { result: "unknown", code: "response-unavailable" };
    let safeReply;
    try { safeReply = helper.parseSmokeReplayReply(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
    catch { return { result: "unknown", code: "response-invalid" }; }
    if (safeReply.scenarioId !== options.scenarioId || safeReply.step !== step
      || !matchReplayApproval(safeReply, approval.approved, queueExpiry)) return { result: "unknown", code: "response-invalid" };
    if (safeReply.completed !== true) return { result: "failed", code: "isolation-failed" };
    check();
    return { result: "completed", reply: safeReply };
  };
  try {
    return await Promise.race([operation(), new Promise((_, no) => {
      timer = setTimeout(() => { controller.abort(); no(Error("Replay deadline")); }, 5000);
    })]);
  } catch { return { result: "unknown", code: "response-unavailable" }; }
  finally { clearTimeout(timer); controller.abort(); }
}

async function replayControl(options, configuration, approval, helper, keyBytes, transport, directory, progress, recordNonceStorage) {
  const nonces = responseNonces(configuration.inventory, recordNonceStorage);
  let queueExpiry;
  for (const step of helper.SMOKE_REPLAY_STEPS) {
    const startedAt = Date.now();
    const result = await requestReplayStep(options, configuration.inventory, approval, helper, keyBytes, transport, nonces, step, queueExpiry);
    const evidence = { step, startedAt, finishedAt: Date.now(), ...result };
    progress.steps.push(evidence);
    if (result.result !== "completed") return { ...progress, status: result.result };
    progress.lastCompletedStep = step;
    if ("original" in result.reply) queueExpiry = result.reply.original.queueExpiresAt;
    // The next request is forbidden until its predecessor is durably recorded in this owned run.
    await writeFile(resolve(directory, `step-${progress.steps.length}.json`), JSON.stringify(evidence), { flag: "wx" });
  }
  return { ...progress, status: "passed" };
}

/** Bounded operator entry; transport/input are explicit synthetic test capabilities. */
export async function runSmokeDriver(args, capabilities = {}) {
  let directory, replayProgress;
  const nonceStorage = [];
  const recordNonceStorage = entry => { if (nonceStorage.length < 16) nonceStorage.push(entry); };
  let keyBytes = null;
  let ownsDirectory = false;
  try {
    const options = parseArgs(args);
    if (options.mode === "replay") replayProgress = { accepted: false, scenarioId: options.scenarioId,
      lastCompletedStep: null, steps: [], cloudElapsedProved: false };
    const configuration = options.mode === "local" ? null : await cloudInventory(options);
    directory = resolve(evidence, options.reportName);
    await mkdir(directory);
    ownsDirectory = true;
    const helper = await hostHelper(directory);
    const approval = options.mode === "replay" ? await replayApproval(options, configuration, helper) : null;
    if (approval) Object.assign(replayProgress, { inventorySha256: approval.inventorySha256,
      nativeEvidenceSha256: approval.nativeEvidenceSha256, approvalFileSha256: approval.approvalFileSha256 });
    if (configuration) keyBytes = await credential(capabilities.input);
    let result;
    if (options.mode === "local") {
      const artifact = await buildSmoke({ profile: "local", reportName: options.reportName });
      result = { ...await helper.runNativeSmokeSuite({ executor: artifact.executor.output, site: artifact.site.output }),
        artifact: { report: artifact.report, reportSha256: hash(await boundedFile(resolve(root, artifact.report))),
          executorSha256: artifact.executor.sha256, siteSha256: artifact.site.sha256 }, ownedStorageRemoved: true };
    } else if (options.mode === "replay") result = await replayControl(options, configuration, approval, helper, keyBytes,
      capabilities.transport ?? fetch, directory, replayProgress, recordNonceStorage);
    else result = await control(options, configuration, helper, keyBytes, capabilities.transport ?? fetch, recordNonceStorage);
    const report = { ...result, mode: options.mode, cloudElapsedProved: false,
      ...(nonceStorage.length ? { nonceStorage } : {}),
      hostHelperSha256: hash(await boundedFile(resolve(directory, "host-helper.mjs"), 5_000_000)),
      ...(configuration ? { accountId: configuration.inventory.accountId, resources: configuration.inventory.resources,
        artifactReportSha256: configuration.reportDigest } : {}), report: relative(root, resolve(directory, "report.json")).split(sep).join("/") };
    await writeFile(resolve(directory, "report.json"), JSON.stringify(report, null, 2), { flag: "wx" }); return report;
  } catch (error) {
    const report = { ...replayProgress, status: "refused", code: safeFailureCodes.has(error?.safeCode) ? error.safeCode : "operation-unavailable",
      accepted: false, cloudElapsedProved: false, ...(nonceStorage.length ? { nonceStorage } : {}) };
    if (ownsDirectory) await writeFile(resolve(directory, "failure.json"), JSON.stringify(report), { flag: "wx" }).catch(() => undefined);
    return report;
  } finally { keyBytes?.fill(0); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runSmokeDriver(process.argv.slice(2));
  console.log(JSON.stringify(result));
  if (result.status !== "passed" && result.status !== "accepted") process.exitCode = 1;
}
