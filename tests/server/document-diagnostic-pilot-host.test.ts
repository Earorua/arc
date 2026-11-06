// @vitest-environment node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { inspectDiagnosticPilotScope, runDocumentDiagnosticPilot } from "../../scripts/materials-qualification-runner";
import type { DocumentFetch } from "../../worker/document-executor/provider-http";
import { inspectDiagnosticPilotSourceManifest, inspectRegisteredDiagnosticPilot } from "../../scripts/materials-diagnostic-pilot-host";

const state = vi.hoisted(() => ({ testHome: "" }));
vi.mock("node:os", async original => {
  const os = await original<typeof import("node:os")>();
  return { ...os, homedir: () => state.testHome, userInfo: () => ({ ...os.userInfo(), homedir: state.testHome }) };
});
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const hex = sha("offline-evidence"), runId = "materials-b2-diagnostic-pilot-host-fixture";
const fixtureKey = "synthetic-fixture-for-host-test";
const roots: string[] = [];
function isolatedDirectory() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "arc-pilot-host-fixture-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (dirname(realpathSync(root)) !== realpathSync(tmpdir())) throw new Error("unexpected-temporary-directory");
    rmSync(root, { recursive: true, force: true });
  }
  state.testHome = "";
  vi.unstubAllGlobals();
});

it("rejects apparently valid live settings without a restricted host record before any checkpoint or transport", async () => {
  state.testHome = isolatedDirectory();
  const now = Date.now(), scope = await inspectDiagnosticPilotScope();
  const raw = JSON.stringify({ runId, authorization: { id: "fixture-approval", runId, mode: "authorized-live", scope,
    approvedAt: new Date(now - 10_000).toISOString(), expiresAt: new Date(now + 120_000).toISOString(),
    candidateCommit: "a".repeat(40), sourceBundleSha256: hex, preflightSha256: hex, credentialSha256: sha(fixtureKey), totalBudgetMicroUsd: 300_000 } });
  const network = vi.fn<DocumentFetch>(), checkpoint = vi.fn(async () => {});
  vi.stubGlobal("fetch", network);
  await expect(runDocumentDiagnosticPilot({ ARC_DOCUMENT_PILOT_ENABLED: "true", ARC_DOCUMENT_PILOT_SETTINGS: raw,
    ARC_DOCUMENT_PILOT_PROVIDER_API_KEY: fixtureKey, ARC_DOCUMENT_PILOT_ISSUANCE_SHA256: sha(raw) },
  { mode: "authorized-live", fetch: network, checkpoint })).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
  expect(checkpoint).not.toHaveBeenCalled();
});

function fixtureGit(root: string, ...args: string[]) {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=Offline Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgSign=false", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_ALLOW_PROTOCOL: "" } }).trim();
}
function restrictFixtureRegistry(path: string) {
  if (process.platform !== "win32") return;
  const command = `$ErrorActionPreference='Stop'
$id=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl=[System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($id); $acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
[IO.Directory]::SetAccessControl($env:ARC_FIXTURE_PILOT_REGISTRY,$acl)`;
  execFileSync(join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", command], {
    env: { ...process.env, ARC_FIXTURE_PILOT_REGISTRY: path }, windowsHide: true, stdio: "ignore",
  });
}
async function registeredFixture() {
  const parent = isolatedDirectory(), checkout = join(parent, "checkout"), registry = join(parent, "private-registry");
  mkdirSync(checkout); mkdirSync(registry, { mode: 0o700 });
  restrictFixtureRegistry(registry);
  const locations = { checkout, cwd: checkout, registry };
  const git = (...args: string[]) => fixtureGit(checkout, ...args);
  git("init", "--quiet", "--template=");
  mkdirSync(join(checkout, "src")); mkdirSync(join(checkout, "docs"));
  const productPath = join(checkout, "src", "product.ts"), product = "export const fixture = 1;\n";
  writeFileSync(productPath, product);
  git("add", "src/product.ts"); git("commit", "-qm", "synthetic product");
  const candidateCommit = git("rev-parse", "HEAD"), candidateTree = git("rev-parse", "HEAD^{tree}");
  const manifest = { version: 1, candidateCommit, candidateTree, files: [{ path: "src/product.ts", sha256: sha(product) }] };
  expect(await inspectDiagnosticPilotSourceManifest(checkout, candidateCommit)).toEqual(manifest);
  writeFileSync(join(checkout, "docs", "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(checkout, "docs", "packet.md"), "Synthetic public packet");
  writeFileSync(join(checkout, "docs", "preflight.json"), '{"synthetic":true}');
  git("bundle", "create", "docs/source.bundle", "HEAD");
  git("add", "docs"); git("commit", "-qm", "synthetic docs-only packet");
  const attachment = (path: string) => ({ path, sha256: sha(readFileSync(join(checkout, path))) });
  const now = Date.now(), approvedAt = new Date(now - 5_000).toISOString(), expiresAt = new Date(now + 600_000).toISOString();
  const privateDirectory = join(registry, runId), readbackPath = join(privateDirectory, "account-readback.json");
  mkdirSync(privateDirectory, { mode: 0o700 });
  const readback = { runId, checkedAt: new Date(now).toISOString(), creditBalanceMicroUsd: 291_840, keyRemainingMicroUsd: 291_840,
    workspaceKeyMatched: true, strictZdrAssigned: true, safetyRetentionAllowed: false, inputOutputLogging: false, trainingEnabled: false,
    publicPrompts: false, traceDestinations: 0, responseCacheOptIn: false, moonshotByok: false, implicitCacheScope: "four-synthetic-documents" };
  writeFileSync(readbackPath, JSON.stringify(readback), { mode: 0o600 });
  const record = { version: 1, status: "owner-approved", purpose: "materials-b2-diagnostic-pilot-v1", runId, authorizationId: "fixture-approval",
    approvedAt, expiresAt, ownerReplySha256: sha("synthetic owner decision"), settingsSha256: hex, accountReadbackSha256: sha(JSON.stringify(readback)), workingDirectory: checkout,
    ledgerDirectory: join(checkout, "work", "materials-diagnostic-pilot", runId), candidateCommit, candidateTree, packetCommit: git("rev-parse", "HEAD"),
    packet: attachment("docs/packet.md"), preflight: attachment("docs/preflight.json"), sourceBundle: attachment("docs/source.bundle"),
    sourceManifest: attachment("docs/manifest.json") };
  const recordPath = join(registry, runId + ".pilot-issued.json"), marker = join(registry, runId + ".pilot-used");
  const save = (value: unknown) => writeFileSync(recordPath, JSON.stringify(value), { mode: 0o600 });
  save(record);
  const grant = { runId, authorizationId: record.authorizationId, approvedAt, expiresAt, settingsSha256: hex, candidateCommit,
    sourceBundleSha256: record.sourceBundle.sha256, preflightSha256: record.preflight.sha256 };
  return { parent, locations, record, recordPath, readbackPath, readback, save, grant, marker, git, productPath, product };
}

it("keeps readiness read-only, atomically claims one global launch, and preserves an interrupted ledger across checkouts", async () => {
  const f = await registeredFixture();
  const first = await inspectRegisteredDiagnosticPilot(f.locations, f.grant);
  const second = await inspectRegisteredDiagnosticPilot(f.locations, f.grant);
  expect(existsSync(f.marker)).toBe(false); expect(existsSync(f.record.ledgerDirectory)).toBe(false);
  const attempts = await Promise.allSettled([first(), second()]);
  const wins = attempts.filter(a => a.status === "fulfilled");
  expect(wins).toHaveLength(1);
  const journal = wins[0]!.value;
  await journal.checkpoint({ type: "reservation", runId, documentId: "resume-01", state: "held-unknown", reservedMicroUsd: 72_960, timestamp: new Date().toISOString() });
  const ledger = join(journal.directory, "ledger.jsonl"), original = readFileSync(ledger);
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  const other = join(f.parent, "second-checkout");
  f.git("worktree", "add", "--detach", other, "HEAD");
  const locations = { ...f.locations, checkout: other, cwd: other };
  await expect(inspectRegisteredDiagnosticPilot(locations, f.grant)).rejects.toThrow();
  // Even an issuer record repointed to the other checkout cannot spend this host-global run ID twice.
  const nextLedger = join(other, "work", "materials-diagnostic-pilot", runId);
  f.save({ ...f.record, workingDirectory: other, ledgerDirectory: nextLedger });
  await expect(inspectRegisteredDiagnosticPilot(locations, f.grant)).rejects.toThrow();
  expect(readFileSync(ledger)).toEqual(original);
  expect(existsSync(nextLedger)).toBe(false);
}, 40_000);

it("requires pinned private budget and privacy evidence checked since this approval and before launch", async () => {
  const f = await registeredFixture();
  f.save({ ...f.record, accountReadbackSha256: undefined });
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  f.save({ ...f.record, accountReadbackSha256: sha("no matching readback") });
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  for (const change of [
    { creditBalanceMicroUsd: 291_839 }, { keyRemainingMicroUsd: 291_839 },
    { checkedAt: new Date(Date.parse(f.record.approvedAt) - 1).toISOString() }, { checkedAt: f.record.expiresAt },
    { runId: runId + "-other" }, { strictZdrAssigned: false }, { inputOutputLogging: true }, { traceDestinations: 1 },
    { implicitCacheScope: "all-documents" }, { workspaceKeyMatched: false },
  ]) {
    const raw = JSON.stringify({ ...f.readback, ...change });
    writeFileSync(f.readbackPath, raw);
    f.save({ ...f.record, accountReadbackSha256: sha(raw) });
    await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  }
  expect(existsSync(f.marker)).toBe(false);
  expect(existsSync(f.record.ledgerDirectory)).toBe(false);
}, 40_000);

it("rejects substituted owner pins, output paths, public attachments, candidate tree and byte manifest", async () => {
  const f = await registeredFixture();
  const changes = [
    { purpose: "full-qualification" }, { authorizationId: "wrong-id" }, { settingsSha256: sha("wrong") }, { candidateTree: "1".repeat(40) },
    { packetCommit: f.record.candidateCommit }, { workingDirectory: f.parent }, { ledgerDirectory: join(f.parent, "other-ledger") },
    { packet: { ...f.record.packet, sha256: sha("changed packet") } }, { preflight: { ...f.record.preflight, sha256: sha("changed preflight") } },
    { sourceBundle: { ...f.record.sourceBundle, sha256: sha("changed bundle") } }, { sourceManifest: { path: "docs/../src/product.ts", sha256: sha(f.product) } },
  ];
  for (const change of changes) {
    f.save({ ...f.record, ...change });
    await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  }
  f.save(f.record);
  await expect(inspectRegisteredDiagnosticPilot({ ...f.locations, cwd: f.parent }, f.grant)).rejects.toThrow();
  writeFileSync(join(f.locations.checkout, f.record.sourceManifest.path), '{"version":1,"files":[]}');
  f.git("add", "docs/manifest.json"); f.git("commit", "-qm", "synthetic incomplete manifest");
  f.save({ ...f.record, packetCommit: f.git("rev-parse", "HEAD"),
    sourceManifest: { path: f.record.sourceManifest.path, sha256: sha('{"version":1,"files":[]}') } });
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  expect(existsSync(f.marker)).toBe(false);
  expect(existsSync(f.record.ledgerDirectory)).toBe(false);
}, 40_000);

it("checks actual source bytes despite assume-unchanged and rejects untracked code and linked source ancestors", async () => {
  const f = await registeredFixture();
  const outsideRecord = join(f.parent, "aliased-owner-record.json");
  linkSync(f.recordPath, outsideRecord);
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  unlinkSync(outsideRecord);
  f.git("update-index", "--assume-unchanged", "src/product.ts");
  writeFileSync(f.productPath, f.product.replace("1", "2"));
  f.git("diff", "--quiet");
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  writeFileSync(f.productPath, f.product);
  const extra = join(f.locations.checkout, "src/product.js");
  writeFileSync(extra, "unreviewed");
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  f.git("add", "src/product.js");
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  f.git("reset", "--quiet", "HEAD", "--", "src/product.js");
  mkdirSync(join(f.locations.checkout, ".git", "info"), { recursive: true });
  writeFileSync(join(f.locations.checkout, ".git", "info", "exclude"), "src/product.js\n");
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  unlinkSync(extra);
  const outside = join(f.parent, "other-source");
  mkdirSync(outside);
  writeFileSync(join(outside, "product.ts"), f.product);
  unlinkSync(f.productPath); rmdirSync(dirname(f.productPath)); symlinkSync(outside, dirname(f.productPath), "junction");
  await expect(inspectRegisteredDiagnosticPilot(f.locations, f.grant)).rejects.toThrow();
  expect(existsSync(f.marker)).toBe(false);
}, 40_000);
