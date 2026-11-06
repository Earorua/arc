import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { materialDigestSchema, materialIdSchema, materialTimestampSchema } from "../app/contracts/documents";
import { assertNoLinks, inside, safeRelative } from "./lib/restricted-candidate-files.mjs";
import { createQualificationJournal } from "./materials-qualification-journal";

const purpose = "materials-b2-diagnostic-pilot-v1";
const commit = z.string().regex(/^[0-9a-f]{40}$/u);
const attachment = z.strictObject({ path: z.string().max(1024).startsWith("docs/"), sha256: materialDigestSchema });
const recordSchema = z.strictObject({
  version: z.literal(1), status: z.literal("owner-approved"), purpose: z.literal(purpose),
  runId: materialIdSchema, authorizationId: materialIdSchema, approvedAt: materialTimestampSchema, expiresAt: materialTimestampSchema,
  ownerReplySha256: materialDigestSchema, settingsSha256: materialDigestSchema, accountReadbackSha256: materialDigestSchema,
  workingDirectory: z.string().max(2048), ledgerDirectory: z.string().max(2048),
  candidateCommit: commit, candidateTree: commit, packetCommit: commit,
  packet: attachment, preflight: attachment, sourceBundle: attachment, sourceManifest: attachment,
});
const funded = z.number().int().min(4 * 72_960).max(Number.MAX_SAFE_INTEGER);
const accountReadbackSchema = z.strictObject({
  runId: materialIdSchema, checkedAt: materialTimestampSchema, creditBalanceMicroUsd: funded, keyRemainingMicroUsd: funded,
  workspaceKeyMatched: z.literal(true), strictZdrAssigned: z.literal(true), safetyRetentionAllowed: z.literal(false),
  inputOutputLogging: z.literal(false), trainingEnabled: z.literal(false), publicPrompts: z.literal(false), traceDestinations: z.literal(0),
  responseCacheOptIn: z.literal(false), moonshotByok: z.literal(false), implicitCacheScope: z.literal("four-synthetic-documents"),
});
type HostBinding = {
  runId: string; authorizationId: string; approvedAt: string; expiresAt: string;
  settingsSha256: string; candidateCommit: string; sourceBundleSha256: string; preflightSha256: string;
};
type Locations = { checkout: string; cwd: string; registry: string };
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const refusal = () => new Error("diagnostic-pilot-host-refused");
function requireMatch(value: unknown): asserts value { if (!value) throw refusal(); }
function samePath(left: string, right: string) { return isAbsolute(left) && isAbsolute(right) && relative(left, right) === ""; }
function git(cwd: string, args: string[]) {
  // Do not inherit Git object directories, hooks, index overrides, replacement refs or remote credentials.
  return execFileSync("git", ["--no-lazy-fetch", "--no-replace-objects", "-c", "core.fsmonitor=false", ...args], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 20_000,
    env: { NODE_ENV: "production", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_ALLOW_PROTOCOL: "" },
  });
}
async function bytes(path: string, maximum: number, exactSize?: number): Promise<Buffer> {
  await assertNoLinks(path);
  const stat = await lstat(path);
  requireMatch(stat.isFile() && stat.nlink === 1 && stat.size <= maximum && (exactSize === undefined || stat.size === exactSize));
  const handle = await open(path, "r");
  try {
    const unchanged = (observed: typeof stat) => observed.isFile() && observed.nlink === 1 && observed.dev === stat.dev
      && observed.ino === stat.ino && observed.size === stat.size && observed.mtimeMs === stat.mtimeMs && observed.ctimeMs === stat.ctimeMs;
    requireMatch(unchanged(await handle.stat()));
    // Allocate only the checked size. Concurrent growth can never enlarge this read.
    const data = Buffer.alloc(stat.size);
    for (let offset = 0; offset < data.length;) {
      const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
      requireMatch(bytesRead > 0); offset += bytesRead;
    }
    await assertNoLinks(path);
    requireMatch(unchanged(await handle.stat()) && unchanged(await lstat(path)));
    return data;
  } finally { await handle.close(); }
}
function treeEntries(checkout: string, revision: string) {
  commit.parse(revision);
  return git(checkout, ["ls-tree", "-r", "-l", "-z", revision]).split("\0").filter(Boolean).map(row => {
    const tab = row.indexOf("\t"), [mode, kind, blob, length] = row.slice(0, tab).trim().split(/\s+/u);
    const path = safeRelative(row.slice(tab + 1)) as string;
    return { mode, kind, blob, path, size: Number(length) };
  });
}
const blobHash = (data: Buffer) => createHash("sha1").update("blob " + data.length + "\0").update(data).digest("hex");

function windowsCheck(script: string, environment: Record<string, string>, input?: string) {
  const systemRoot = process.env.SystemRoot!;
  execFileSync(join(systemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true, timeout: 20_000, stdio: ["pipe", "ignore", "ignore"], input,
    env: { NODE_ENV: "production", SystemRoot: systemRoot, PATH: process.env.PATH, ...environment },
  });
}
function rejectWindowsReparsePoints(paths: string[]) {
  if (process.platform !== "win32") return;
  // Node identifies symlinks and junctions; also reject other NTFS reparse tags on existing ancestors.
  windowsCheck(`$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach($path in [Console]::In.ReadToEnd().Split([char]10)){
  while($path -and $seen.Add($path)){
    if(([IO.File]::Exists($path) -or [IO.Directory]::Exists($path)) -and ([IO.File]::GetAttributes($path) -band [IO.FileAttributes]::ReparsePoint)){exit 1}
    $path=[IO.Path]::GetDirectoryName($path)
  }
}`, {}, paths.join("\n"));
}

/** Public, read-only freeze operation. Covers every non-doc Git path, including configs, test fixtures and runtime lockfiles. */
export async function inspectDiagnosticPilotSourceManifest(checkout: string, candidateCommit: string) {
  requireMatch(samePath(git(checkout, ["rev-parse", "--show-toplevel"]).trim(), checkout));
  const entries = treeEntries(checkout, candidateCommit).filter(entry => !entry.path.startsWith("docs/"));
  requireMatch(entries.length > 0 && entries.length <= 20_000 && entries.reduce((n, entry) => n + entry.size, 0) <= 512 * 1024 * 1024);
  const product = ["--", ".", ":(exclude)docs/**"];
  git(checkout, ["merge-base", "--is-ancestor", candidateCommit, "HEAD"]);
  git(checkout, ["diff", "--no-ext-diff", "--no-textconv", "--quiet", candidateCommit, "HEAD", ...product]);
  git(checkout, ["diff", "--no-ext-diff", "--no-textconv", "--cached", "--quiet", candidateCommit, ...product]);
  requireMatch(!git(checkout, ["ls-files", "--others", "--exclude-standard", ...product]).trim());
  // Git excludes can conceal a module that shadows a reviewed TypeScript import. Check actual source directories independently.
  const directories = new Set(entries.filter(entry => entry.path.includes("/")).map(entry => entry.path.split("/")[0]!));
  const rootModules = ["js", "mjs", "cjs", "ts", "tsx", "jsx", "mts", "cts", "json"].map(ext => ":(top,glob)*." + ext);
  requireMatch(!git(checkout, ["ls-files", "--others", "--", ...directories, ...rootModules]).trim());
  rejectWindowsReparsePoints(entries.map(entry => resolve(checkout, entry.path)));
  const files: { path: string; sha256: string }[] = [];
  for (let offset = 0; offset < entries.length; offset += 24) {
    files.push(...await Promise.all(entries.slice(offset, offset + 24).map(async entry => {
      const path = resolve(checkout, entry.path);
      requireMatch(inside(checkout, path) && entry.kind === "blob" && ["100644", "100755"].includes(entry.mode!));
      const data = await bytes(path, 64 * 1024 * 1024, entry.size);
      requireMatch(blobHash(data) === entry.blob);
      return { path: entry.path, sha256: sha(data) };
    })));
  }
  const candidateTree = git(checkout, ["rev-parse", "--verify", candidateCommit + "^{tree}"]).trim();
  return { version: 1, candidateCommit, candidateTree, files };
}

async function requireUnused(path: string) {
  await assertNoLinks(path, true);
  try { await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw refusal();
}
async function requireRestricted(paths: string[]) {
  if (process.platform !== "win32") {
    for (const path of paths) {
      const stat = await lstat(path);
      requireMatch(stat.uid === process.getuid!() && (stat.mode & 0o077) === 0);
    }
    return;
  }
  // Check SID values rather than localized account names. Only the owner, SYSTEM and administrators may access the private issuance.
  const script = `$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$sid=[System.Security.Principal.SecurityIdentifier]
$allowed=@([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
foreach($p in [Console]::In.ReadToEnd().Split([char]10)) {
  $acl=if([IO.Directory]::Exists($p)){[IO.Directory]::GetAccessControl($p)}else{[IO.File]::GetAccessControl($p)}
  if($acl.GetOwner($sid).Value -notin $allowed){exit 1}
  $rules=@($acl.GetAccessRules($true,$true,$sid))
  if($rules.Count -eq 0){exit 1}
  foreach($r in $rules) {
    if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -notin $allowed){
      if($r.IdentityReference.Value -eq 'S-1-3-0' -and ($r.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly)){continue}
      exit 1
    }
  }
}`;
  windowsCheck(script, {}, paths.join("\n"));
}

/** Lower-level verifier for isolated host fixtures. The live entry's locations always come from the executing module and OS account. */
export async function inspectRegisteredDiagnosticPilot(locations: Locations, grant: HostBinding) {
  try {
    const { checkout, cwd, registry } = locations;
    requireMatch(materialIdSchema.safeParse(grant.runId).success && grant.runId.startsWith("materials-b2-diagnostic-pilot-"));
    requireMatch(samePath(checkout, cwd) && !inside(checkout, registry, true));
    const recordPath = join(registry, grant.runId + ".pilot-issued.json");
    const privateDirectory = join(registry, grant.runId), readbackPath = join(privateDirectory, "account-readback.json");
    await assertNoLinks(recordPath);
    await assertNoLinks(readbackPath);
    await requireRestricted([registry, recordPath, privateDirectory, readbackPath]);
    const raw = await bytes(recordPath, 65_536), record = recordSchema.parse(JSON.parse(raw.toString("utf8")));
    const marker = join(registry, grant.runId + ".pilot-used");
    const journalBase = join(checkout, "work", "materials-diagnostic-pilot"), ledger = join(journalBase, grant.runId);
    const inWindow = () => Date.parse(record.approvedAt) <= Date.now() && Date.now() < Date.parse(record.expiresAt);
    requireMatch(record.runId === grant.runId && record.authorizationId === grant.authorizationId && record.settingsSha256 === grant.settingsSha256
      && record.approvedAt === grant.approvedAt && record.expiresAt === grant.expiresAt && inWindow()
      && record.candidateCommit === grant.candidateCommit && record.sourceBundle.sha256 === grant.sourceBundleSha256
      && record.preflight.sha256 === grant.preflightSha256 && samePath(record.workingDirectory, checkout) && samePath(record.ledgerDirectory, ledger));
    const readbackBytes = await bytes(readbackPath, 16_384);
    requireMatch(sha(readbackBytes) === record.accountReadbackSha256);
    const readback = accountReadbackSchema.parse(JSON.parse(readbackBytes.toString("utf8")));
    const approvedAt = Date.parse(record.approvedAt), checkedAt = Date.parse(readback.checkedAt);
    requireMatch(readback.runId === grant.runId && Date.parse(record.expiresAt) - approvedAt <= 2 * 60 * 60 * 1000
      && checkedAt >= approvedAt && checkedAt <= Date.now() && checkedAt < Date.parse(record.expiresAt));
    await requireUnused(marker);
    await requireUnused(ledger);
    requireMatch(git(checkout, ["rev-parse", "--verify", "HEAD"]).trim() === record.packetCommit);
    const head = new Map(treeEntries(checkout, record.packetCommit).map(entry => [entry.path, entry]));
    const attachments = [record.packet, record.preflight, record.sourceBundle, record.sourceManifest];
    requireMatch(new Set(attachments.map(file => file.path)).size === attachments.length);
    rejectWindowsReparsePoints([recordPath, readbackPath, marker, ledger, ...attachments.map(file => join(checkout, safeRelative(file.path)))]);
    let manifest: unknown;
    for (const file of attachments) {
      const path = join(checkout, safeRelative(file.path));
      const entry = head.get(file.path);
      requireMatch(inside(checkout, path) && entry?.kind === "blob" && entry.mode === "100644");
      const data = await bytes(path, file === record.sourceBundle ? 128 * 1024 * 1024 : 8 * 1024 * 1024, entry.size);
      requireMatch(sha(data) === file.sha256 && blobHash(data) === entry.blob);
      if (file === record.sourceManifest) manifest = JSON.parse(data.toString("utf8"));
    }
    const actual = await inspectDiagnosticPilotSourceManifest(checkout, record.candidateCommit);
    requireMatch(actual.candidateTree === record.candidateTree && isDeepStrictEqual(manifest, actual));
    const bundle = join(checkout, record.sourceBundle.path);
    const heads = git(checkout, ["bundle", "list-heads", bundle]).trim().split("\n");
    requireMatch(heads.length === 1 && heads[0]!.split(" ")[0] === record.candidateCommit);
    git(checkout, ["bundle", "verify", bundle]);
    requireMatch(inWindow());
    return async () => {
      // The marker is never removed on errors, timeout, or loss of the checkout-local journal.
      try {
        await requireUnused(ledger);
        await assertNoLinks(marker, true);
        requireMatch((await bytes(recordPath, 65_536)).equals(raw) && (await bytes(readbackPath, 16_384)).equals(readbackBytes) && inWindow());
        const handle = await open(marker, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify({ runId: record.runId, claimedAt: new Date().toISOString() }) + "\n");
          await handle.sync();
        } finally { await handle.close(); }
        if (process.platform !== "win32") {
          const directory = await open(registry, "r");
          try { await directory.sync(); } finally { await directory.close(); }
        }
        return createQualificationJournal(journalBase, grant.runId);
      } catch { throw refusal(); }
    };
  } catch { throw refusal(); }
}

export function inspectLiveDiagnosticPilotHost(grant: HostBinding) {
  const profile = userInfo().homedir;
  requireMatch(samePath(profile, homedir()));
  return inspectRegisteredDiagnosticPilot({ checkout: resolve(fileURLToPath(new URL("../", import.meta.url))), cwd: process.cwd(),
    registry: join(profile, ".arc-materials", "gate-1b", "materials-b2", "quality-approvals") }, grant);
}
