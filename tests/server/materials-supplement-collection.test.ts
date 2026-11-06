// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import corpus from "../fixtures/documents/supplement-quality-corpus.json";
import { supplementCorpusSha256 } from "../../scripts/score-materials-supplements";
import * as collector from "../../scripts/collect-materials-supplements";
import * as ledger from "../../scripts/materials-supplement-ledger";
import { fixtureGenerationResponse } from "../helpers/document-generation-response";
import type { DocumentFetch } from "../../worker/document-executor/provider-http";
import { documentAcceptanceConfigurationDigest } from "../../worker/document-executor/acceptance-policy";
import { KIMI_SOURCE_SPAN_POLICY_ID } from "../../worker/document-executor/source-span-extraction";
import { build } from "esbuild";

// The reviewed public route is part of the contract. Every call below still uses an injected local Response fixture.
const endpoint = "https://openrouter.ai/api/v1/chat/completions";
const routingPolicy = { policyVersion: "2026.11.3", providerOrder: ["moonshotai/mxfp4"], allowFallback: false as const, dataPolicy: "zdr-only" as const };
const config = { provider: "OpenRouter / Moonshot AI", model: "moonshotai/kimi-k3.1-pro", endpoint, providerPolicyId: "materials-openrouter-kimi-k31-pro-mxfp4-zdr",
  routingPolicy, priceVersion: "2026.11.3", maxInputTokens: 16_000, maxOutputTokens: 4096, maxJobMicroUsd: 75_000,
  userDailyMicroUsd: 450_000, globalDailyMicroUsd: 450_000, httpTimeoutMs: 1000 };
const qualification = { qualified: true as const, model: config.model, endpoint, providerPolicyId: config.providerPolicyId,
  priceVersion: config.priceVersion, routingPolicy, receiptRoute: { providerName: "Moonshot AI", endpointId: "a3fafaac-f097-4ef1-86b3-842854dad5c6", generationModel: "moonshotai/kimi-k3.1-pro-20261023" },
  inputMicroUsdPerMillionTokens: 2_000_000, outputMicroUsdPerMillionTokens: 10_000_000, inputTokenBound: "utf8-bytes-plus-4096" as const };
const directories: string[] = [];
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "arc-supplement-collection-"));
  directories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    const target = realpathSync(directory);
    if (dirname(target) !== realpathSync(tmpdir()) || !basename(target).startsWith("arc-supplement-collection-")) throw new Error("unexpected temporary directory");
    rmSync(target, { recursive: true, force: true });
  }
});

it("prints the six public identity commitments and worst-case price offline for an issuer", () => {
  const directory = temporaryDirectory(), settings = join(directory, "public-settings.json");
  writeFileSync(settings, JSON.stringify({ config, qualification }));
  const cli = spawnSync(process.execPath, ["--import", "tsx", "scripts/collect-materials-supplements.ts", "--inspect", settings], {
    encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: directory, TMP: directory,
      NODE_OPTIONS: process.env.NODE_OPTIONS, ARC_LOCAL_BUILD_DENIAL_LOG: process.env.ARC_LOCAL_BUILD_DENIAL_LOG },
  });
  expect(cli.status, cli.stderr).toBe(0);
  expect(JSON.parse(cli.stdout)).toMatchObject({
    purpose: "collect-six-synthetic-supplements", corpusSha256: supplementCorpusSha256,
    outputSchemaVersion: corpus.schemaVersion, configurationSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    maxRequests: 6, perRequestMicroUsd: 75_000, totalBudgetMicroUsd: 450_000, maxWindowMs: 7_200_000, reservationMicroUsd: 72_960,
    documents: corpus.documents.map(doc => ({ documentId: doc.id, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId })),
  });
  expect(cli.stdout).not.toContain(corpus.documents[0]!.text);
  expect(cli.stdout).not.toContain("goldFields");
});

it("uses the CLI's actual source bytes despite Git overrides, assume-unchanged files and ignored shadow modules", async () => {
  const checkout = temporaryDirectory(), external = temporaryDirectory();
  const script = join(checkout, "scripts", "collect-materials-supplements.mjs");
  await build({ entryPoints: ["scripts/collect-materials-supplements.ts"], outfile: script, bundle: true, platform: "node", format: "esm", target: "node24", logLevel: "silent",
    plugins: [{ name: "preserve-nonentry-module-urls", setup(builder) {
      builder.onLoad({ filter: /\.(ts|mjs)$/ }, args => {
        if (basename(args.path) === "collect-materials-supplements.ts" || args.path.includes("node_modules")) return;
        const source = readFileSync(args.path, "utf8");
        if (!source.includes("import.meta.url")) return;
        return { contents: source.replaceAll("import.meta.url", JSON.stringify(pathToFileURL(args.path).href)),
          loader: args.path.endsWith(".ts") ? "ts" : "js", resolveDir: dirname(args.path) };
      });
    } }] });
  mkdirSync(join(checkout, "app"));
  writeFileSync(join(checkout, "app", "source.ts"), "export const value = 1;\n");
  writeFileSync(join(checkout, ".gitignore"), "app/ignored.js\n");
  const baseEnv = { NODE_ENV: "test" as const, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "", NODE_OPTIONS: process.env.NODE_OPTIONS, ARC_LOCAL_BUILD_DENIAL_LOG: process.env.ARC_LOCAL_BUILD_DENIAL_LOG };
  const git = (args: string[], extra: Record<string, string> = {}) => {
    const result = spawnSync("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgSign=false", "-c", "user.name=Local Fixture",
      "-c", "user.email=fixture@example.invalid", ...args], { cwd: checkout, env: { ...baseEnv, ...extra }, encoding: "utf8", windowsHide: true });
    expect(result.status, result.stderr).toBe(0); return result.stdout.trim();
  };
  git(["init", "--quiet"]); git(["add", "."]); git(["commit", "--quiet", "-m", "Temporary synthetic source fixture"]);
  const commit = git(["rev-parse", "HEAD"]);
  const check = (extra: Record<string, string> = {}) => spawnSync(process.execPath, [script, "--check-source", commit], {
    cwd: checkout, env: { ...baseEnv, ...extra }, encoding: "utf8", windowsHide: true,
  });
  const clean = check(); expect(clean.status, clean.stderr).toBe(0);
  expect(JSON.parse(clean.stdout)).toMatchObject({ candidateCommit: commit, checkedFiles: 3 });
  git(["update-index", "--assume-unchanged", "app/source.ts"]);
  writeFileSync(join(checkout, "app", "source.ts"), "export const value = 2;\n");
  expect(check().status).toBe(2);
  const otherTree = join(external, "empty"); mkdirSync(otherTree);
  const overrides = { GIT_DIR: join(checkout, ".git"), GIT_WORK_TREE: otherTree, GIT_INDEX_FILE: join(external, "index") };
  git(["read-tree", commit], overrides);
  git(["update-index", "--skip-worktree", ".gitignore", "app/source.ts", "scripts/collect-materials-supplements.mjs"], overrides);
  expect(check(overrides).status).toBe(2);
  writeFileSync(join(checkout, "app", "source.ts"), "export const value = 1;\n");
  git(["update-index", "--no-assume-unchanged", "app/source.ts"]);
  writeFileSync(join(checkout, "app", "ignored.js"), "throw Error('unreviewed shadow');");
  expect(check(overrides).status).toBe(2);
}, 30_000);

it("rejects a junction or symlink that makes another checkout's registered ledger appear local", () => {
  const directory = temporaryDirectory(), other = temporaryDirectory(), alias = join(other, "ledger-alias");
  const identity = ledger.registerSupplementLedger(directory);
  symlinkSync(directory, alias, process.platform === "win32" ? "junction" : "dir");
  try { expect(() => ledger.openSupplementLedger(alias, "fixture", identity)).toThrow("supplement-ledger-mismatch"); }
  finally { unlinkSync(alias); }
});

const candidate = "a".repeat(40), credential = "synthetic-supplement-credential";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const now = () => new Date("2026-11-04T08:10:00Z");
async function issued(directory: string, runId = "fixture-run") {
  const scope = await collector.inspectSupplementSettings({ config, qualification });
  return { config, qualification, authorization: { purpose: scope.purpose, runId, id: "grant-" + runId, issuedBy: "fixture-issuer",
    candidateCommit: candidate, credentialSha256: sha(credential), corpusSha256: scope.corpusSha256, documents: scope.documents,
    ledgerSha256: ledger.registerSupplementLedger(directory),
    configurationSha256: scope.configurationSha256, outputSchemaVersion: scope.outputSchemaVersion,
    approvedAt: "2026-11-04T08:00:00Z", expiresAt: "2026-11-04T10:00:00Z",
    maxRequests: 6, perRequestMicroUsd: 75_000, totalBudgetMicroUsd: 450_000 } };
}
const environment = (raw: string) => ({ ARC_SUPPLEMENT_COLLECTION_ENABLED: "true",
  ARC_SUPPLEMENT_ISSUANCE_SHA256: sha(raw), ARC_SUPPLEMENT_PROVIDER_API_KEY: credential });
const options = (directory: string, fetch: DocumentFetch) => ({ directory, fetch, now, matchesCandidate: (commit: string) => commit === candidate, mode: "offline-test" as const });
function inspectDb(directory: string, sql: string) {
  const db = new DatabaseSync(join(directory, "ledger.sqlite"), { readOnly: true });
  try { return db.prepare(sql).all(); } finally { db.close(); }
}
const docContent = (index: number) => {
  const doc = corpus.documents[index]!;
  return " \n" + JSON.stringify({ schemaVersion: corpus.schemaVersion, items: doc.goldFields.map((field, i) => ({
    id: "fixture-" + (i + 1), kind: field.kind, text: field.acceptedForms[0], skillLabels: field.skillLabels,
    requirementLevel: field.requirementLevel, selfLevelHint: field.selfLevelHint, source: field.source,
  })), reviewPoints: doc.expectedReviewPoints }, null, 1) + "\n ";
};
function chat(index: number, id: string, content = docContent(index)) {
  return Response.json({ id, model: config.model, provider: qualification.receiptRoute.providerName,
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.000007 }, choices: [{ message: { content } }] });
}
const generation = (id: string) => fixtureGenerationResponse(id, config.model, qualification.receiptRoute);
function transport(post: (index: number) => Response = i => chat(i, "gen-fixture-" + i), get: (id: string) => Response = generation) {
  let index = 0;
  return vi.fn<DocumentFetch>(async (url, init) => init?.method === "POST" ? post(index++) : get(new URL(String(url)).searchParams.get("id")!));
}
const collect = (raw: string, directory: string, fetch: DocumentFetch) =>
  collector.collectSupplementRun(raw, environment(raw), options(directory, fetch));
const fixtureBinding = (grant: unknown) => {
  const raw = JSON.stringify(grant);
  return collector.supplementCaptureBinding(raw, sha(raw), "offline-test");
};

async function sourceSpanFixture(directory: string) {
  const legacy = await issued(directory);
  const config = { ...legacy.config, providerPolicyId: KIMI_SOURCE_SPAN_POLICY_ID };
  const qualification = { ...legacy.qualification, providerPolicyId: KIMI_SOURCE_SPAN_POLICY_ID };
  return { config, qualification, authorization: { ...legacy.authorization,
    configurationSha256: await documentAcceptanceConfigurationDigest(config, qualification) } };
}

// Independent synthetic wire replies, authored from each document's two body sentences.
// In particular, reply 1 leaves off a full stop that only the production source decoder restores.
function spanContent(index: number) {
  const lines = corpus.documents[index]!.text.split("\n").slice(1);
  const source = (line: number) => ({ segmentId: "segment-1", quote: lines[line]! });
  const fact = (line: number, kind: string, skillLabels: string[], requirementLevel: string | null = null, selfLevelHint: string | null = null) =>
    ({ kind, skillLabels, requirementLevel, selfLevelHint, source: source(line) });
  const point = (line: number, code: string) => ({ code, source: source(line) });
  const cases = [
    () => ({ items: [{ ...fact(0, "experience", ["SQL"]), source: { ...source(0), quote: lines[0]!.slice(0, -1) } }, fact(1, "requirement", ["SQL"], "preferred")], reviewPoints: [] }),
    () => ({ items: [fact(0, "experience", ["OpenTelemetry"], null, "guided"), fact(1, "skill-claim", ["observability"], null, "conceptual")],
      reviewPoints: [point(0, "confirm-self-assessment"), point(1, "confirm-self-assessment")] }),
    () => ({ items: [fact(0, "constraint", []), fact(1, "constraint", [])], reviewPoints: [point(1, "missing-information")] }),
    () => ({ items: [fact(0, "experience", ["Kubernetes"]), fact(1, "experience", [])], reviewPoints: [point(0, "team-attribution")] }),
    () => ({ items: [], reviewPoints: [point(0, "prompt-injection"), point(1, "untrusted-resource-url")] }),
    () => ({ items: [fact(0, "requirement", ["SQL"], "unspecified"), fact(1, "requirement", ["TypeScript"], "preferred")], reviewPoints: [point(0, "conflicting-requirement")] }),
  ];
  return " \n" + JSON.stringify({ format: "source-spans-v1", ...cases[index]!() }, null, 1) + "\n ";
}
function spanChat(index: number, content = spanContent(index), finish = "stop") {
  return Response.json({ id: `gen-span-${index}`, model: config.model, provider: qualification.receiptRoute.providerName,
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.000007 },
    choices: [{ finish_reason: finish, message: { role: "assistant", content } }] });
}
it("runs the separately pinned source-span collector end to end and preserves the original replies beside the scored output", async () => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory);
  const http = transport(index => spanChat(index));
  const result = await collect(JSON.stringify(grant), directory, http);
  expect(result).toMatchObject({ mode: "offline-test", status: "complete", requestsSent: 6, settledMicroUsd: 42, heldMicroUsd: 0,
    quality: { passed: true, normalPrefillCount: 3, edgePassCount: 3, realModelEvaluated: false } });
  expect(http.mock.calls.map(([, init]) => init?.method)).toEqual(Array.from({ length: 6 }, () => ["POST", "GET"]).flat());
  const posts = http.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)));
  expect(posts.every(post => post.messages[0].content.includes("source-spans-v1"))).toBe(true);
  expect(posts.map(post => JSON.parse(post.messages[1].content))).toEqual(corpus.documents.map(doc => ({ kind: "supplement", segments: doc.segments.map(segment => ({ segmentId: segment.id, text: segment.text })) })));
  const rows = inspectDb(directory, "SELECT raw_content_json,audit_json FROM attempts ORDER BY rowid");
  expect(rows.map(row => JSON.parse(String(row.raw_content_json)))).toEqual(corpus.documents.map((_, index) => spanContent(index)));
  expect(rows.every(row => JSON.parse(String(row.audit_json)).extractionRead === "parsed")).toBe(true);
  const reopened = ledger.openSupplementLedger(directory, grant.authorization.runId, grant.authorization.ledgerSha256);
  try {
    expect(reopened.captures(fixtureBinding(grant))[0]?.extraction).toMatchObject({ schemaVersion: corpus.schemaVersion, items: [
      expect.objectContaining({ id: "candidate-1", text: corpus.documents[0]!.text.split("\n")[1] }), expect.objectContaining({ id: "candidate-2" }),
    ] });
  } finally { reopened.close(); }
});
it.each(["legacy-shape", "invented-source", "output-limit", "generation-limit", "missing-fact"] as const)("keeps verified billing separate from a source-span quality failure: %s", async failure => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory);
  const wire = JSON.parse(spanContent(0));
  if (failure === "invented-source") wire.items[0].source.quote = "Invented quote.";
  if (failure === "missing-fact") wire.items.pop();
  const sourceLines = corpus.documents[0]!.text.split("\n").slice(1);
  const first = failure === "legacy-shape" ? JSON.stringify({ schemaVersion: corpus.schemaVersion, reviewPoints: [], items: wire.items.map(
    (item: {source: {segmentId: string}}, index: number) => ({ ...item, id: `fact-${index}`, text: sourceLines[index], source: { ...item.source, quote: sourceLines[index] } })) }) : JSON.stringify(wire);
  const http = transport(index => index ? spanChat(index) : spanChat(0, first, failure === "output-limit" ? "length" : "stop"),
    id => failure === "generation-limit" && id === "gen-span-0" ? Response.json({ data: { id, model: qualification.receiptRoute.generationModel,
      provider_name: qualification.receiptRoute.providerName, provider_responses: [{ status: 200, endpoint_id: qualification.receiptRoute.endpointId }],
      native_tokens_prompt: 100, native_tokens_completion: 20, total_cost: 0.000007, native_finish_reason: "length" } }) : generation(id));
  const result = await collect(JSON.stringify(grant), directory, http);
  expect(result).toMatchObject({ status: "quality-failed", reason: "quality-threshold-failed", requestsSent: 6, heldMicroUsd: 0, settledMicroUsd: 42,
    quality: { passed: false, normalPrefillCount: 2, edgePassCount: 3 } });
  const row = inspectDb(directory, "SELECT raw_content_json,audit_json FROM attempts ORDER BY rowid LIMIT 1")[0]!;
  expect(JSON.parse(String(row.raw_content_json))).toBe(first);
  expect(JSON.parse(String(row.audit_json))).toMatchObject({ status: "verified", extractionRead: {
    "legacy-shape": "invalid-shape", "invented-source": "invalid-source", "output-limit": "output-limit", "generation-limit": "output-limit", "missing-fact": "parsed",
  }[failure] });
  expect(result.quality?.documents[0]?.passed).toBe(false);
  expect(http).toHaveBeenCalledTimes(12);
});
it("settles an observed charge and stops before the second POST when the decoded output cannot be recorded", async () => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory), raw = JSON.stringify(grant);
  const http = transport(index => {
    const db = new DatabaseSync(join(directory, "ledger.sqlite"));
    try { db.exec("CREATE TRIGGER fail_projection BEFORE INSERT ON source_span_outputs BEGIN SELECT RAISE(ABORT,'simulated fault'); END"); }
    finally { db.close(); }
    return spanChat(index);
  });
  expect(await collect(raw, directory, http)).toMatchObject({ status: "stopped", reason: "capture-failed", requestsSent: 1, settledMicroUsd: 7, heldMicroUsd: 0, quality: null });
  const attempt = inspectDb(directory, "SELECT * FROM attempts")[0]!;
  expect(attempt).toMatchObject({ state: "settled", reason: "capture-failed", actual_micro_usd: 7, raw_content_json: JSON.stringify(spanContent(0)) });
  expect(JSON.parse(String(attempt.audit_json))).toMatchObject({ status: "verified", extractionRead: "parsed", metadataAttempts: 1 });
  await expect(collect(raw, directory, http)).rejects.toThrow("supplement-run-unavailable");
  expect(http).toHaveBeenCalledTimes(2);
});
it("requires the durable original to match the received unedited content before recording its decoded output", async () => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory);
  const http = transport(index => spanChat(index), id => {
    const db = new DatabaseSync(join(directory, "ledger.sqlite"));
    try { db.prepare("UPDATE attempts SET raw_content_json=? WHERE receipt_id=?").run(JSON.stringify("replaced"), id); }
    finally { db.close(); }
    return generation(id);
  });
  expect(await collect(JSON.stringify(grant), directory, http)).toMatchObject({ status: "stopped", reason: "capture-failed", requestsSent: 1, settledMicroUsd: 7, heldMicroUsd: 0, quality: null });
  expect(inspectDb(directory, "SELECT * FROM source_span_outputs")).toEqual([]);
  expect(http).toHaveBeenCalledTimes(2);
});
it("holds the source-span reservation and preserves the reply when neither side supplies a trusted price", async () => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory), raw = JSON.stringify(grant);
  const http = transport(() => Response.json({ id: "gen-no-priced-span", model: config.model,
    choices: [{ finish_reason: "stop", message: { role: "assistant", content: spanContent(0) } }] }), () => new Response(null, { status: 503 }));
  expect(await collect(raw, directory, http)).toMatchObject({ status: "held", requestsSent: 1, settledMicroUsd: 0, heldMicroUsd: 72_960, quality: null });
  expect(inspectDb(directory, "SELECT state,raw_content_json FROM attempts")).toEqual([{ state: "held", raw_content_json: JSON.stringify(spanContent(0)) }]);
  expect(inspectDb(directory, "SELECT * FROM source_span_outputs")).toEqual([]);
  await expect(collect(raw, directory, http)).rejects.toThrow("supplement-run-unavailable");
  expect(http).toHaveBeenCalledTimes(2);
});
it.each(["raw", "canonical", "missing", "version"] as const)("refuses to replay a %s archive mismatch instead of rescoring an alternative", async evidence => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory);
  await collect(JSON.stringify(grant), directory, transport(index => spanChat(index)));
  const db = new DatabaseSync(join(directory, "ledger.sqlite"));
  try {
    const action = { raw: "UPDATE attempts SET raw_content_json='null'", canonical: "UPDATE source_span_outputs SET extraction_json='null'",
      missing: "DELETE FROM source_span_outputs", version: "UPDATE attempts SET text_version_id='wrong-version'" }[evidence];
    db.prepare(action + " WHERE run_id=? AND document_id=?").run(grant.authorization.runId, "supplement-01");
  } finally { db.close(); }
  const reopened = ledger.openSupplementLedger(directory, grant.authorization.runId, grant.authorization.ledgerSha256);
  try { expect(() => reopened.captures(fixtureBinding(grant))).toThrow("supplement-capture-mismatch"); }
  finally { reopened.close(); }
});
it("does not persist an escaped credential in the original or decoded source-span evidence", async () => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory), first = JSON.parse(spanContent(0));
  first.items[0].skillLabels = [credential];
  const encoded = JSON.stringify(first).replace(credential, "\\u0073" + credential.slice(1));
  expect(encoded).not.toContain(credential);
  const http = transport(() => spanChat(0, encoded));
  expect(await collect(JSON.stringify(grant), directory, http)).toMatchObject({ status: "stopped", reason: "capture-failed", requestsSent: 1, settledMicroUsd: 7, heldMicroUsd: 0, quality: null });
  expect(inspectDb(directory, "SELECT raw_content_json FROM attempts")).toEqual([{ raw_content_json: null }]);
  expect(inspectDb(directory, "SELECT * FROM source_span_outputs")).toEqual([]);
  expect(http.mock.calls.map(([, init]) => init?.method)).toEqual(["POST"]);
});
it("does not enable the supplement collector while the separate diagnostic pilot is enabled", async () => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory), raw = JSON.stringify(grant), http = transport(index => spanChat(index));
  const keyRead = vi.fn(() => credential);
  const env = Object.defineProperty({ ...environment(raw), ARC_DOCUMENT_PILOT_ENABLED: "true" }, "ARC_SUPPLEMENT_PROVIDER_API_KEY", { get: keyRead });
  await expect(collector.collectSupplementRun(raw, env, options(directory, http))).rejects.toThrow("supplement-disabled");
  expect(http).not.toHaveBeenCalled(); expect(keyRead).not.toHaveBeenCalled();
});
it("refuses cross-policy issuances and never expands the legacy one-GET allowance for a source-span run", async () => {
  const directory = temporaryDirectory(), legacy = await issued(directory), span = await sourceSpanFixture(directory);
  const http = transport(index => spanChat(index), () => new Response(null, { status: 404 }));
  for (const [settings, grant] of [[legacy, span], [span, legacy]] as const) {
    const raw = JSON.stringify({ ...settings, authorization: grant.authorization });
    const keyRead = vi.fn(() => credential);
    await expect(collector.collectSupplementRun(raw, Object.defineProperty(environment(raw), "ARC_SUPPLEMENT_PROVIDER_API_KEY", { get: keyRead }), options(directory, http)))
      .rejects.toThrow("supplement-authorization-invalid");
    expect(keyRead).not.toHaveBeenCalled();
  }
  expect(http).not.toHaveBeenCalled();
  expect(await collect(JSON.stringify(span), directory, http)).toMatchObject({ status: "stopped", requestsSent: 1, settledMicroUsd: 7, heldMicroUsd: 0, quality: null });
  expect(http.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET"]);
});

it("cannot turn six truncated source-span replies into a passing legacy run by changing the stored issuance before scoring", async () => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory), raw = JSON.stringify(grant);
  const http = transport(index => spanChat(index, docContent(index), "length"), id => {
    if (id === "gen-span-5") {
      const db = new DatabaseSync(join(directory, "ledger.sqlite"));
      try { db.prepare("UPDATE collection_runs SET issuance_json=json_set(issuance_json,'$.config.providerPolicyId',?) WHERE run_id=?")
        .run(config.providerPolicyId, grant.authorization.runId); } finally { db.close(); }
    }
    return generation(id);
  });
  expect(await collect(raw, directory, http)).toMatchObject({ status: "stopped", reason: "issuance-mismatch", requestsSent: 6,
    settledMicroUsd: 42, heldMicroUsd: 0, quality: null, mode: "offline-test" });
  expect(inspectDb(directory, "SELECT state,actual_micro_usd FROM attempts")).toEqual(Array.from({ length: 6 }, () => ({ state: "settled", actual_micro_usd: 7 })));
  const reopened = ledger.openSupplementLedger(directory, grant.authorization.runId, grant.authorization.ledgerSha256);
  try {
    const original = fixtureBinding(grant);
    expect(() => reopened.captures(original)).toThrow("supplement-run-binding-mismatch");
    expect(() => reopened.captures(undefined as never)).toThrow("supplement-run-binding-mismatch");
    const changed = String(inspectDb(directory, "SELECT issuance_json FROM collection_runs")[0]!.issuance_json);
    expect(() => reopened.captures({ ...original, publicIssuance: changed })).toThrow("supplement-run-binding-mismatch");
  } finally { reopened.close(); }
  expect(http).toHaveBeenCalledTimes(12);
});
it.each(["before-send", "unknown-cost"] as const)("fails closed on a stored issuance digest change with %s accounting", async when => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory), raw = JSON.stringify(grant);
  const change = "UPDATE collection_runs SET issuance_sha256='" + "b".repeat(64) + "'";
  if (when === "before-send") {
    const db = new DatabaseSync(join(directory, "ledger.sqlite"));
    try { db.exec(`CREATE TRIGGER drift AFTER INSERT ON collection_runs BEGIN ${change}; END`); } finally { db.close(); }
  }
  const http = transport(() => Response.json({ id: "gen-no-price", model: config.model, choices: [{ message: { content: spanContent(0) } }] }), () => {
    const db = new DatabaseSync(join(directory, "ledger.sqlite"));
    try { db.exec(change); } finally { db.close(); }
    return new Response(null, { status: 503 });
  });
  expect(await collect(raw, directory, http)).toMatchObject({ status: when === "before-send" ? "stopped" : "held", reason: "issuance-mismatch",
    requestsSent: when === "before-send" ? 0 : 1, heldMicroUsd: when === "before-send" ? 0 : 72_960, settledMicroUsd: 0, quality: null });
  expect(http).toHaveBeenCalledTimes(when === "before-send" ? 0 : 2);
});
it("cannot label an injected clock, candidate predicate, directory and transport as live evidence", async () => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory), raw = JSON.stringify(grant), http = transport(index => spanChat(index));
  const forged = { ...options(directory, http), mode: "authorized-live" };
  await expect(collector.collectSupplementRun(raw, environment(raw), forged as ReturnType<typeof options>)).rejects.toThrow("supplement-fixture-refused");
  expect(http).not.toHaveBeenCalled();
  expect(inspectDb(directory, "SELECT * FROM collection_runs")).toEqual([]);
});
it("accepts only the fixed placeholder in injectable fixtures, and refuses a public run ID containing the key or its fingerprint", async () => {
  const directory = temporaryDirectory(), grant = await sourceSpanFixture(directory), http = transport(index => spanChat(index));
  for (const [key, runId] of [["another-private-looking-fixture-key", "wrong-key"], [credential, `public-${credential}-suffix`], [credential, `public-${sha(credential)}-suffix`]]) {
    const raw = JSON.stringify({ ...grant, authorization: { ...grant.authorization, runId, credentialSha256: sha(key!) } });
    await expect(collector.collectSupplementRun(raw, { ...environment(raw), ARC_SUPPLEMENT_PROVIDER_API_KEY: key! }, options(directory, http))).rejects.toThrow();
  }
  expect(http).not.toHaveBeenCalled();
  expect(inspectDb(directory, "SELECT * FROM collection_runs")).toEqual([]);
});

it("requires a separate pinned issuance before opening the ledger or reading the dedicated credential", async () => {
  const directory = temporaryDirectory(), base = await issued(directory), http = transport(), opts = options(directory, http);
  const oldGate = { ARC_DOCUMENT_QUALIFICATION_ENABLED: "true", ARC_DOCUMENT_QUALIFICATION_SETTINGS: JSON.stringify(base) };
  await expect(collector.collectSupplementRun(JSON.stringify(base), oldGate, opts)).rejects.toThrow("supplement-disabled");
  const keyRead = vi.fn(() => { throw new Error("unexpected credential read"); });
  const mutations = [
    { purpose: "b1-single-probe" }, { runId: "../jump" }, { candidateCommit: "b".repeat(40) }, { corpusSha256: "0".repeat(64) },
    { outputSchemaVersion: "2026.11.9" }, { configurationSha256: "f".repeat(64) }, { documents: [...base.authorization.documents].reverse() },
    { documents: base.authorization.documents.map((doc, i) => i ? doc : { ...doc, textVersionId: "stale" }) },
    { documents: base.authorization.documents.map((doc, i) => i ? doc : { ...doc, text: "user supplied material" }) },
    { approvedAt: "2026-11-04T08:30:00Z" }, { expiresAt: "2026-11-04T08:10:00Z" }, { expiresAt: "2026-11-04T10:00:00.001Z" },
    { maxRequests: 7 }, { perRequestMicroUsd: 75_001 }, { totalBudgetMicroUsd: 450_001 },
  ];
  for (const change of mutations) {
    const raw = JSON.stringify({ ...base, authorization: { ...base.authorization, ...change } });
    const env = Object.defineProperty(environment(raw), "ARC_SUPPLEMENT_PROVIDER_API_KEY", { get: keyRead });
    await expect(collector.collectSupplementRun(raw, env, opts)).rejects.toThrow("supplement-authorization-invalid");
  }
  const raw = JSON.stringify(base);
  await expect(collector.collectSupplementRun(raw, { ...environment(raw), ARC_SUPPLEMENT_ISSUANCE_SHA256: sha(raw + " ") }, opts)).rejects.toThrow();
  await expect(collector.collectSupplementRun(raw, { ...environment(raw), ARC_SUPPLEMENT_PROVIDER_API_KEY: "wrong-fixture" }, opts)).rejects.toThrow();
  expect(keyRead).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
  expect(inspectDb(directory, "SELECT * FROM collection_runs")).toHaveLength(0);
});

it("durably reserves before each handoff, freezes the exact content before each GET, and scores the six settled captures", async () => {
  const directory = temporaryDirectory(), grant = await issued(directory), raw = JSON.stringify(grant);
  const reservations: unknown[] = [], captures: unknown[] = [], requests: unknown[] = [];
  let i = 0;
  const http = vi.fn<DocumentFetch>(async (url, init) => {
    if (init?.method === "POST") {
      reservations.push(inspectDb(directory, "SELECT document_id, document_version_id, text_version_id, state, reserved_micro_usd FROM attempts ORDER BY rowid DESC LIMIT 1")[0]);
      requests.push(JSON.parse(JSON.parse(String(init.body)).messages[1].content));
      return chat(i, "gen-fixture-" + i++);
    }
    captures.push(inspectDb(directory, "SELECT raw_content_json, receipt_id FROM attempts ORDER BY rowid DESC LIMIT 1")[0]);
    return generation(new URL(String(url)).searchParams.get("id")!);
  });
  const result = await collect(raw, directory, http);
  expect(result).toMatchObject({ mode: "offline-test", requestsSent: 6, heldMicroUsd: 0, settledMicroUsd: 42, status: "complete",
    quality: { passed: true, normalPrefillCount: 3, edgePassCount: 3 } });
  expect(http.mock.calls.map(([, init]) => init?.method)).toEqual(Array.from({ length: 6 }, () => ["POST", "GET"]).flat());
  expect(requests).toEqual(corpus.documents.map(doc => ({ kind: "supplement", segments: doc.segments.map(s => ({ segmentId: s.id, text: s.text })) })));
  expect(reservations).toEqual(corpus.documents.map(doc => ({ document_id: doc.id, document_version_id: doc.documentVersionId,
    text_version_id: doc.textVersionId, state: "reserved", reserved_micro_usd: 72_960 })));
  expect(captures).toEqual(corpus.documents.map((_, j) => ({ raw_content_json: JSON.stringify(docContent(j)), receipt_id: "gen-fixture-" + j })));
  const rows = inspectDb(directory, "SELECT * FROM attempts"), runs = inspectDb(directory, "SELECT * FROM collection_runs");
  expect(rows).toHaveLength(6);
  for (const row of rows) {
    expect(row).toMatchObject({ state: "settled", actual_micro_usd: 7 });
    expect(JSON.parse(String(row.chat_json))).toMatchObject({ actualMicroUsd: 7, inputTokens: 100, outputTokens: 20 });
    expect(JSON.parse(String(row.audit_json))).toMatchObject({ status: "verified", metadataMicroUsd: 7, actualEndpointId: qualification.receiptRoute.endpointId });
  }
  expect(JSON.parse(String(runs[0]!.result_json))).toEqual(result);
  expect(JSON.stringify([...rows, ...runs])).not.toContain(credential);
  // Reopening the ledger under the same or a renamed run cannot spend the grant again.
  await expect(collect(raw, directory, http)).rejects.toThrow("supplement-run-unavailable");
  await expect(collect(JSON.stringify({ ...grant, authorization: { ...grant.authorization, runId: "other-run" } }), directory, http)).rejects.toThrow("supplement-run-unavailable");
  expect(http).toHaveBeenCalledTimes(12);
  const next = JSON.stringify(await issued(directory, "new-run")), dupeHttp = transport();
  expect(await collect(next, directory, dupeHttp)).toMatchObject({ requestsSent: 1, status: "held", reason: "duplicate-receipt", heldMicroUsd: 72_960, settledMicroUsd: 0 });
  expect(dupeHttp).toHaveBeenCalledTimes(1);
});

it.each(["cost-conflict", "route-mismatch", "metadata-unavailable"] as const)("stops on %s, preserving known charges and holding only unresolved costs", async reason => {
  const directory = temporaryDirectory(), raw = JSON.stringify(await issued(directory));
  const http = transport(undefined, id => reason === "metadata-unavailable" ? new Response(null, { status: 403 }) : Response.json({ data: {
    id, model: qualification.receiptRoute.generationModel, native_tokens_prompt: 100, native_tokens_completion: 20, total_cost: reason === "cost-conflict" ? 0.000008 : 0.000007,
    provider_name: reason === "route-mismatch" ? "other" : qualification.receiptRoute.providerName,
    provider_responses: [{ status: 200, endpoint_id: qualification.receiptRoute.endpointId }],
  } }));
  const conflict = reason === "cost-conflict";
  expect(await collect(raw, directory, http)).toMatchObject({ status: conflict ? "held" : "stopped", reason, requestsSent: 1,
    heldMicroUsd: conflict ? 72_960 : 0, settledMicroUsd: conflict ? 0 : 7, quality: null });
  const row = inspectDb(directory, "SELECT * FROM attempts")[0]!;
  expect(row).toMatchObject({ state: conflict ? "held" : "settled", actual_micro_usd: conflict ? null : 7, raw_content_json: JSON.stringify(docContent(0)) });
  expect(JSON.parse(String(row.audit_json))).toMatchObject({ status: reason });
  if (reason === "metadata-unavailable") expect(JSON.parse(String(row.audit_json)).metadataLookups)
    .toMatchObject([{ httpStatus: 403, outcome: "http-status" }]);
  if (reason === "cost-conflict") expect(JSON.parse(String(row.audit_json)).conflictingCostsUsd).toEqual({ chat: "0.000007", generation: "0.000008" });
  await expect(collect(raw, directory, http)).rejects.toThrow("supplement-run-unavailable");
  if (conflict) await expect(collect(JSON.stringify(await issued(directory, "new-grant")), directory, http)).rejects.toThrow("supplement-run-unavailable");
  expect(http).toHaveBeenCalledTimes(2);
});

it("stops before the next reservation when a smaller issued budget cannot cover it", async () => {
  const directory = temporaryDirectory(), grant = await issued(directory), http = transport();
  grant.authorization.totalBudgetMicroUsd = 72_966;
  expect(await collect(JSON.stringify(grant), directory, http)).toMatchObject({
    requestsSent: 1, reason: "budget-exhausted", settledMicroUsd: 7, heldMicroUsd: 0, quality: null,
  });
  expect(inspectDb(directory, "SELECT * FROM attempts")).toHaveLength(1);
  expect(http).toHaveBeenCalledTimes(2);
});
it("honors the separate one-GET scope even when a 404 would otherwise be retried", async () => {
  const directory = temporaryDirectory(), grant = await issued(directory);
  const http = transport(undefined, () => new Response(null, {status:404}));
  expect(await collect(JSON.stringify(grant), directory, http)).toMatchObject({ status:"stopped", reason:"metadata-unavailable", requestsSent:1 });
  const row = inspectDb(directory, "SELECT audit_json FROM attempts")[0]!;
  expect(JSON.parse(String(row.audit_json))).toMatchObject({metadataAttempts:1, metadataLookups:[{httpStatus:404,outcome:"http-status"}]});
  expect(http).toHaveBeenCalledTimes(2);
});

it("fails quality on malformed unedited content with a verified bill and never retries the inference", async () => {
  const directory = temporaryDirectory(), http = transport(i => chat(i, "gen-fixture-" + i, i ? docContent(i) : " {broken"));
  const result = await collect(JSON.stringify(await issued(directory)), directory, http);
  expect(result).toMatchObject({ status: "quality-failed", reason: "quality-threshold-failed", requestsSent: 6, heldMicroUsd: 0, settledMicroUsd: 42, quality: { passed: false } });
  expect(inspectDb(directory, "SELECT raw_content_json, state FROM attempts ORDER BY rowid LIMIT 1")[0])
    .toEqual({ raw_content_json: JSON.stringify(" {broken"), state: "settled" });
});

it("rechecks the window at transport handoff and blocks metadata after expiry or a clock rollback", async () => {
  for (const after of ["2026-11-04T10:00:00Z", "2026-11-04T08:09:59Z"]) {
    const directory = temporaryDirectory(), raw = JSON.stringify(await issued(directory)), http = transport();
    const opts = { ...options(directory, http), now: () => http.mock.calls.length ? new Date(after) : now() };
    const result = await collector.collectSupplementRun(raw, environment(raw), opts);
    expect(result).toMatchObject({ status: "stopped", reason: after.includes("T10:") ? "authorization-expired" : "authorization-clock-rollback", requestsSent: 1, settledMicroUsd: 7, heldMicroUsd: 0 });
    expect(http).toHaveBeenCalledTimes(1);
  }
});

it("releases a durably reserved but unsent case if the window closes between reservation and POST", async () => {
  const directory = temporaryDirectory(), raw = JSON.stringify(await issued(directory)), http = transport();
  const opts = { ...options(directory, http), now: () => inspectDb(directory, "SELECT 1 FROM attempts").length ? new Date("2026-11-04T10:00:00Z") : now() };
  expect(await collector.collectSupplementRun(raw, environment(raw), opts)).toMatchObject({
    status: "stopped", reason: "authorization-expired", requestsSent: 0, settledMicroUsd: 0, heldMicroUsd: 0,
  });
  expect(inspectDb(directory, "SELECT state,sent_at FROM attempts")).toEqual([{ state: "released", sent_at: null }]);
  expect(http).not.toHaveBeenCalled();
});

it("retains an attributable charge when capture persistence fails and stops before another request", async () => {
  const directory = temporaryDirectory(), raw = JSON.stringify(await issued(directory));
  const http = transport(i => {
    const db = new DatabaseSync(join(directory, "ledger.sqlite"));
    try { db.exec("CREATE TRIGGER break_capture BEFORE UPDATE OF raw_content_json ON attempts BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END"); }
    finally { db.close(); }
    return chat(i, "gen-fixture-" + i);
  });
  expect(await collect(raw, directory, http)).toMatchObject({ requestsSent: 1, reason: "capture-failed", status: "stopped", heldMicroUsd: 0, settledMicroUsd: 7, quality: null });
  await expect(collect(raw, directory, http)).rejects.toThrow("supplement-run-unavailable");
  expect(http).toHaveBeenCalledTimes(1);
});

it("refuses coordinated substitutions of endpoint, model, route, receipt identity or reviewed rates in public settings", async () => {
  for (const change of [
    { endpoint: "https://substitute.invalid/v1/chat/completions" }, { model: "another-model" },
    { routingPolicy: { ...routingPolicy, providerOrder: ["alternate"] } }, { priceVersion: "2026.11.4" },
    { providerPolicyId: "different-policy" },
  ]) {
    await expect(collector.inspectSupplementSettings({ config: { ...config, ...change }, qualification: { ...qualification, ...change } }))
      .rejects.toThrow("invalid-supplement-configuration");
  }
  for (const change of [{ inputMicroUsdPerMillionTokens: 1 }, { outputMicroUsdPerMillionTokens: 1 },
    { receiptRoute: { ...qualification.receiptRoute, endpointId: "other" } },
    { receiptRoute: { ...qualification.receiptRoute, generationModel: undefined } },
    { receiptRoute: { ...qualification.receiptRoute, generationModel: "moonshotai/kimi-k3.1-pro-20261024" } }]) {
    await expect(collector.inspectSupplementSettings({ config, qualification: { ...qualification, ...change } })).rejects.toThrow("invalid-supplement-configuration");
  }
});

it("holds the full reservation when neither side supplies an attributable charge, without GET or POST retries", async () => {
  const directory = temporaryDirectory(), raw = JSON.stringify(await issued(directory));
  const http = transport(i => Response.json({ id: "gen-unpriced", model: config.model, choices: [{ message: { content: docContent(i) } }] }),
    () => new Response(null, { status: 503 }));
  expect(await collect(raw, directory, http)).toMatchObject({ status: "held", requestsSent: 1, heldMicroUsd: 72_960, settledMicroUsd: 0, quality: null });
  expect(http).toHaveBeenCalledTimes(2);
});

it.each(["metadata-only", "same-micro-conflict"] as const)("checkpoints %s billing evidence before a failed final state transition", async kind => {
  const directory = temporaryDirectory(), grant = await issued(directory), raw = JSON.stringify(grant);
  const db = new DatabaseSync(join(directory, "ledger.sqlite"));
  try { db.exec("CREATE TRIGGER break_final BEFORE UPDATE OF state ON attempts BEGIN SELECT RAISE(ABORT,'final transition unavailable'); END"); }
  finally { db.close(); }
  const conflict = kind === "same-micro-conflict", id = "gen-billing-evidence";
  const http = transport(i => Response.json({ id, model: config.model, usage: { prompt_tokens: 100, completion_tokens: 20,
    ...(conflict ? { cost: 0.0000071 } : {}) }, choices: [{ message: { content: docContent(i) } }] }), receipt => Response.json({ data: {
    id: receipt, model: qualification.receiptRoute.generationModel, native_tokens_prompt: 100, native_tokens_completion: 20, total_cost: conflict ? 0.0000074 : 0.000009,
    provider_name: qualification.receiptRoute.providerName, provider_responses: [{ status: 200, endpoint_id: qualification.receiptRoute.endpointId }],
  } }));
  await expect(collect(raw, directory, http)).rejects.toThrow("final transition unavailable");
  const row = inspectDb(directory, "SELECT * FROM attempts")[0]!, reason = conflict ? "cost-conflict" : "usage-mismatch";
  expect(row).toMatchObject({ state: "reserved", reserved_micro_usd: 72_960, actual_micro_usd: conflict ? null : 9,
    reason, receipt_id: id, raw_content_json: JSON.stringify(docContent(0)) });
  expect(JSON.parse(String(row.chat_json))).toMatchObject({ receiptId: id, actualMicroUsd: conflict ? 7 : null });
  expect(JSON.parse(String(row.audit_json))).toMatchObject({ status: reason, metadataMicroUsd: conflict ? 7 : 9, costEvidenceVersion: "wire-decimal-v1",
    ...(conflict ? { conflictingCostsUsd: { chat: "0.0000071", generation: "0.0000074" } } : {}) });
  expect(inspectDb(directory, "SELECT status FROM collection_runs")).toEqual([{ status: "collecting" }]);
  const reopened = ledger.openSupplementLedger(directory, grant.authorization.runId, grant.authorization.ledgerSha256);
  try { expect(reopened.totals()).toEqual({ requestsSent: 1, settledMicroUsd: 0, heldMicroUsd: 72_960 }); }
  finally { reopened.close(); }
  await expect(collect(JSON.stringify(await issued(directory, "fresh-run")), directory, http)).rejects.toThrow("supplement-run-unavailable");
  expect(http.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET"]);
});

it("holds a success-looking 202 POST without freezing provisional output or looking up its generation", async () => {
  const directory = temporaryDirectory(), raw = JSON.stringify(await issued(directory));
  const http = transport(i => new Response(chat(i, "gen-provisional-" + i).body, { status: 202 }));
  expect(await collect(raw, directory, http)).toMatchObject({ reason: "invalid-receipt", status: "held", requestsSent: 1, settledMicroUsd: 0, heldMicroUsd: 72_960, quality: null });
  expect(inspectDb(directory, "SELECT raw_content_json,receipt_id,actual_micro_usd FROM attempts"))
    .toEqual([{ raw_content_json: null, receipt_id: null, actual_micro_usd: null }]);
  expect(http.mock.calls.map(([, init]) => init?.method)).toEqual(["POST"]);
});

it("binds the issuance to the registered durable ledger and path, rejecting a missing, copied or replacement database", async () => {
  const directory = temporaryDirectory(), raw = JSON.stringify(await issued(directory)), missing = temporaryDirectory();
  const http = transport();
  const keyRead = vi.fn(() => credential);
  const env = Object.defineProperty(environment(raw), "ARC_SUPPLEMENT_PROVIDER_API_KEY", { get: keyRead });
  await expect(collector.collectSupplementRun(raw, env, options(missing, http))).rejects.toThrow();
  expect(keyRead).not.toHaveBeenCalled();
  expect(existsSync(join(missing, "ledger.sqlite"))).toBe(false);
  copyFileSync(join(directory, "ledger.sqlite"), join(missing, "ledger.sqlite"));
  await expect(collect(raw, missing, http)).rejects.toThrow();
  rmSync(join(directory, "ledger.sqlite"));
  ledger.registerSupplementLedger(directory);
  await expect(collect(raw, directory, http)).rejects.toThrow();
  expect(http).not.toHaveBeenCalled();
});

it("persists only validated public issuance fields even when a shadowed JSON value contains the fixture credential", async () => {
  const directory = temporaryDirectory(), http = transport(), grant = await issued(directory);
  grant.authorization.totalBudgetMicroUsd = 72_960;
  const raw = JSON.stringify(grant).replace('"runId":', '"runId":"' + credential + '","runId":');
  expect(await collect(raw, directory, http)).toMatchObject({ requestsSent: 1, settledMicroUsd: 7 });
  const record = inspectDb(directory, "SELECT issuance_sha256,issuance_json FROM collection_runs")[0]!;
  expect(record.issuance_sha256).toBe(sha(raw));
  expect(String(record.issuance_json)).not.toContain(credential);
});

it("refuses a second simultaneous start and a failed durable reservation never reaches transport", async () => {
  const directory = temporaryDirectory(), raw = JSON.stringify(await issued(directory)), concurrent = transport();
  let rejected = false, i = 0;
  const http = vi.fn<DocumentFetch>(async (url, init) => {
    if (init?.method !== "POST") return generation(new URL(String(url)).searchParams.get("id")!);
    if (i === 0) {
      try { await collect(raw, directory, concurrent); } catch { rejected = true; }
    }
    return chat(i, "gen-original-" + i++);
  });
  expect(await collect(raw, directory, http)).toMatchObject({ status: "complete" });
  expect(rejected).toBe(true);
  const db = new DatabaseSync(join(directory, "ledger.sqlite"));
  try { db.exec("CREATE TRIGGER break_reserve BEFORE INSERT ON attempts BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END"); }
  finally { db.close(); }
  const next = JSON.stringify(await issued(directory, "next-grant"));
  await expect(collect(next, directory, concurrent)).rejects.toThrow();
  expect(concurrent).not.toHaveBeenCalled();
  await expect(collect(next, directory, concurrent)).rejects.toThrow("supplement-run-unavailable");
});
