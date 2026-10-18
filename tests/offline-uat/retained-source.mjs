import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { posix, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import ts from "typescript";

export const RETAINED_COMMIT = "7ca5b530dfc58f3cbc700b44a7a881a9bd661209";
export const RETAINED_TREE = "d0693b0a6bb0d13ded951d2df44aaab24f69ffe3";
export const RETAINED_MANIFEST = Object.freeze([
  { path: "app/contracts/cloud-state.ts", blob: "c028b3050261fe1f8496d502e77d1bfe0168ad5d" },
  { path: "app/lib/demo-store.ts", blob: "1910a1e73785259de66307d45bde7a92bb5d3d87" },
  { path: "app/server/cloud/d1-cloud-repository.ts", blob: "4deeb0291a6bec637076e7ae4ca338cf02bfce35" },
  { path: "app/server/cloud/service.ts", blob: "4d8884913d292dea52349f0fab65e357045667a7" },
  { path: "app/server/proof/d1-proof-repository.ts", blob: "2f53245861448aa29c8b05a303f882346fc8c8b6" },
  { path: "app/server/proof/storage.ts", blob: "fa9de7a660a3b82b89b30fbfcbd85e77d2f044b4" },
  { path: "app/server/proof/public-view.ts", blob: "5d48c3953a0fd1e80a6179b6e3c3fea093c1a4d3" },
].map(Object.freeze));

const root = fileURLToPath(new URL("../../", import.meta.url));
const execFile = promisify(execFileCallback);
const expectedManifest = RETAINED_MANIFEST.map(({ path, blob }) => ({ path, blob }));
const manifestByPath = new Map(expectedManifest.map((entry) => [entry.path, entry]));
const nodeRequire = createRequire(import.meta.url);
const zod = nodeRequire("zod");

function gitBlobHash(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.byteLength}\0`))
    .update(bytes)
    .digest("hex");
}

export function validateRetainedSourceBytes(sources) {
  if (!(sources instanceof Map) || sources.size !== expectedManifest.length) {
    throw new Error("Retained source manifest is incomplete");
  }
  for (const { path, blob } of expectedManifest) {
    const bytes = sources.get(path);
    if (!Buffer.isBuffer(bytes) || gitBlobHash(bytes) !== blob) {
      throw new Error(`Retained source hash mismatch: ${path}`);
    }
  }
  for (const path of sources.keys()) {
    if (!manifestByPath.has(path)) throw new Error(`Retained source is outside the fixed manifest: ${path}`);
  }
  return true;
}

function normalizeRelativeImport(importer, request) {
  const normalized = posix.normalize(posix.join(posix.dirname(importer), request));
  const candidates = normalized.endsWith(".ts") ? [normalized] : [`${normalized}.ts`, normalized];
  return candidates.find((candidate) => manifestByPath.has(candidate)) ?? null;
}

export function validateRetainedImport(importer, request) {
  if (!manifestByPath.has(importer) || typeof request !== "string") {
    throw new Error("Retained import is outside the closed runtime graph");
  }
  if (request === "zod") return { kind: "external", id: "zod" };
  if (!request.startsWith(".")) throw new Error("Retained import is outside the closed runtime graph");
  const target = normalizeRelativeImport(importer, request);
  if (!target) throw new Error("Retained import is outside the closed runtime graph");
  return { kind: "retained", id: target };
}

async function gitBytes(args) {
  const { stdout } = await execFile("git", args, {
    cwd: resolve(root),
    encoding: "buffer",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  return Buffer.from(stdout);
}

async function readVerifiedSources() {
  const tree = (await gitBytes(["rev-parse", `${RETAINED_COMMIT}^{tree}`])).toString("utf8").trim();
  if (tree !== RETAINED_TREE) throw new Error("Retained archive tree mismatch");
  const entries = await Promise.all(expectedManifest.map(async ({ path }) => [
    path,
    await gitBytes(["show", `${RETAINED_COMMIT}:${path}`]),
  ]));
  const sources = new Map(entries);
  validateRetainedSourceBytes(sources);
  return sources;
}

function transpileVerifiedSources(sources) {
  const output = new Map();
  for (const { path } of expectedManifest) {
    const result = ts.transpileModule(sources.get(path).toString("utf8"), {
      fileName: path,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.Node10,
      },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics ?? []).filter(({ category }) => category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(`Retained TypeScript transpilation failed: ${path}`);
    output.set(path, result.outputText);
  }
  return output;
}

function validateRuntimeImports(transpiled) {
  for (const [importer, source] of transpiled) {
    for (const match of source.matchAll(/require\(["']([^"']+)["']\)/gu)) {
      validateRetainedImport(importer, match[1]);
    }
  }
}

function evaluateVerifiedSources(transpiled) {
  validateRuntimeImports(transpiled);
  const cache = new Map();
  const evaluate = (path) => {
    if (cache.has(path)) return cache.get(path).exports;
    const cjsModule = { exports: {} };
    cache.set(path, cjsModule);
    const localRequire = (request) => {
      const resolved = validateRetainedImport(path, request);
      return resolved.kind === "external" ? zod : evaluate(resolved.id);
    };
    const compiled = new Function("require", "module", "exports", `"use strict";\n${transpiled.get(path)}`);
    compiled(localRequire, cjsModule, cjsModule.exports);
    return cjsModule.exports;
  };
  return Object.fromEntries(expectedManifest.map(({ path }) => [path, evaluate(path)]));
}

export async function loadRetainedArchive() {
  const zodVersion = `${zod.core.version.major}.${zod.core.version.minor}.${zod.core.version.patch}`;
  if (ts.version !== "5.9.3" || zodVersion !== "4.4.3") {
    throw new Error("Retained runtime dependency version mismatch");
  }
  const sources = await readVerifiedSources();
  const modules = evaluateVerifiedSources(transpileVerifiedSources(sources));
  return {
    commit: RETAINED_COMMIT,
    tree: RETAINED_TREE,
    verifiedSourceCount: sources.size,
    runtimeVersions: { typescript: ts.version, zod: zodVersion },
    modules,
  };
}
