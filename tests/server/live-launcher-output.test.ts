// @vitest-environment node
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const describeOnWindows = process.platform === "win32" ? describe : describe.skip;
let fixtureRoot = "";

const runnerSource = String.raw`
const mode = process.env.LAUNCHER_OUTPUT_FIXTURE_MODE;
const stdoutBlock = "O".repeat(128 * 1024);
const stderrBlock = "E".repeat(128 * 1024);
const write = (stream, value) => new Promise((resolve, reject) => {
  stream.write(value, (error) => error ? reject(error) : resolve());
});

if (mode === "failure") {
  await Promise.all([
    write(process.stdout, "FIXTURE_FAILURE_STDOUT\n" + stdoutBlock + "\n"),
    write(process.stderr, "FIXTURE_SAFE_ERROR\n" + stderrBlock + "\n"),
  ]);
  process.exitCode = 23;
} else {
  await Promise.all([
    write(process.stdout, '{"mode":"offline-fixture","outcome":"passed"}\n' + stdoutBlock + "\nSummary: synthetic-safe-summary.json\n"),
    write(process.stderr, "FIXTURE_SUCCESS_STDERR\n" + stderrBlock + "\n"),
  ]);
}
`;

const hostSource = String.raw`
$fixtureOut = [Console]::Out
$fixtureError = [Console]::Error
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LauncherOutputFixture {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetStdHandle(int handle, IntPtr value);
}
'@
if (-not [LauncherOutputFixture]::SetStdHandle(-11, [IntPtr]::Zero)) { throw 'Could not clear stdout handle' }
if (-not [LauncherOutputFixture]::SetStdHandle(-12, [IntPtr]::Zero)) { throw 'Could not clear stderr handle' }
& (Join-Path $PSScriptRoot 'scripts/live-research/run.ps1')
exit $LASTEXITCODE
`;

function runFixture(mode: "success" | "failure") {
  const inheritedEnvironment = Object.fromEntries(
    ["SystemRoot", "PATH", "PATHEXT", "TEMP", "TMP"].flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
  return spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(fixtureRoot, "host.ps1")],
    {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: { ...inheritedEnvironment, NODE_ENV: "test", LAUNCHER_OUTPUT_FIXTURE_MODE: mode },
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
}

describeOnWindows("PowerShell live launcher output", () => {
  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "arc-live-launcher-output-"));
    const launcherPath = join(fixtureRoot, "scripts", "live-research", "run.ps1");
    mkdirSync(dirname(launcherPath), { recursive: true });
    copyFileSync(resolve("scripts/live-research/run.ps1"), launcherPath);
    const profilePath = join(fixtureRoot, "app", "server", "research", "local-validation-profile.json");
    mkdirSync(dirname(profilePath), { recursive: true });
    copyFileSync(resolve("app/server/research/local-validation-profile.json"), profilePath);
    writeFileSync(join(fixtureRoot, "scripts", "live-research", "runner.mjs"), runnerSource);
    writeFileSync(join(fixtureRoot, "host.ps1"), hostSource);
  });

  afterAll(() => {
    const resolvedFixture = resolve(fixtureRoot);
    const resolvedTemp = resolve(tmpdir());
    if (resolvedFixture.startsWith(`${resolvedTemp}\\arc-live-launcher-output-`)) {
      rmSync(resolvedFixture, { recursive: true, force: true });
    }
  });

  it("forwards simultaneous large stdout and stderr from a successful hidden child", () => {
    const child = runFixture("success");
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('{"mode":"offline-fixture","outcome":"passed"}');
    expect(child.stdout).toContain("Summary: synthetic-safe-summary.json");
    expect(child.stdout).toContain("O".repeat(128 * 1024));
    expect(child.stderr).toContain("FIXTURE_SUCCESS_STDERR");
    expect(child.stderr).toContain("E".repeat(128 * 1024));
  }, 20_000);

  it("forwards a hidden child's safe failure output and preserves its exit code", () => {
    const child = runFixture("failure");
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(23);
    expect(child.stdout).toContain("FIXTURE_FAILURE_STDOUT");
    expect(child.stderr).toContain("FIXTURE_SAFE_ERROR");
  }, 20_000);
});
