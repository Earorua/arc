// @vitest-environment node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as operator from "../../scripts/materials-current-quality-operator";
import draft from "../../docs/verification/materials-quality-next/request-draft/manifest.json";
import { fixtureGenerationResponse } from "../helpers/document-generation-response";
import { registerSupplementLedger } from "../../scripts/materials-supplement-ledger";
import { inspectSupplementSettings } from "../../scripts/collect-materials-supplements";
import { DatabaseSync } from "node:sqlite";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const now = () => new Date("2026-11-19T10:05:00.000Z");
const digest = "a".repeat(64), attachment = { path: "fixture.json", sha256: digest };
const runtimeModulePaths = [
  "docs/verification/materials-quality-next/current-references.mjs",
  "docs/verification/materials-quality-next/current-captures.ts",
  "docs/verification/materials-quality-next/current-adapter.ts",
];
const account = { creatorUserId: "fixture-owner", organizationId: null, workspaceId: "fixture-workspace" };
const approval = (): ReturnType<typeof operator.readCurrentApproval> => ({ version: "materials-current-quality-v1", status: "owner-approved", packetId: "fixture-current-quality",
  candidateCommit: "b".repeat(40), packetCommit: "c".repeat(40), approvedAt: "2026-11-19T10:00:00.000Z", expiresAt: "2026-11-19T12:00:00.000Z",
  credentialSha256: sha("synthetic-current-operator-key"), ownerApproval: attachment, accountReadback: attachment,
  sourceManifest: { path: "docs/fixture-source.json", sha256: digest },
  attachments: [...runtimeModulePaths.map(path => ({ path, sha256: digest })), { path: "docs/fixture-review.json", sha256: digest }],
  qualification: { runId: "fixture-24", authorizationId: "fixture-grant-24", issuance: attachment },
  supplement: { runId: "fixture-six", authorizationId: "fixture-grant-six", issuance: attachment },
  requestDraftSha256: "06238bde3fbc45aa33efb38da95234cfbb74d34d162bf1941d9ac0c56c964ac7",
  totalBudgetMicroUsd: 2_450_000, maxMetadataReadsPerDocument: 3 });
const credits = () => ({ version: "materials-current-account-readback-v1", reviewedBy: "independent-fixture-review",
  capturedAt: "2026-11-19T10:02:00.000Z", account, credentialSha256: approval().credentialSha256,
  source: "openrouter-credits-ui", precision: "whole-dollar-lower-bound", displayedUsd: "4.22", evidence: attachment,
  strictZdrAssigned: true, safetyRetentionAllowed: false, inputOutputLogging: false, trainingEnabled: false,
  publicPrompts: false, traceDestinations: 0, responseCacheOptIn: false, moonshotByok: false,
  implicitCacheScope: "thirty-synthetic-documents" });
const budget = () => ({ scope: "key_limit", guardrail_id: null, budget_id: null, limit_usd: 3,
  spend_usd: 0.547151, remaining_usd: 2.452849, reset_interval: null, resets_at: null, include_byok: false });
const keyReply = () => ({ data: { creator_user_id: account.creatorUserId, organization_id: null, workspace_id: account.workspaceId,
  limit: 3, usage: 0.547151, limit_remaining: 2.452849, limit_reset: null, byok_usage: 0, include_byok_in_limit: false,
  is_free_tier: false, is_management_key: false, is_provisioning_key: false, allowed_data_regions: ["global"],
  budgets: [budget()], effective_budget: budget(), expires_at: null } });
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    const target = realpathSync(directory);
    if (dirname(target) !== realpathSync(tmpdir()) || !basename(target).startsWith("arc-current-operator-")) throw new Error("unexpected fixture directory");
    rmSync(target, { recursive: true, force: true });
  }
});

it("requires externally pinned fresh approval without issuing or extending it", () => {
  const raw = JSON.stringify(approval());
  expect(operator.readCurrentApproval(raw, sha(raw), now())).toMatchObject({ packetId: "fixture-current-quality" });
  expect(() => operator.readCurrentApproval(raw, digest, now())).toThrow();
  expect(() => operator.readCurrentApproval(raw, sha(raw), new Date("2026-11-19T12:00:00Z"))).toThrow();
  const changed = JSON.stringify({ ...approval(), expiresAt: "2026-11-19T12:01:00Z" });
  expect(() => operator.readCurrentApproval(changed, sha(changed), now())).toThrow();
});

it("requires every exact current runtime attachment once and rejects all duplicate paths", () => {
  const complete = approval();
  const read = (attachments: typeof complete.attachments) => {
    const raw = JSON.stringify({ ...complete, attachments });
    return operator.readCurrentApproval(raw, sha(raw), now());
  };
  expect(read(complete.attachments).attachments).toEqual(complete.attachments);
  for (const missing of runtimeModulePaths)
    expect.soft(() => read(complete.attachments.filter(file => file.path !== missing)), missing).toThrow();
  for (const duplicate of [complete.attachments[0]!, complete.attachments.at(-1)!])
    expect.soft(() => read([...complete.attachments, duplicate]), duplicate.path).toThrow();
});

it("preflights the frozen six issuance settings and exact request scope before the first phase", async () => {
  const config = draft.configurations.supplement.config;
  const qualification = { ...draft.configurations.supplement.qualification, qualified: true };
  const scope = await inspectSupplementSettings({ config, qualification });
  // Expired, in-memory fixture with no real ledger, credential or candidate commit.
  const issued = { config, qualification, authorization: {
    purpose: scope.purpose, runId: "fixture-preflight-six", id: "fixture-preflight-grant", issuedBy: "fixture-issuer",
    candidateCommit: "b".repeat(40), credentialSha256: sha("synthetic-current-preflight-key"), ledgerSha256: digest,
    corpusSha256: scope.corpusSha256, documents: scope.documents, configurationSha256: scope.configurationSha256,
    outputSchemaVersion: scope.outputSchemaVersion, approvedAt: "2026-11-01T08:00:00Z", expiresAt: "2026-11-01T10:00:00Z",
    maxRequests: 6, perRequestMicroUsd: 75_000, totalBudgetMicroUsd: 450_000, maxMetadataReadsPerDocument: 3,
  } };
  const inspect = (value: unknown) => {
    const raw = JSON.stringify(value); return operator.inspectCurrentSupplementIssuance(raw, sha(raw));
  };
  await expect(inspect(issued)).resolves.toMatchObject({ supplement: issued, six: {
    reservationMicroUsd: 72_960, perRequestMicroUsd: 75_000,
    documents: draft.records.filter(row => row.group === "supplement")
      .map(({ documentId, documentVersionId, textVersionId }) => ({ documentId, documentVersionId, textVersionId })),
  } });
  for (const change of [
    { documents: [...scope.documents].reverse() },
    { documents: scope.documents.map((doc, index) => index ? doc : { ...doc, textVersionId: "stale-text" }) },
    { perRequestMicroUsd: 74_000 }, { purpose: "different-purpose" }, { outputSchemaVersion: "2026.11.9" },
  ]) await expect.soft(inspect({ ...issued, authorization: { ...issued.authorization, ...change } })).rejects.toThrow();
});

it("checks installed runtime resolution before any current or nested scorer evaluation", () => {
  for (const alternate of [null, "materials-quality-next/current-references.mts", "materials-quality-v2/candidate-course.mts"]) {
    const directory = mkdtempSync(join(tmpdir(), "arc-current-operator-")); directories.push(directory);
    const write = (path: string, source: string) => {
      const target = join(directory, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, source);
    };
    write("package.json", '{"type":"module"}');
    write("scripts/materials-current-quality-runtime.ts", "");
    copyFileSync("scripts/materials-current-quality-runtime.ts", join(directory, "scripts/materials-current-quality-runtime.ts"));
    const mark = (name: string) => `globalThis.fixtureEvaluated.push(${JSON.stringify(name)});\n`;
    const docs = "docs/verification/";
    write(`${docs}materials-quality-next/current-captures.ts`, mark("captures")
      + 'export const readQualificationCaptures = () => "pinned-ts-captures"; export const readSupplementCaptures = () => "six";');
    write(`${docs}materials-quality-next/current-references.mjs`, mark("references")
      + 'export const loadCurrentReviewedReferences = () => "pinned-mjs-references";');
    write(`${docs}materials-quality-next/current-adapter.ts`,
      'import { value } from "../materials-quality-v2/candidate-course.mjs"; import { loadCurrentReviewedReferences } from "./current-references.mjs";\n'
      + mark("adapter") + 'export const evaluateCurrentQuality = () => value + ":" + loadCurrentReviewedReferences();');
    for (const name of ["common", "input", "source", "course"])
      write(`${docs}materials-quality-v2/candidate-${name}.mjs`, mark(`candidate-${name}`) + `export const value = "pinned-${name}";`);
    write(`${docs}materials-native-acceptance/verify-integrated-course-binding.mjs`, mark("integrated") + 'export const value = "integrated";');
    write(`${docs}materials-quality-v2/capture-course-reference.mjs`, mark("course-reference") + 'export const value = "course-reference";');
    if (alternate) write(`${docs}${alternate}`, mark("unpinned-alternate")
      + 'export const value = "alternate"; export const loadCurrentReviewedReferences = () => "alternate";');
    write("entry.ts", `globalThis.fixtureEvaluated = [];
try {
  const { loadCurrentQualityRuntime } = await import("./scripts/materials-current-quality-runtime.ts");
  const runtime = await loadCurrentQualityRuntime();
  console.log(JSON.stringify({ status: "loaded", evaluated: globalThis.fixtureEvaluated,
    captures: runtime.readQualificationCaptures(), adapter: runtime.evaluateCurrentQuality() }));
} catch (error) {
  console.log(JSON.stringify({ status: "refused", message: error.message, evaluated: globalThis.fixtureEvaluated }));
}`);
    const result = spawnSync(process.execPath, ["--import", "tsx", join(directory, "entry.ts")], { encoding: "utf8", windowsHide: true,
      timeout: 20_000, env: { NODE_ENV: "test", NODE_OPTIONS: process.env.NODE_OPTIONS, PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP } });
    expect(result.status).toBe(0); expect(result.stderr).toBe("");
    const observed = JSON.parse(result.stdout);
    if (alternate) expect.soft(observed, alternate).toEqual({ status: "refused", message: "current-runtime-resolution-mismatch", evaluated: [] });
    else expect(observed).toMatchObject({ status: "loaded", captures: "pinned-ts-captures", adapter: "pinned-course:pinned-mjs-references" });
  }
});

it("keeps reviewed Credits as a fresh conservative lower bound and key budgets exact", () => {
  expect(operator.readCurrentCredits(JSON.stringify(credits()), approval(), now())).toMatchObject({ minimumMicroUsd: 4_000_000 });
  for (const change of [{ displayedUsd: "2.99" }, { precision: "exact-usd" }, { capturedAt: "2026-11-19T09:00:00Z" },
    { credentialSha256: digest }, { source: "rounded-catalog-guess" }])
    expect(() => operator.readCurrentCredits(JSON.stringify({ ...credits(), ...change }), approval(), now())).toThrow();
  expect(operator.readCurrentKeyAllowance(JSON.stringify(keyReply()), account, 2_450_000, now())).toMatchObject({ minimumMicroUsd: 2_452_849 });
  const tight = JSON.stringify(keyReply()).replaceAll('"remaining_usd":2.452849', '"remaining_usd":2.44999999999999999999');
  expect(() => operator.readCurrentKeyAllowance(tight, account, 2_450_000, now())).toThrow();
  for (const change of [{ workspace_id: "different" }, { is_management_key: true }, { expires_at: "2026-11-19T10:00:00Z" },
    { budgets: [...keyReply().data.budgets, { ...budget(), scope: "workspace", remaining_usd: 0.5, spend_usd: 2.5 }] }])
    expect(() => operator.readCurrentKeyAllowance(JSON.stringify({ data: { ...keyReply().data, ...change } }), account, 2_450_000, now())).toThrow();
});

it("inspects an insufficient current key before approval without claiming funding or exposing its label", () => {
  const data = { ...keyReply().data, label: "must-not-be-retained", limit: 2, limit_remaining: 1.452849,
    budgets: [{ ...budget(), limit_usd: 2, remaining_usd: 1.452849 }], effective_budget: { ...budget(), limit_usd: 2, remaining_usd: 1.452849 } };
  const report = operator.inspectCurrentKeyReadback(JSON.stringify({ data }), now());
  expect(report).toMatchObject({ account, eligibleForProposedRun: false, reasons: ["insufficient-funds"],
    amounts: { limit: "2", remaining: "1.452849" }, minimumMicroUsd: 1_452_849 });
  expect(JSON.stringify(report)).not.toContain("must-not-be-retained");
  expect(JSON.stringify(report)).not.toContain("owner-approved");
});

it("reports only fixed actionable refusal reasons without upstream exception text", () => {
  expect(operator.operatorFailure(new Error("private-secret-from-upstream"), "key-readback"))
    .toMatchObject({ status: "refused", reason: "key-readback", message: expect.any(String) });
  expect(JSON.stringify(operator.operatorFailure(new Error("private-secret-from-upstream"), "key-readback"))).not.toContain("private-secret");
  const raw = JSON.stringify(approval());
  try { operator.readCurrentApproval(raw, sha(raw), new Date("2026-11-19T12:00:00Z")); }
  catch (error) { expect(operator.operatorFailure(error, "invalid-packet")).toMatchObject({ reason: "approval-window" }); }
});

it("refuses source, destination, body, clock and duplicate sends at the final handoff", async () => {
  const source = vi.fn(async () => {}), row = draft.records[0]!;
  const request = { documentId: row.documentId, url: draft.configurations["resume-jd"].config.endpoint,
    redirect: "manual" as const, bodySha256: row.requestBodySha256 };
  const guard = operator.createCurrentSendGuard(approval(), "resume-jd", source, now);
  expect(typeof guard).toBe("function");
  await guard!(request);
  expect(source).toHaveBeenCalledOnce();
  await expect(guard!(request)).rejects.toThrow();
  for (const change of [{ url: "https://other.invalid/chat/completions" }, { bodySha256: digest }, { redirect: "follow" as const }]) {
    const check = operator.createCurrentSendGuard(approval(), "resume-jd", source, now);
    await expect(check!({ ...request, ...change })).rejects.toThrow();
  }
  await expect(operator.createCurrentSendGuard(approval(), "resume-jd", async () => { throw Error("changed"); }, now)!(request)).rejects.toThrow();
  await expect(operator.createCurrentSendGuard(approval(), "resume-jd", source, () => new Date("2026-11-19T12:00:00Z"))!(request)).rejects.toThrow();
});

it("claims a distinct durable once-only startup slot for each existing run", async () => {
  const directory = mkdtempSync(join(tmpdir(), "arc-current-operator-")); directories.push(directory);
  await operator.claimCurrentSlot(directory, "fixture-24", digest);
  expect(existsSync(join(directory, "fixture-24.started"))).toBe(true);
  await expect(operator.claimCurrentSlot(directory, "fixture-24", digest)).rejects.toThrow();
  await operator.claimCurrentSlot(directory, "fixture-six", digest);
  expect(readFileSync(join(directory, "fixture-24.started"), "utf8")).not.toContain("synthetic-current-operator-key");
});

it("checks the existing six ledger identity and unresolved runs read-only before starting 24", () => {
  const directory = mkdtempSync(join(tmpdir(), "arc-current-operator-")); directories.push(directory);
  const ledgerSha256 = registerSupplementLedger(directory);
  expect(operator.inspectCurrentSupplementLedger(directory, ledgerSha256)).toBe(true);
  expect(() => operator.inspectCurrentSupplementLedger(directory, digest)).toThrow();
  const db = new DatabaseSync(join(directory, "ledger.sqlite"));
  try { db.prepare("INSERT INTO collection_runs VALUES(?,?,?,?,?,?,?,?)").run("prior-run", "prior-grant", digest, "{}", "offline-test", now().toISOString(), "held", null); }
  finally { db.close(); }
  expect(() => operator.inspectCurrentSupplementLedger(directory, ledgerSha256)).toThrow();
});

it("continues only after complete capture and settled receipts, retaining quality failures", () => {
  const documents = draft.records.filter(row => row.group === "resume-jd").map((row, index) => ({ documentId: row.documentId,
    accounting: "settled", actualMicroUsd: 7, receiptId: `fixture-${index}`, audit: { status: "verified" }, status: "failed" }));
  const result = { requestsSent: 24, heldMicroUsd: 0, settledMicroUsd: 168, stoppedReason: null, passed: false, documents };
  expect(operator.currentQualificationComplete(result, { complete: true })).toBe(true);
  expect(operator.currentQualificationComplete(result, { complete: false })).toBe(false);
  expect(operator.currentQualificationComplete({ ...result, heldMicroUsd: 72_960 }, { complete: true })).toBe(false);
  expect(operator.currentQualificationComplete({ ...result, stoppedReason: "capture-failed" }, { complete: true })).toBe(false);
});

it("wires the actual journal and capture while a later denial stops before the second paid handoff", async () => {
  const directory = mkdtempSync(join(tmpdir(), "arc-current-operator-")); directories.push(directory);
  const config = draft.configurations["resume-jd"].config;
  const qualification = { ...draft.configurations["resume-jd"].qualification, qualified: true };
  const settings = { runId: approval().qualification.runId, config, qualification, authorization: {
    id: approval().qualification.authorizationId, runId: approval().qualification.runId,
    endpoint: config.endpoint, model: config.model, provider: config.provider, providerPolicyId: config.providerPolicyId,
    priceVersion: config.priceVersion, routingPolicy: config.routingPolicy, receiptRoute: qualification.receiptRoute,
    inputMicroUsdPerMillionTokens: 2_000_000, outputMicroUsdPerMillionTokens: 10_000_000, maxRequests: 24,
    totalBudgetMicroUsd: 2_000_000, corpusSha256: "69e5ddd1005f12abf24483e10dd235629ef309ba3a84e922166963ccd9aed750",
    privacyEvidence: "https://openrouter.ai/docs/features/zdr", pricingEvidence: "https://openrouter.ai/moonshotai/kimi-k3.1-pro",
    approvedAt: approval().approvedAt, expiresAt: approval().expiresAt } };
  let postCount = 0, checks = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if (init?.method === "POST") { postCount++; return Response.json({ id: "fixture-current-receipt", model: config.model,
      provider: qualification.receiptRoute.providerName, usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.000007 },
      choices: [{ finish_reason: "stop", message: { content: "{invalid-output-retained" } }] }); }
    return fixtureGenerationResponse("fixture-current-receipt", config.model, qualification.receiptRoute);
  });
  const result = await operator.runCurrentQualificationFixture({ approval: approval(), directory, settings: JSON.stringify(settings),
    fetch, now, verifySource: async () => { if (++checks > 1) throw Error("source changed"); } });
  expect(result).toMatchObject({ result: { requestsSent: 1, heldMicroUsd: 0, settledMicroUsd: 7, stoppedReason: "operator-before-send-refused" } });
  expect(postCount).toBe(1);
  const capture = readFileSync(join(directory, "captures", approval().qualification.runId, "resume-01.json"), "utf8");
  expect(capture).toContain("{invalid-output-retained");
  expect(capture).not.toContain("synthetic-current-operator-key");
  const recorded = JSON.parse(readFileSync(join(directory, "qualification", approval().qualification.runId, "result.json"), "utf8"));
  expect(recorded).toMatchObject({ requestsSent: 1, stoppedReason: "operator-before-send-refused" });
});

it("provides a default read-only hidden-input launcher without a secret argument or transcript", () => {
  const path = "scripts/invoke-materials-current-quality.ps1";
  expect(existsSync(path)).toBe(true);
  const source = readFileSync(path, "utf8");
  expect(source).toContain("DefaultParameterSetName='Check'");
  expect(source).toContain("Read-Host 'Enter the dedicated materials key (hidden)' -AsSecureString");
  expect(source).toContain("$psi.Environment.Clear()");
  expect(source).toContain("$psi.CreateNoWindow=$true");
  expect(source).toContain("--inspect-account");
  expect(source).not.toMatch(/ArgumentList\.Add\(\$(?:rawKey|secureKey)|Start-Transcript|Write-(?:Host|Output).*\$(?:rawKey|secureKey)/u);
  const script = realpathSync(path).replaceAll("'", "''");
  const command = `$tokens=$null;$errors=$null;[Management.Automation.Language.Parser]::ParseFile('${script}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){exit 3};& '${script}' -CheckOnly -PacketId 'invalid!' -PacketSha256 'not-a-digest';Write-Output 'original-terminal-retained';exit $LASTEXITCODE`;
  const checked = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", windowsHide: true,
    env: { NODE_ENV: "test", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP } });
  expect(checked.status).toBe(2);
  expect(checked.stdout).toContain("original-terminal-retained");
  expect(checked.stdout).toContain("refused or stopped");
  expect(checked.stdout).not.toContain("Enter the dedicated materials key");
});
