// @vitest-environment node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const describeOnWindows = process.platform === "win32" ? describe : describe.skip;
const launcherPath = resolve("scripts/run-research-cloud-smoke.ps1");
const smokeDriverPath = resolve("scripts/test-research-cloud-smoke.mjs");
const fixtureRoots: string[] = [];
const syntheticSecret = "a".repeat(64);

const driverSource = String.raw`
import { writeFileSync } from "node:fs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const stdin = Buffer.concat(chunks).toString("utf8");
writeFileSync("capture.json", JSON.stringify({
  args: process.argv.slice(2),
  execArgv: process.execArgv,
  stdin,
  environmentContainsSecret: Object.values(process.env).includes(stdin.trim()),
  nodeOptions: process.env.NODE_OPTIONS ?? null,
  httpsProxy: process.env.HTTPS_PROXY ?? null,
  httpProxy: process.env.HTTP_PROXY ?? null,
  noProxy: process.env.NO_PROXY ?? null,
  allProxy: process.env.ALL_PROXY ?? null,
}));
process.stdout.write("SYNTHETIC_DRIVER_STDOUT\n");
process.stderr.write("SYNTHETIC_DRIVER_STDERR\n");
process.exitCode = Number(process.env.SYNTHETIC_DRIVER_EXIT ?? "0");
`;

const smokeDriverSource = readFileSync(smokeDriverPath, "utf8");
const credentialStart = smokeDriverSource.indexOf("async function credential(input) {");
const credentialEnd = smokeDriverSource.indexOf("\n\n/** A shared bounded nonce file", credentialStart);
if (credentialStart < 0 || credentialEnd < 0) throw new Error("Production credential reader unavailable");
const credentialDriverSource = [
  'import { constants, fstatSync } from "node:fs";',
  'const reject = code => { throw Object.assign(Error("Smoke driver refused"), { safeCode: code }); };',
  smokeDriverSource.slice(credentialStart, credentialEnd),
  String.raw`
try {
  const key = await credential();
  const result = { status: "accepted", byteLength: key.byteLength };
  key.fill(0);
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  process.stdout.write(JSON.stringify({ status: "refused", code: error.safeCode ?? "operation-unavailable" }) + "\n");
  process.exitCode = 1;
}
`,
].join("\n");

function replaceExactly(source: string, value: string, replacement: string): string {
  const count = source.split(value).length - 1;
  if (count !== 1) throw new Error(`Expected one launcher site for: ${value}`);
  return source.replace(value, replacement);
}

function makeFixture(secret = syntheticSecret, syntheticDriver = driverSource): string {
  const temporary = mkdtempSync(join(tmpdir(), "arc-smoke-launcher-"));
  fixtureRoots.push(temporary);
  const root = join(temporary, "repo with spaces");
  const script = join(root, "scripts", "run-research-cloud-smoke.ps1");
  mkdirSync(dirname(script), { recursive: true });
  copyFileSync(launcherPath, script);
  writeFileSync(join(root, "scripts", "test-research-cloud-smoke.mjs"), syntheticDriver);

  let source = readFileSync(script, "utf8");
  source = replaceExactly(
    source,
    "if ([Console]::IsInputRedirected) { throw 'Interactive terminal required' }",
    "# Synthetic fixture uses a noninteractive host.",
  );
  source = replaceExactly(
    source,
    "$smokeSecret = Read-Host 'Paste 64-hex cloud smoke control secret (masked)' -AsSecureString",
    `[IO.File]::WriteAllText((Join-Path $smokeRoot 'prompt-sentinel.txt'), 'prompted'); $smokeSecret = ConvertTo-SecureString '${secret}' -AsPlainText -Force`,
  );
  writeFileSync(script, source);
  return root;
}

function prepareInputs(root: string): { inventory: string; artifact: string } {
  const inventory = join(root, "outputs", "local-durable-executor-20260914", "task15-smoke", "operator fixture", "inventory.json");
  const artifact = join(root, "outputs", "local-durable-executor-20260914", "task15-smoke", "build", "cloud", "artifact report.json");
  mkdirSync(dirname(inventory), { recursive: true });
  mkdirSync(dirname(artifact), { recursive: true });
  writeFileSync(inventory, "{}");
  writeFileSync(artifact, "{}");
  return { inventory, artifact };
}

function safeEnvironment(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      ["SystemRoot", "PATH", "PATHEXT", "TEMP", "TMP"].flatMap((name) => {
        const value = process.env[name];
        return value === undefined ? [] : [[name, value]];
      }),
    ),
    NODE_ENV: "test",
    ...overrides,
  };
}

function runLauncher(root: string, args: string[], environment: Record<string, string> = {}) {
  return spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts", "run-research-cloud-smoke.ps1"), ...args],
    { cwd: root, encoding: "utf8", env: safeEnvironment(environment), timeout: 15_000, windowsHide: true },
  );
}

function runCredentialReader(root: string, input: string | Buffer | number) {
  return spawnSync(process.execPath, [join(root, "scripts", "test-research-cloud-smoke.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: safeEnvironment(),
    timeout: 5_000,
    windowsHide: true,
    ...(typeof input === "number" ? { stdio: [input, "pipe", "pipe"] } : { input }),
  });
}

function runLauncherWithDefaultProxy(
  root: string,
  args: string[],
  proxy: string | null,
  environment: Record<string, string> = {},
) {
  const host = join(root, "synthetic-proxy-host.ps1");
  writeFileSync(host, String.raw`
param(
    [AllowNull()][string]$SyntheticProxy,
    [string]$Mode,
    [string]$Scenario,
    [string]$Inventory,
    [string]$ArtifactReport,
    [string]$ReportName,
    [switch]$UseSystemProxy
)
if ($null -eq $SyntheticProxy -or $SyntheticProxy -ceq '__NONE__') {
    [Net.WebRequest]::DefaultWebProxy = $null
} else {
    [Net.WebRequest]::DefaultWebProxy = [Net.WebProxy]::new($SyntheticProxy)
}
$launcherParameters = @{
    Mode = $Mode
    Scenario = $Scenario
    Inventory = $Inventory
    ArtifactReport = $ArtifactReport
    ReportName = $ReportName
}
& (Join-Path $PSScriptRoot 'scripts/run-research-cloud-smoke.ps1') @launcherParameters -UseSystemProxy:$UseSystemProxy
exit $LASTEXITCODE
`);
  return spawnSync(
    "powershell",
    [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", host,
      "-SyntheticProxy", proxy ?? "__NONE__",
      ...args,
    ],
    { cwd: root, encoding: "utf8", env: safeEnvironment(environment), timeout: 15_000, windowsHide: true },
  );
}

afterEach(() => {
  for (const fixture of fixtureRoots.splice(0)) {
    const resolvedFixture = resolve(fixture);
    expect(dirname(resolvedFixture)).toBe(resolve(tmpdir()));
    expect(resolvedFixture.startsWith(join(resolve(tmpdir()), "arc-smoke-launcher-"))).toBe(true);
    rmSync(resolvedFixture, { recursive: true, force: true });
  }
});

describeOnWindows("research cloud smoke operator launcher", () => {
  it.each(["success", "malformed", "oversize", "stream error", "timeout", "conversion failure"])
    ("clears every accumulated redirected input buffer on %s", async outcome => {
      const chunks = [Buffer.from(outcome === "malformed" ? "secret-never-echo" : "a".repeat(outcome === "oversize" ? 67 : 64))];
      class SyntheticStdin extends EventEmitter {
        isTTY = false;
        pause() { return this; }
        resume() {
          queueMicrotask(() => {
            this.emit("data", chunks[0]);
            if (outcome === "oversize" || outcome === "timeout") return;
            if (outcome === "stream error") this.emit("error", Error("secret-never-echo"));
            else this.emit("end");
          });
          return this;
        }
      }
      const stdin = new SyntheticStdin();
      const evaluate = new Function("process", "fstatSync", "constants", "reject", `${smokeDriverSource.slice(credentialStart, credentialEnd)}; return credential;`);
      const credential = evaluate({ stdin, platform: "win32" }, () => ({ isFIFO: () => true }), {},
        (safeCode: string) => { throw Object.assign(Error("Refused"), { safeCode }); }) as () => Promise<Uint8Array>;
      const conversion = outcome === "conversion failure" ? vi.spyOn(Uint8Array, "from").mockImplementationOnce(() => { throw Error("Conversion unavailable"); }) : null;
      try {
        if (outcome === "success") { const key = await credential(); expect(key).toHaveLength(32); key.fill(0); }
        else await expect(credential()).rejects.toThrow();
        expect(chunks.every(chunk => chunk.every(byte => byte === 0))).toBe(true);
        expect(stdin.listenerCount("data") + stdin.listenerCount("end") + stdin.listenerCount("error")).toBe(0);
      } finally { conversion?.mockRestore(); }
    });
  it("passes replay with its explicit existing approval through the masked stdin launcher", () => {
    const root = makeFixture(); const { inventory, artifact } = prepareInputs(root);
    const approval = join(dirname(inventory), "approved roster.json"); writeFileSync(approval, "{}");
    const child = runLauncher(root, ["-Mode", "replay", "-Scenario", "long", "-Inventory", inventory,
      "-ArtifactReport", artifact, "-ReportName", "replay-launcher", "-Approval", approval]);
    expect(child.error).toBeUndefined(); expect(child.status).toBe(0);
    const capture = JSON.parse(readFileSync(join(root, "capture.json"), "utf8"));
    expect(capture.args).toEqual(["replay", "--inventory", inventory, "--artifact-report", artifact,
      "--scenario", "long", "--report-name", "replay-launcher", "--approval", approval]);
    expect(capture.stdin).toBe(`${syntheticSecret}\n`); expect(capture.environmentContainsSecret).toBe(false);
    expect(child.stdout + child.stderr).not.toContain(syntheticSecret);
  });
  it.each(["missing", "nonexistent", "start", "status"])("rejects %s replay approval usage before prompting", variant => {
    const root = makeFixture(); const { inventory, artifact } = prepareInputs(root);
    const approval = join(dirname(inventory), "approval.json");
    if (variant !== "nonexistent") writeFileSync(approval, "{}");
    const child = runLauncher(root, ["-Mode", variant === "start" || variant === "status" ? variant : "replay",
      "-Scenario", "long", "-Inventory", inventory, "-ArtifactReport", artifact, "-ReportName", "invalid-approval",
      ...(variant === "missing" ? [] : ["-Approval", approval])]);
    expect(child.status).toBe(1); expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "capture.json"))).toBe(false);
  });
  it("provides the fixed PowerShell launcher", () => {
    expect(existsSync(launcherPath)).toBe(true);
  });

  it("uses a masked interactive prompt and a fixed hidden child process", () => {
    const source = readFileSync(launcherPath, "utf8");

    expect(source).toContain("Read-Host 'Paste 64-hex cloud smoke control secret (masked)' -AsSecureString");
    expect(source).toContain("if ([Console]::IsInputRedirected) { throw 'Interactive terminal required' }");
    expect(source).toContain("RedirectStandardInput = $true");
    expect(source).toContain("UseShellExecute = $false");
    expect(source).toContain("CreateNoWindow = $true");
    expect(source).toContain("scripts/test-research-cloud-smoke.mjs");
    expect(source).toContain("if ([string]::IsNullOrWhiteSpace($ArtifactReport)) { throw 'Artifact report required' }");
    expect(source).not.toContain("task15-smoke/build/cloud/report.json");
    expect(source).not.toMatch(/DriverPath|NodePath|ChildPath|Secret\s*=.*param/iu);
  });

  it.each([
    ["start", "long"],
    ["status", "after-d1"],
  ] as const)("passes exact %s arguments through paths with spaces and transfers only one synthetic secret line over stdin", (mode, scenario) => {
    const root = makeFixture();
    const { inventory, artifact } = prepareInputs(root);
    const child = runLauncher(root, [
      "-Mode", mode,
      "-Scenario", scenario,
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", `operator-${mode}`,
    ]);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toContain("SYNTHETIC_DRIVER_STDOUT");
    expect(child.stderr).toContain("SYNTHETIC_DRIVER_STDERR");
    expect(child.stdout).toContain("ExitCode: 0");
    expect(child.stdout + child.stderr).not.toContain(syntheticSecret);
    const capture = JSON.parse(readFileSync(join(root, "capture.json"), "utf8"));
    expect(capture).toEqual({
      args: [
        mode,
        "--inventory", inventory,
        "--artifact-report", artifact,
        "--scenario", scenario,
        "--report-name", `operator-${mode}`,
      ],
      execArgv: [],
      stdin: `${syntheticSecret}\n`,
      environmentContainsSecret: false,
      nodeOptions: null,
      httpsProxy: null,
      httpProxy: null,
      noProxy: null,
      allProxy: null,
    });
  });

  it("lets the production credential reader consume the launcher's redirected Windows pipe", () => {
    const root = makeFixture(syntheticSecret, credentialDriverSource);
    const { inventory, artifact } = prepareInputs(root);
    const child = runLauncher(root, [
      "-Mode", "status",
      "-Scenario", "after-r2",
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", "production-credential-reader",
    ]);

    expect(child.error).toBeUndefined();
    expect(child.stdout).toContain('{"status":"accepted","byteLength":32}');
    expect(child.status).toBe(0);
    expect(child.stdout).toContain("ExitCode: 0");
    expect(child.stdout + child.stderr).not.toContain(syntheticSecret);
  });

  it.each([
    ["empty", "", "credential-format"],
    ["malformed", "g".repeat(64) + "\n", "credential-format"],
    ["oversize", "a".repeat(67), "credential-channel"],
  ])("lets the production credential reader reject %s redirected bytes", (_label, input, code) => {
    const root = makeFixture(syntheticSecret, credentialDriverSource);
    const child = runCredentialReader(root, input);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stdout.trim()).toBe(`{"status":"refused","code":"${code}"}`);
  });

  it("keeps a Windows null device outside the production credential channel", () => {
    const root = makeFixture(syntheticSecret, credentialDriverSource);
    const nullDevice = openSync("\\\\.\\NUL", "r");
    try {
      const child = runCredentialReader(root, nullDevice);
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(1);
      expect(child.stdout.trim()).toBe('{"status":"refused","code":"credential-channel"}');
    } finally {
      closeSync(nullDevice);
    }
  });

  it("removes inherited Node startup options before the fixed driver receives the synthetic secret", () => {
    const root = makeFixture();
    const { inventory, artifact } = prepareInputs(root);
    const child = runLauncher(root, [
      "-Mode", "status",
      "-Scenario", "after-r2",
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", "clean-node-options",
    ], { NODE_OPTIONS: "--trace-warnings" });

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    const capture = JSON.parse(readFileSync(join(root, "capture.json"), "utf8"));
    expect(capture.nodeOptions).toBeNull();
    expect(capture.environmentContainsSecret).toBe(false);
    expect(child.stdout + child.stderr).not.toContain(syntheticSecret);
  });

  it("passes an approved synthetic system proxy only to the fixed child when requested", () => {
    const root = makeFixture();
    const { inventory, artifact } = prepareInputs(root);
    writeFileSync(inventory, JSON.stringify({ controlOrigin: "https://control.example" }));
    const proxy = "http://127.0.0.1:7777";
    const child = runLauncherWithDefaultProxy(root, [
      "-Mode", "status",
      "-Scenario", "after-r2",
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", "system-proxy",
      "-UseSystemProxy",
    ], proxy, {
      HTTP_PROXY: "http://192.0.2.1:8000",
      https_proxy: "http://192.0.2.2:8000",
      NO_PROXY: "*",
      ALL_PROXY: "http://192.0.2.3:8000",
    });

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout + child.stderr).not.toContain(proxy);
    const capture = JSON.parse(readFileSync(join(root, "capture.json"), "utf8"));
    expect(capture.execArgv).toEqual(["--use-env-proxy"]);
    expect(capture.httpsProxy).toBe("http://127.0.0.1:7777/");
    expect(capture.httpProxy).toBeNull();
    expect(capture.noProxy).toBeNull();
    expect(capture.allProxy).toBeNull();
    expect(capture.stdin).toBe(`${syntheticSecret}\n`);
    expect(capture.environmentContainsSecret).toBe(false);
  });

  it.each([
    ["missing", null],
    ["non-loopback", "http://192.0.2.1:8080"],
    ["HTTPS", "https://127.0.0.1:8080"],
    ["userinfo", "http://user@127.0.0.1:8080"],
  ] as const)("rejects a %s synthetic system proxy before the masked prompt", (_label, proxy) => {
    const root = makeFixture();
    const { inventory, artifact } = prepareInputs(root);
    writeFileSync(inventory, JSON.stringify({ controlOrigin: "https://control.example" }));
    const child = runLauncherWithDefaultProxy(root, [
      "-Mode", "start",
      "-Scenario", "long",
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", "invalid-system-proxy",
      "-UseSystemProxy",
    ], proxy);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim().split(/\r?\n/u)).toEqual([
      "Research smoke launcher stopped (launcher-failed).",
      "ExitCode: 1",
    ]);
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "capture.json"))).toBe(false);
  });

  it.each([
    ["the inventory", "inventory.json", "artifact.json"],
    ["the artifact report", "present-inventory.json", "missing-artifact.json"],
  ])("rejects a missing %s before prompting or starting the driver", (_label, inventoryName, artifactName) => {
    const root = makeFixture();
    const inventory = join(root, inventoryName);
    const artifact = join(root, artifactName);
    if (inventoryName.startsWith("present")) writeFileSync(inventory, "{}");
    const child = runLauncher(root, [
      "-Mode", "start",
      "-Scenario", "long",
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", "missing-input",
    ]);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim().split(/\r?\n/u)).toEqual([
      "Research smoke launcher stopped (launcher-failed).",
      "ExitCode: 1",
    ]);
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "capture.json"))).toBe(false);
  });

  it("requires an explicit artifact report before prompting or starting the driver", () => {
    const root = makeFixture();
    const inventory = join(root, "present-inventory.json");
    writeFileSync(inventory, "{}");
    const child = runLauncher(root, [
      "-Mode", "start",
      "-Scenario", "long",
      "-Inventory", inventory,
      "-ReportName", "explicit-artifact",
    ]);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim().split(/\r?\n/u)).toEqual([
      "Research smoke launcher stopped (launcher-failed).",
      "ExitCode: 1",
    ]);
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "capture.json"))).toBe(false);
  });

  it("rejects a report name ending in LF before the masked prompt", () => {
    const root = makeFixture();
    const { inventory, artifact } = prepareInputs(root);
    const child = runLauncher(root, [
      "-Mode", "start",
      "-Scenario", "long",
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", "safe\n",
    ]);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim().split(/\r?\n/u)).toEqual([
      "Research smoke launcher stopped (launcher-failed).",
      "ExitCode: 1",
    ]);
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "capture.json"))).toBe(false);
  });

  it.each([
    ["uppercase", "A".repeat(64)],
    ["too short", "b".repeat(63)],
  ])("rejects a %s synthetic control secret without revealing it or starting the driver", (_label, secret) => {
    const root = makeFixture(secret);
    const { inventory, artifact } = prepareInputs(root);
    const child = runLauncher(root, [
      "-Mode", "status",
      "-Scenario", "after-r2",
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", "invalid-secret",
    ]);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim().split(/\r?\n/u)).toEqual([
      "Research smoke launcher stopped (launcher-failed).",
      "ExitCode: 1",
    ]);
    expect(child.stdout + child.stderr).not.toContain(secret);
    expect(existsSync(join(root, "capture.json"))).toBe(false);
  });

  it("rejects a 64-hex synthetic control secret ending in LF before starting the driver", () => {
    const secret = `${syntheticSecret}\n`;
    const root = makeFixture(secret);
    const { inventory, artifact } = prepareInputs(root);
    const child = runLauncher(root, [
      "-Mode", "status",
      "-Scenario", "after-r2",
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", "secret-with-lf",
    ]);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim().split(/\r?\n/u)).toEqual([
      "Research smoke launcher stopped (launcher-failed).",
      "ExitCode: 1",
    ]);
    expect(child.stdout + child.stderr).not.toContain(syntheticSecret);
    expect(existsSync(join(root, "capture.json"))).toBe(false);
  });

  it("forwards safe child output, reports the exit code, and propagates child failure", () => {
    const root = makeFixture();
    const { inventory, artifact } = prepareInputs(root);
    const child = runLauncher(root, [
      "-Mode", "status",
      "-Scenario", "after-r2",
      "-Inventory", inventory,
      "-ArtifactReport", artifact,
      "-ReportName", "child-failure",
    ], { SYNTHETIC_DRIVER_EXIT: "23" });

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(23);
    expect(child.stdout).toContain("SYNTHETIC_DRIVER_STDOUT");
    expect(child.stderr).toContain("SYNTHETIC_DRIVER_STDERR");
    expect(child.stdout).toContain("ExitCode: 23");
    expect(child.stdout + child.stderr).not.toContain(syntheticSecret);
  });
});
