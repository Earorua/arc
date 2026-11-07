import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, version as esbuildVersion } from "esbuild";
import ts from "typescript";

export const COURSE_DATA_FILES = [
  "app/data/flagship-role.ts",
  "app/data/flagship-blueprint.ts",
  "app/data/flagship-unit-registry.ts",
];
export const COURSE_SCHEMA_FILES = ["app/contracts/intelligence.ts", "app/contracts/planning.ts"];
export const COURSE_TYPE_FILES = ["app/domain/learning.ts"];
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const relativePath = (root, file) => path.relative(root, file).split(path.sep).join("/");

/** Execute only the local course data and its schema dependency closure. No URLs are fetched. */
export async function captureCourseReference({ root = repositoryRoot } = {}) {
  const allowedProjectModules = new Set([...COURSE_DATA_FILES, ...COURSE_SCHEMA_FILES]);
  const result = await build({
    absWorkingDir: root,
    stdin: {
      contents: [
        'export { flagshipRole } from "./app/data/flagship-role.ts";',
        'export { flagshipBlueprint } from "./app/data/flagship-blueprint.ts";',
        'export { flagshipUnitRegistry } from "./app/data/flagship-unit-registry.ts";',
      ].join("\n"),
      sourcefile: "course-reference-entry.mjs",
      resolveDir: root,
      loader: "js",
    },
    platform: "node",
    format: "esm",
    bundle: true,
    write: false,
    metafile: true,
    logLevel: "silent",
    plugins: [{
      name: "course-data-and-schema-only",
      setup(builder) {
        builder.onLoad({ filter: /.*/ }, ({ path: file }) => {
          const name = relativePath(root, file);
          if (!allowedProjectModules.has(name) && !name.startsWith("node_modules/zod/")) {
            throw new Error(`Course capture refuses non-course module: ${name}`);
          }
          return undefined;
        });
      },
    }],
  });
  const bundledInputs = Object.keys(result.metafile.inputs).filter((file) => file !== "course-reference-entry.mjs");
  for (const file of bundledInputs) {
    if (!allowedProjectModules.has(file) && !file.startsWith("node_modules/zod/")) {
      throw new Error(`Unexpected capture dependency: ${file}`);
    }
  }
  if (result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].imports.length !== 0) {
    throw new Error("Course capture must have no external runtime imports");
  }
  const bundle = result.outputFiles[0].text;
  // Computed import() calls do not appear in esbuild's resolved dependency list.
  // Inspect actual syntax before evaluating the bundle; source text is not a regex.
  const syntax = ts.createSourceFile("course-reference-bundle.mjs", bundle, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (syntax.parseDiagnostics.length) throw new Error("Course capture could not parse the bundle for runtime-import inspection");
  const inspectImports = (node) => {
    if ((ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      || ts.isImportDeclaration(node)
      || (ts.isExportDeclaration(node) && node.moduleSpecifier)) {
      throw new Error("Course capture must have no external runtime imports, including unresolved computed imports");
    }
    ts.forEachChild(node, inspectImports);
  };
  inspectImports(syntax);
  const exports = await import(`data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`);
  const objects = Object.fromEntries([
    ["role", "flagshipRole", COURSE_DATA_FILES[0]],
    ["blueprint", "flagshipBlueprint", COURSE_DATA_FILES[1]],
    ["registry", "flagshipUnitRegistry", COURSE_DATA_FILES[2]],
  ].map(([key, exportName, sourcePath]) => {
    const value = JSON.parse(JSON.stringify(exports[exportName]));
    return [key, { exportName, sourcePath, sha256: sha256(canonicalJson(value)), value }];
  }));
  const dependencyPaths = [...new Set([...bundledInputs, ...COURSE_TYPE_FILES])].sort();
  const dependencies = await Promise.all(dependencyPaths.map(async (file) => {
    const bytes = await readFile(path.join(root, file));
    return { path: file, sha256: sha256(bytes), byteLength: bytes.length, kind: COURSE_TYPE_FILES.includes(file) ? "type-only" : "bundled" };
  }));
  const sourceFiles = await Promise.all(COURSE_DATA_FILES.map(async (file) => {
    const bytes = await readFile(path.join(root, file));
    return { path: file, sha256: sha256(bytes), byteLength: bytes.length, content: bytes.toString("utf8") };
  }));
  return {
    schemaVersion: "materials-course-reference-v2-draft.1",
    id: "materials-course-reference-20261107-draft-1",
    capturedAt: "2026-11-07",
    capture: {
      method: "local-esbuild-allowlisted-data-and-schema-only",
      esbuildVersion,
      objectHashEncoding: "sha256(UTF-8 canonical JSON; object keys sorted; array order retained)",
      bundleSha256: sha256(bundle),
      networkRequests: 0,
      externalLinksFetched: 0,
      entrypoints: COURSE_DATA_FILES,
    },
    sourceFiles,
    dependencies,
    objects,
    inventory: {
      roleSkillIds: objects.role.value.skills.map((skill) => skill.id),
      blueprintSkillIds: objects.blueprint.value.skills.map((skill) => skill.id),
      trackSkillIds: objects.registry.value.tracks.map((track) => track.skillId),
      templateIds: objects.registry.value.tracks.flatMap((track) => track.templates.map((unit) => unit.id)),
    },
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const reference = await captureCourseReference();
    if (process.argv.slice(2).length !== 1 || process.argv[2] !== "--write") {
      throw new Error("Usage: capture-course-reference.mjs --write (overwrites only its adjacent snapshot)");
    }
    const output = new URL("./course-reference.snapshot.json", import.meta.url);
    const serialized = `${JSON.stringify(reference, null, 2)}\n`;
    await writeFile(output, serialized, "utf8");
    console.log(JSON.stringify({ path: fileURLToPath(output), sha256: sha256(serialized), objectHashes: Object.fromEntries(Object.entries(reference.objects).map(([name, object]) => [name, object.sha256])), dependencies: reference.dependencies.length, tracks: reference.objects.registry.value.tracks.length, templates: reference.inventory.templateIds.length }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
