// @vitest-environment node
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const describeOnWindows = process.platform === "win32" ? describe : describe.skip;
const pwshAvailable = process.platform === "win32" && spawnSync(
  "pwsh",
  ["-NoProfile", "-Command", "exit 0"],
  { env: safeEnvironment(), timeout: 5_000, windowsHide: true },
).status === 0;
const powerShellHosts = ["powershell", ...(pwshAvailable ? ["pwsh"] : [])];
const fixturePrefix = "arc-kimi-launcher-policy-";
const fixtureRoots: string[] = [];
const validProfile = {
  profileId: "kimi-low-output32k-v3",
  model: "moonshotai/kimi-k3",
  reasoningEffort: "low",
  maxOutputTokens: 32_768,
  outputPolicyVersion: "kimi-complete-quality-v2",
  researchTimeoutMs: 1_200_000,
  activeTtlMs: 1_260_000,
  launcherTimeoutMs: 1_320_000,
};
type FixtureEnvironment = Record<string, string | undefined>;
const canonicalJson = JSON.stringify(validProfile);
const nonStandardSyntaxCases = [
  { label: "single-quoted keys and values", json: "{'profileId':'kimi-low-output32k-v3','model':'moonshotai/kimi-k3','reasoningEffort':'low','maxOutputTokens':32768,'outputPolicyVersion':'kimi-complete-quality-v2','researchTimeoutMs':1200000,'activeTtlMs':1260000,'launcherTimeoutMs':1320000}", hosts: powerShellHosts },
  { label: "a line comment", json: canonicalJson.replace("{", "{\n// synthetic comment\n"), hosts: pwshAvailable ? ["pwsh"] : [] },
  { label: "a trailing comma", json: canonicalJson.replace(/}$/, ",}"), hosts: pwshAvailable ? ["pwsh"] : [] },
  { label: "a leading-zero number", json: canonicalJson.replace("1200000", "01200000"), hosts: powerShellHosts },
  { label: "non-JSON whitespace", json: `\u00a0${canonicalJson}`, hosts: powerShellHosts },
  { label: "a duplicate member", json: canonicalJson.replace("{", '{"profileId":"kimi-low-output32k-v3",'), hosts: powerShellHosts },
];
const nonStandardSyntaxHostCases = nonStandardSyntaxCases.flatMap(({ label, json, hosts }) =>
  hosts.map((host) => ({ label, json, host })),
);
const strictJsonVariant = ` \t\r\n{
  "profileId": "kimi-low-output32k-\\u00763",
  "model": "moonshotai\\/kimi-k3",
  "reasoningEffort": "\\u006cow",
  "maxOutputTokens": 3.2768e4,
  "outputPolicyVersion": "kimi-complete-quality-\\u00762",
  "researchTimeoutMs": 1.2e6,
  "activeTtlMs": 1.26e6,
  "launcherTimeoutMs": 1.32e6
}\r\n`;

const runnerSource = String.raw`
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const mode = process.env.SYNTHETIC_RUNNER_MODE ?? "delay";
writeFileSync("child-started.txt", "started");

if (mode === "inherited-handles") {
  const grandchildCode = [
    "const fs = require('node:fs');",
    "setTimeout(() => {",
    "  process.stdout.write('SYNTHETIC_GRANDCHILD_STDOUT\\n');",
    "  process.stderr.write('SYNTHETIC_GRANDCHILD_STDERR\\n');",
    "  fs.writeFileSync('grandchild-finished.txt', 'finished');",
    "}, Number(process.env.SYNTHETIC_GRANDCHILD_DELAY_MS));",
  ].join("\n");
  const grandchild = spawn(process.execPath, ["-e", grandchildCode], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
    windowsHide: true,
  });
  grandchild.unref();
}

await delay(Number(process.env.SYNTHETIC_RUNNER_DELAY_MS ?? "0"));
writeFileSync("child-finished.txt", "finished");
process.stdout.write("SYNTHETIC_RUNNER_STDOUT\n");
process.stderr.write("SYNTHETIC_RUNNER_STDERR\n");
`;

function replaceExactly(source: string, value: string, replacement: string, expectedCount: number): string {
  const count = source.split(value).length - 1;
  if (count !== expectedCount) throw new Error(`Expected ${expectedCount} exact launcher site(s) for ${value}, found ${count}`);
  return source.split(value).join(replacement);
}

function withoutProperty<T extends object>(value: T, property: keyof T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== property)) as Partial<T>;
}

function makeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), fixturePrefix));
  fixtureRoots.push(root);
  const launcherPath = join(root, "scripts", "live-research", "run.ps1");
  mkdirSync(dirname(launcherPath), { recursive: true });
  copyFileSync(resolve("scripts/live-research/run.ps1"), launcherPath);
  writeFileSync(join(root, "scripts", "live-research", "runner.mjs"), runnerSource);
  return root;
}

function writeProfile(root: string, profile: unknown = validProfile): void {
  const path = join(root, "app", "server", "research", "local-validation-profile.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof profile === "string" ? profile : JSON.stringify(profile));
}

function writeProfileBytes(root: string, bytes: Uint8Array): void {
  const path = join(root, "app", "server", "research", "local-validation-profile.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function patchInteractivePrompt(root: string): void {
  const path = join(root, "scripts", "live-research", "run.ps1");
  let source = readFileSync(path, "utf8");
  source = replaceExactly(source, "if ([Console]::IsInputRedirected) { throw 'Interactive terminal required' }", "# Synthetic fixture: redirected input is safe.", 1);
  source = replaceExactly(
    source,
    "$validationSecret = Read-Host 'Paste dedicated OpenRouter key (masked)' -AsSecureString",
    "[IO.File]::WriteAllText((Join-Path $validationRoot 'prompt-sentinel.txt'), 'prompted'); $validationSecret = ConvertTo-SecureString 'synthetic-test-key' -AsPlainText -Force",
    1,
  );
  writeFileSync(path, source);
}

function scaleDeadlines(root: string): void {
  const path = join(root, "scripts", "live-research", "run.ps1");
  let source = readFileSync(path, "utf8");
  source = replaceExactly(source, "$validationLauncherTimeoutMs = 180000", "$validationLauncherTimeoutMs = 180", 1);
  source = replaceExactly(source, "1200000", "1200", 1);
  source = replaceExactly(source, "1260000", "1260", 1);
  source = replaceExactly(source, "1320000", "1320", 1);
  writeFileSync(path, source);
  writeProfile(root, { ...validProfile, researchTimeoutMs: 1200, activeTtlMs: 1260, launcherTimeoutMs: 1320 });
}

function safeEnvironment(overrides: FixtureEnvironment = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...Object.fromEntries(
      ["SystemRoot", "PATH", "PATHEXT", "TEMP", "TMP"].flatMap((name) => {
        const value = process.env[name];
        return value === undefined ? [] : [[name, value]];
      }),
    ),
    ...overrides,
  };
}

function runLauncher(root: string, args: string[] = [], env: FixtureEnvironment = {}, executable = "powershell") {
  return spawnSync(
    executable,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts", "live-research", "run.ps1"), ...args],
    { cwd: root, encoding: "utf8", env: safeEnvironment(env), timeout: 10_000 },
  );
}

async function boundedDelay(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    const resolvedRoot = resolve(root);
    const resolvedTemp = resolve(tmpdir());
    expect(dirname(resolvedRoot)).toBe(resolvedTemp);
    expect(resolvedRoot.startsWith(join(resolvedTemp, fixturePrefix))).toBe(true);
    rmSync(resolvedRoot, { recursive: true, force: true });
  }
});

describeOnWindows("Kimi PowerShell launcher policy", () => {
  it("rejects a missing fixed profile before starting the default offline child", () => {
    const root = makeFixture();
    const child = runLauncher(root);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
  });

  it.each([
    ["malformed JSON", "RAW_PROFILE_CANARY{"],
    ["a missing field", withoutProperty(validProfile, "launcherTimeoutMs")],
    ["an extra field", { ...validProfile, deadlineOverride: 1 }],
    ["a case-changed field", { ProfileId: validProfile.profileId, ...withoutProperty(validProfile, "profileId") }],
    ["an unknown profile", { ...validProfile, profileId: "kimi-low-bounded-v1" }],
    ["the wrong model", { ...validProfile, model: "openai/gpt-6-astra" }],
    ["the wrong reasoning effort", { ...validProfile, reasoningEffort: "LOW" }],
    ["a non-string profile name", { ...validProfile, profileId: 7 }],
    ["the wrong quality policy", { ...validProfile, outputPolicyVersion: "unknown-policy" }],
    ["a numeric string", { ...validProfile, researchTimeoutMs: "1200000" }],
    ["a numeric token string", { ...validProfile, maxOutputTokens: "32768" }],
    ["a fractional token budget", { ...validProfile, maxOutputTokens: 32_768.5 }],
    ["a fractional deadline", { ...validProfile, activeTtlMs: 1_260_000.5 }],
    ["an out-of-order deadline", { ...validProfile, researchTimeoutMs: 1_300_000 }],
    ["an out-of-range deadline", { ...validProfile, launcherTimeoutMs: 1_320_001 }],
  ] as const)("rejects %s before starting the default offline child", (_label, profile) => {
    const root = makeFixture();
    writeProfile(root, profile);
    const child = runLauncher(root);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(child.stdout + child.stderr).not.toContain("RAW_PROFILE_CANARY");
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
  });

  it.each(powerShellHosts)("rejects a singleton-array profile wrapper before starting the default offline child with %s", (host) => {
    const root = makeFixture();
    writeProfile(root, [validProfile]);
    const child = runLauncher(root, [], {}, host);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
  });

  it("rejects a malformed full-validation profile before the paid-mode key prompt", () => {
    const root = makeFixture();
    writeProfile(root, { ...validProfile, reasoningEffort: "max", raw: "RAW_PROFILE_CANARY" });
    patchInteractivePrompt(root);
    const child = runLauncher(root, ["-ExecuteOne"]);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
    expect(child.stdout + child.stderr).not.toContain("RAW_PROFILE_CANARY");
  });

  it.each(powerShellHosts)("rejects a singleton-array profile wrapper before the paid-mode key prompt with %s", (host) => {
    const root = makeFixture();
    writeProfile(root, [validProfile]);
    patchInteractivePrompt(root);
    const child = runLauncher(root, ["-ExecuteOne"], {}, host);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
  });

  it.each(powerShellHosts)("accepts the canonical object profile with %s", (host) => {
    const root = makeFixture();
    writeProfile(root);
    const child = runLauncher(root, [], {}, host);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toContain("SYNTHETIC_RUNNER_STDOUT");
    expect(existsSync(join(root, "child-finished.txt"))).toBe(true);
  });

  it.each(nonStandardSyntaxHostCases)("rejects $label before starting the default offline child with $host", ({ json, host }) => {
    const root = makeFixture();
    writeProfile(root, json);
    const child = runLauncher(root, [], {}, host);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
  });

  it.each(nonStandardSyntaxHostCases)("rejects $label before the paid-mode key prompt with $host", ({ json, host }) => {
    const root = makeFixture();
    writeProfile(root, json);
    patchInteractivePrompt(root);
    const child = runLauncher(root, ["-ExecuteOne"], {}, host);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
  });

  it.each(powerShellHosts)("rejects a UTF-16 profile before starting the default offline child with %s", (host) => {
    const root = makeFixture();
    writeProfileBytes(root, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(canonicalJson, "utf16le")]));
    const child = runLauncher(root, [], {}, host);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
  });

  it.each(powerShellHosts)("rejects a UTF-16 profile before the paid-mode key prompt with %s", (host) => {
    const root = makeFixture();
    writeProfileBytes(root, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(canonicalJson, "utf16le")]));
    patchInteractivePrompt(root);
    const child = runLauncher(root, ["-ExecuteOne"], {}, host);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
  });

  it.each(powerShellHosts)("accepts the checked-in pretty profile and strict JSON syntax variants with %s", (host) => {
    const prettyRoot = makeFixture();
    writeProfile(prettyRoot, readFileSync(resolve("app/server/research/local-validation-profile.json"), "utf8"));
    const prettyChild = runLauncher(prettyRoot, [], {}, host);
    expect(prettyChild.status).toBe(0);
    expect(existsSync(join(prettyRoot, "child-finished.txt"))).toBe(true);

    const variantRoot = makeFixture();
    writeProfile(variantRoot, strictJsonVariant);
    const variantChild = runLauncher(variantRoot, [], {}, host);
    expect(variantChild.status).toBe(0);
    expect(existsSync(join(variantRoot, "child-finished.txt"))).toBe(true);
  });

  it("rejects conflicting modes before profile selection, prompt, or child start", () => {
    const root = makeFixture();
    patchInteractivePrompt(root);
    const child = runLauncher(root, ["-ExecuteOne", "-CheckKeyOnly"]);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-mode-conflict).");
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(false);
    expect(existsSync(join(root, "child-started.txt"))).toBe(false);
  });

  it("uses the fixed profile for offline validation and allows work past the old launcher deadline", () => {
    const root = makeFixture();
    scaleDeadlines(root);
    const child = runLauncher(root, [], { SYNTHETIC_RUNNER_DELAY_MS: "900" });

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toContain("Offline dry-run: profile kimi-low-output32k-v3; moonshotai/kimi-k3; reasoning low; 32768 output tokens; Provider deadline 20 minutes; launcher total deadline 22 minutes; authored fixture only; 0 real requests.");
    expect(child.stdout).toContain("SYNTHETIC_RUNNER_STDOUT");
    expect(child.stderr).toContain("SYNTHETIC_RUNNER_STDERR");
    expect(existsSync(join(root, "child-finished.txt"))).toBe(true);
  });

  it("kills a full-validation child that exceeds the single total deadline", async () => {
    const root = makeFixture();
    scaleDeadlines(root);
    const child = runLauncher(root, [], { SYNTHETIC_RUNNER_DELAY_MS: "1800" });
    await boundedDelay(600);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "child-started.txt"))).toBe(true);
    expect(existsSync(join(root, "child-finished.txt"))).toBe(false);
    expect(child.stdout + child.stderr).not.toMatch(/usage|database|zero.?charge/iu);
  });

  it.each([
    ["key-only", ["-CheckKeyOnly"]],
    ["account-only", ["-CheckAccountOnly"]],
    ["minimal probe", ["-ProbeMinimal"]],
  ] as const)("keeps the original total deadline for %s without selecting the local profile", (_label, args) => {
    const root = makeFixture();
    patchInteractivePrompt(root);
    scaleDeadlines(root);
    rmSync(join(root, "app", "server", "research", "local-validation-profile.json"));
    const child = runLauncher(root, [...args], { SYNTHETIC_RUNNER_DELAY_MS: "350" });

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "prompt-sentinel.txt"))).toBe(true);
    expect(existsSync(join(root, "child-started.txt"))).toBe(true);
    expect(existsSync(join(root, "child-finished.txt"))).toBe(false);
  });

  it("charges inherited stdout and stderr drain time to the same total deadline", async () => {
    const root = makeFixture();
    scaleDeadlines(root);
    const child = runLauncher(root, [], {
      SYNTHETIC_RUNNER_MODE: "inherited-handles",
      SYNTHETIC_RUNNER_DELAY_MS: "900",
      SYNTHETIC_GRANDCHILD_DELAY_MS: "1500",
    });
    await boundedDelay(400);

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr.trim()).toBe("Live validation stopped (launcher-failed).");
    expect(existsSync(join(root, "child-finished.txt"))).toBe(true);
    expect(existsSync(join(root, "grandchild-finished.txt"))).toBe(true);
  });
});
