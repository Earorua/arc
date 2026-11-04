import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { segmentDocumentText } from "../../../app/server/documents/text.ts";
import { createQualificationJournal } from "../../../scripts/materials-qualification-journal.ts";
import { readDocumentHttpJson } from "../../../worker/document-executor/generation-receipt.ts";
import { calculateDocumentReservation, HttpDocumentAnalysisProvider } from "../../../worker/document-executor/provider-http.ts";
import { canReplayWirePrice, observeProbeCharge, projectProbeMetadata } from "./capture-probe-metadata.mjs";
import { replayRedactedPair } from "./replay-redacted-pair.mjs";

const sample = "SYNTHETIC: I practiced SQL joins using a toy database.";
const grantRunId = "kimi-standard-receipt-v1";
// All checkouts under this OS account contend for this one directory. The launch environment cannot select it.
const liveRoot = join(realpathSync(userInfo().homedir), ".arc-materials", "gate-1b", "materials-b2", "receipt-probe");
const reviewUrl = new URL("./b2-settings.review.json", import.meta.url);
const expectedDraft = "d65903a51fd52ce85bb4e54bc769d324343a3f908c2c38699373f02297aa1834";
const expectedBody = "33277377b7611f2ad2b944ef7180331acd258f0fdf3df44aff684dddffd2ce20";
const frozenFiles = {
  "worker/document-executor/provider-http.ts": "21cd2445be36fb02d6a7182e4fb34a77f9cc25b756fa59f82e6d18acfcd37b80",
  "worker/document-executor/generation-receipt.ts": "d0cd6b0d527c8f449738a7bb492354869bb53fce12800ef84426401b8066af18",
  "scripts/materials-qualification-journal.ts": "94ada7ef24256d820282910492e80881e32abbe617eb695d224bc20816d95026",
  "app/server/documents/text.ts": "cb38268b579d9cfdb705abced544a03ff04ae966bc5be1ba07545381ffb8df04",
  "app/server/documents/policy.ts": "81b2854442bc9a2eecb4cca843d6043edec8829d799d6bf6d6803785d8d4087b",
  "app/contracts/documents.ts": "2b8021bddc755ec90e72d899ee49fe80ef1332a1dc728e1b9b73e69e6f883023",
  "app/server/documents/provider-receipt.ts": "7c243160712eef2e6b16380a81f82abd986de6ec115e5900a69f1d9d58099bc6",
  "app/server/documents/provider.ts": "c87841b0658e5fddac69c3e617485bf37aa7697bad494502564b2a5fa87fd209",
};
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const iso = time => new Date(time).toISOString();
function toMicroUsd(usd) {
  if (usd == null) return null;
  const value = Math.round(usd * 1_000_000);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function reviewedScope() {
  const manifest = {};
  for (const [path, digest] of Object.entries(frozenFiles)) {
    const bytes = readFileSync(new URL("../../../"+path, import.meta.url));
    if (sha(bytes) !== digest) throw new Error("Frozen candidate differs");
    manifest[path] = digest;
  }
  for (const path of ["single-receipt-probe.mjs", "capture-probe-metadata.mjs", "replay-redacted-pair.mjs", "invoke-single-receipt.ps1"]) {
    manifest[path] = sha(readFileSync(new URL(path, import.meta.url)));
  }
  return {
    purpose: "single-synthetic-kimi-receipt", workspace: "materials-b2", runId: grantRunId,
    ledgerBindingSha256: sha(JSON.stringify([process.platform, hostname(), liveRoot])),
    programSha256: sha(JSON.stringify(manifest)), settingsSha256: expectedDraft, requestSha256: expectedBody,
    textSha256: sha(sample), maxRequests: 1, totalBudgetMicroUsd: 75_000,
  };
}

export function describeSingleProbe() {
  return { ...reviewedScope(), workspaceKeyBindingSha256: null, ownerApprovalRef: null, syntheticCacheAccepted: false, approvedAt: null, expiresAt: null };
}

function checkGrant(raw, current) {
  const fixed = Object.fromEntries(Object.entries(reviewedScope()).map(([name, value]) => [name, z.literal(value)]));
  const parsed = z.strictObject({
    ...fixed, workspaceKeyBindingSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    ownerApprovalRef: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/u),
    syntheticCacheAccepted: z.literal(true), approvedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
  }).safeParse(raw);
  if (!parsed.success) throw new Error("Invalid single-probe authorization");
  const { approvedAt, expiresAt } = parsed.data;
  const from = Date.parse(approvedAt), until = Date.parse(expiresAt);
  if (!Number.isFinite(current) || current < from || current >= until || until-from > 2*60*60*1000) {
    throw new Error("Invalid single-probe window");
  }
  return parsed.data;
}

function loadConfig(key, offline) {
  const bytes = readFileSync(reviewUrl);
  if (sha(bytes) !== expectedDraft) throw new Error("B1 review settings differ");
  const review = JSON.parse(bytes);
  const endpoint = offline ? "https://single-probe.invalid/api/v1/chat/completions" : review.config.endpoint;
  // This in-memory transport permission exists only after admission of this one fixed probe.
  const config = { ...review.config, endpoint, apiKey: key, userDailyMicroUsd: 75_000, globalDailyMicroUsd: 75_000 };
  const qualification = { ...review.qualification, endpoint, qualified: true };
  if (calculateDocumentReservation(config, qualification) !== 72_960) throw new Error("Unexpected reservation");
  return { config, qualification };
}

async function execute(rawGrant, { offline, directory, fetch, now, startedAt, stillApproved, key }) {
  const tick = performance.now(), first = now();
  const grant = checkGrant(rawGrant, first);
  if (typeof key !== "string" || key.length < 12 || key.length > 8192 || /\s/u.test(key)
    || sha("materials-b2\0" + sha(key)) !== grant.workspaceKeyBindingSha256 || JSON.stringify(grant).includes(key)
    || !Number.isFinite(startedAt) || startedAt > first) throw new Error("Invalid probe process");
  const { config, qualification } = loadConfig(key, offline);
  const deadline = Math.min(Date.parse(grant.expiresAt), startedAt + 15*60*1000);
  let latest = first;
  function remainingTime() {
    const seen = now();
    const remaining = Math.min(deadline - seen, deadline - first - (performance.now() - tick));
    if (!Number.isFinite(remaining) || seen < latest || remaining <= 0) throw new Error("Single-probe window closed");
    latest = seen;
    return remaining;
  }
  const authorizationSignal = AbortSignal.timeout(Math.max(1, Math.floor(remainingTime())));
  const journal = createQualificationJournal(directory, grant.runId);
  let checkpointFailed = false;
  async function record(type, fields) {
    try { await journal.checkpoint({ runId: grant.runId, type, timestamp: iso(latest), ...fields }); }
    catch (error) { checkpointFailed = true; throw error; }
  }
  const mode = offline ? "offline-test" : "authorized-single-receipt";
  await record("run-start", { mode, ledgerFormat: "b1-single-receipt-v1", authorization: grant, processStartedAt: iso(startedAt), effectiveExpiresAt: iso(deadline) });

  let postCount = 0, metadataGetCount = 0, receiptId = null, projectionFailed = false;
  let unverifiablePrice = false;
  let chatIdSha256 = null;
  const observedCostsUsd = { chat: null, generation: null };
  const pair = {};
  const receiptContext = { model: config.model, ...qualification.receiptRoute, privateText: sample, apiKey: key };
  async function transport(url, init) {
    const isPost = init?.method === "POST";
    if (!stillApproved() || init?.redirect !== "manual" || init.headers?.authorization !== "Bearer "+key) {
      throw new Error("Unapproved transport");
    }
    remainingTime();
    if (isPost) {
      if (postCount || String(url) !== config.endpoint || typeof init.body !== "string" || sha(init.body) !== expectedBody
        || Object.keys(init.headers).sort().join(",") !== "authorization,content-type") throw new Error("Unexpected probe request");
      await record("reservation", { state: "reserved", reservedMicroUsd: 72_960, maxRequests: 1, requestSha256: expectedBody });
    } else {
      const target = new URL(config.endpoint.replace(/\/chat\/completions$/u, "/generation"));
      target.searchParams.set("id", receiptId ?? "");
      if (init?.method !== "GET" || postCount !== 1 || !receiptId || String(url) !== target.href || metadataGetCount >= 3
        || init.body !== undefined || Object.keys(init.headers).join(",") !== "authorization") throw new Error("Unexpected receipt lookup");
    }
    if (!stillApproved()) throw new Error("Grant changed before handoff");
    remainingTime();
    const signal = AbortSignal.any([init.signal, authorizationSignal]);
    signal.throwIfAborted();
    if (isPost) postCount++;
    else metadataGetCount++;
    const response = await fetch(url, { ...init, signal });
    signal.throwIfAborted();
    remainingTime();
    if (response.redirected || (isPost ? !response.ok : response.status !== 200)) return response;
    // The production reader bounds streaming input. Only a metadata projection can reach disk.
    const kind = isPost ? "chat" : "generation";
    const source = response.clone();
    let raw, precise;
    try {
      raw = await readDocumentHttpJson(response, signal, () => { signal.throwIfAborted(); remainingTime(); });
      // The first reader has now verified the complete response is within the 128 KiB byte limit.
      precise = canReplayWirePrice(kind, await source.text());
    } finally {
      if (!source.bodyUsed) void source.body?.cancel().catch(() => {});
    }
    signal.throwIfAborted();
    remainingTime();
    let observation = null;
    try { observation = observeProbeCharge(kind, raw, receiptContext); }
    catch { projectionFailed = true; }
    if (isPost) chatIdSha256 = observation?.idSha256 ?? null;
    if (observation && (isPost || (receiptId && observation.idSha256 === sha(receiptId)))) {
      const reportedUsd = precise ? observation.reportedUsd : null;
      if (!precise) unverifiablePrice = true;
      observedCostsUsd[kind] = reportedUsd;
      await record(kind + "-observed", { receiptIdSha256: observation.idSha256,
        wirePriceReproducible: precise, reportedUsd, reportedMicroUsd: toMicroUsd(reportedUsd) });
    }
    try { if (precise) pair[kind] = projectProbeMetadata(kind, raw, receiptContext); else projectionFailed = true; }
    catch { projectionFailed = true; }
    if (isPost) {
      if (!chatIdSha256) raw.id = null;
      delete raw.choices;
    }
    return Response.json(raw, { status: response.status });
  }
  const provider = new HttpDocumentAnalysisProvider(config, { qualification, fetch: transport, now: () => new Date(now()) });
  const outcome = await provider.analyze({
    kind: "supplement", text: sample, segments: segmentDocumentText(sample), textVersionId: "receipt-probe-v1",
    outputSchemaVersion: "2026.11.1", providerPolicyId: config.providerPolicyId,
  }, authorizationSignal, undefined, async (id, observed) => {
    if (postCount !== 1 || receiptId !== null || chatIdSha256 !== sha(id)) return false;
    await record("receipt", { state: "reserved", receiptIdSha256: chatIdSha256, ...observed });
    receiptId = id;
    return true;
  });

  let replay = null;
  if (!projectionFailed && pair.chat && pair.generation) {
    try { replay = await replayRedactedPair(pair); } catch { projectionFailed = true; }
  }
  const productionAudit = outcome.kind === "received" ? outcome.audit?.status ?? null : null;
  const { chat: chatUsd, generation: generationUsd } = observedCostsUsd;
  const costConflict = chatUsd !== null && generationUsd !== null && chatUsd !== generationUsd;
  const actualMicroUsd = costConflict || checkpointFailed || unverifiablePrice ? null : toMicroUsd(chatUsd ?? generationUsd);
  const heldMicroUsd = postCount && actualMicroUsd === null ? 72_960 : 0;
  const state = !postCount ? "released" : actualMicroUsd === null ? "held-unknown" : "settled";
  const comparison = replay && !projectionFailed ? replay.comparison : "unverified";
  const result = {
    runId: grant.runId, mode, postCount, metadataGetCount, actualMicroUsd, heldMicroUsd, accounting: state,
    productionAudit, comparison: comparison === "compatible" && productionAudit !== "verified" ? "unverified" : comparison,
    replay, pair, projectionFailed, checkpointFailed, costConflict, unverifiablePrice, observedCostsUsd, effectiveExpiresAt: iso(deadline),
    budgetExceeded: Math.max(chatUsd ?? 0, generationUsd ?? 0) > grant.totalBudgetMicroUsd / 1_000_000,
    b2Authorized: false, privateUserDataAuthorized: false,
  };
  await record("settlement", { state, actualMicroUsd, heldMicroUsd, checkpointFailed, costConflict, unverifiablePrice, observedCostsUsd, postCount, metadataGetCount });
  journal.finish(result);
  return result;
}

/** Tests own the injected local transport and directory. This entry never accepts a key or a live endpoint. */
export function rehearseSingleProbe(grant, { directory, fetch, now = Date.now, startedAt = now(), stillApproved = () => true }) {
  return execute(grant, { offline: true, directory, fetch, now, startedAt, stillApproved, key: "offline-probe-fixture" });
}

function readPrivateFile(name, limit) {
  const path = join(liveRoot, name);
  const file = lstatSync(path);
  if (!file.isFile() || file.size > limit || relative(liveRoot, realpathSync(liveRoot)) !== "") throw new Error("Invalid private file");
  const bytes = readFileSync(path);
  if (bytes.length > limit) throw new Error("Invalid private file");
  return bytes;
}

function readKeyBinding() {
  const value = readPrivateFile("workspace-key-binding.txt", 64).toString("utf8");
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error("Invalid workspace key reference");
  return value;
}
const readOwnerGrant = () => readPrivateFile("authorization.json", 16_384);

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.length !== 3) throw new Error();
    if (process.argv[2] === "--describe") {
      const template = describeSingleProbe();
      if (existsSync(join(liveRoot, "workspace-key-binding.txt"))) template.workspaceKeyBindingSha256 = readKeyBinding();
      process.stdout.write(JSON.stringify(template, null, 2)+"\n");
    } else {
      const mode = process.argv[2];
      if (mode !== "--preflight" && (mode !== "--execute" || process.env.ARC_B1_SINGLE_RECEIPT_ENABLED !== "owner-approved")) throw new Error();
      const approved = readOwnerGrant();
      const grant = checkGrant(JSON.parse(approved), Date.now());
      if (grant.workspaceKeyBindingSha256 !== readKeyBinding() || existsSync(join(liveRoot, grantRunId))) throw new Error();
      if (mode === "--preflight") {
        process.stdout.write("Single synthetic probe authorized through " + grant.expiresAt + "\n");
      } else {
        const launcherMs = Number(process.env.ARC_B1_SINGLE_RECEIPT_LAUNCHER_MS ?? 0);
        if (!Number.isSafeInteger(launcherMs) || launcherMs < 0 || launcherMs >= 900_000) throw new Error();
        const result = await execute(grant, {
          offline: false, directory: liveRoot, fetch: globalThis.fetch, key: process.env.ARC_B1_SINGLE_RECEIPT_KEY,
          now: Date.now, startedAt: Date.now() - Math.ceil(process.uptime() * 1000) - launcherMs,
          stillApproved: () => approved.equals(readOwnerGrant()) && grant.workspaceKeyBindingSha256 === readKeyBinding(),
        });
        process.stdout.write(JSON.stringify({ postCount: result.postCount, metadataGetCount: result.metadataGetCount,
          accounting: result.accounting, actualMicroUsd: result.actualMicroUsd, comparison: result.comparison })+"\n");
        process.exitCode = result.comparison === "compatible" && !result.budgetExceeded ? 0 : 1;
      }
    }
  } catch {
    process.stderr.write("Single-receipt probe declined or interrupted. Inspect the controlled grant and ledger before any further action.\n");
    process.exitCode = 2;
  }
}
