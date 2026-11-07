import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { before } from "node:test";
import { canonicalJson, captureCourseReference, sha256 } from "./capture-course-reference.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test("capture freezes all three complete course exports and their source dependencies", async () => {
  const captureModule = await import("./capture-course-reference.mjs").catch((error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  });
  const reference = await captureModule?.captureCourseReference({ root });
  assert.ok(reference?.objects?.role, "complete role export must be captured");
  assert.equal(reference.objects.role.value.version, "2026.07");
  assert.equal(reference.objects.blueprint.value.id, "ai-native-full-stack-engineer");
  assert.equal(reference.objects.blueprint.value.version, "2026.08.1");
  assert.equal(reference.objects.registry.value.id, "ai-native-full-stack-engineer-units");
  assert.equal(reference.objects.registry.value.version, "2026.08.1");
  assert.equal(reference.objects.registry.value.tracks.length, 16);
  assert.equal(reference.objects.registry.value.tracks.flatMap((track) => track.templates).length, 48);
  assert.equal(reference.sourceFiles.length, 3);
  assert.ok(reference.sourceFiles.every((file) => file.content.length > 1000 && /^[a-f0-9]{64}$/u.test(file.sha256)));
  for (const path of ["app/contracts/intelligence.ts", "app/contracts/planning.ts", "app/domain/learning.ts"]) {
    assert.ok(reference.dependencies.some((file) => file.path === path), `schema/type dependency ${path} must be frozen`);
  }
  assert.ok(reference.dependencies.some((file) => file.path.startsWith("node_modules/zod/")));
});

let annotations, snapshot, sourceAnnotationText, currentReference, validator, verifyFrozenInputFiles;
before(async () => {
  [annotations, snapshot, sourceAnnotationText, currentReference] = await Promise.all([
    readFile(new URL("./course-annotations.draft.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./course-reference.snapshot.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./annotations.draft.json", import.meta.url), "utf8"),
    captureCourseReference({ root }),
  ]);
  const validationModule = await import("./validate-course-annotations.mjs").catch((error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  });
  // Before implementation this deliberately models the missing validation gate.
  // Its acceptance of mutations must produce assertion failures, not import errors.
  validator = validationModule?.validateCourseAnnotations ?? (() => ({ valid: true, errors: [], totals: annotations.totals }));
  verifyFrozenInputFiles = validationModule?.verifyFrozenInputFiles;
});

const field = (ledger, id) => ledger.documents.flatMap((document) => document.fields).find((item) => item.fieldId === id);
const relation = (ledger, id, literal) => field(ledger, id).relations.find((item) => item.literal === literal);
const fresh = () => ({ annotations: structuredClone(annotations), snapshot: structuredClone(snapshot), sourceAnnotationText, currentReference });
const check = (input) => validator(input.annotations, { snapshot: input.snapshot, sourceAnnotationText: input.sourceAnnotationText, currentReference: input.currentReference });
const reject = (name, mutate, expectedCode) => test(name, () => {
  const input = fresh();
  mutate(input);
  const result = check(input);
  assert.equal(result.valid, false, "mutation must be rejected");
  assert.ok(result.errors.some((error) => error.code === expectedCode), `${expectedCode}: ${JSON.stringify(result.errors)}`);
});
const refreshSnapshotHash = (input) => {
  input.annotations.courseReference.sha256 = sha256(`${JSON.stringify(input.snapshot, null, 2)}\n`);
};
const rehashObject = (input, name) => {
  input.snapshot.objects[name].sha256 = sha256(canonicalJson(input.snapshot.objects[name].value));
  input.annotations.courseReference.objectHashes[name] = input.snapshot.objects[name].sha256;
  refreshSnapshotHash(input);
};

test("authored ledger accounts for every document, legacy field, additional field and finite literal", () => {
  const result = check(fresh());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.totals, annotations.totals);
  assert.equal(result.totals.documents, 30);
  assert.equal(result.totals.legacyFields, 84);
  assert.equal(result.totals.additionalFields, 2);
  assert.equal(result.totals.finiteLiteralRelations, 245);
  assert.equal(result.totals.nullNonLearningAccounts, 11);
  assert.equal(result.totals.relations, 256);
  assert.equal(annotations.documents.find((document) => document.documentId === "supplement-05").fields.length, 0);
});

test("positive controls retain full, partial, none and ambiguous as separate axes", () => {
  assert.equal(relation(annotations, "jd-05-field-1", "HTML").topic.basis, "contextual");
  assert.equal(relation(annotations, "jd-05-field-1", "HTML").taskCoverage.status, "full");
  assert.equal(relation(annotations, "jd-06-field-1", "SQL").taskCoverage.status, "partial");
  assert.equal(relation(annotations, "jd-07-field-1", "SQL").topic.status, "mapped");
  assert.equal(relation(annotations, "jd-07-field-1", "SQL").taskCoverage.status, "none");
  assert.equal(relation(annotations, "jd-08-field-2", "accessible form labels").topic.status, "ambiguous");
  assert.deepEqual(relation(annotations, "jd-08-field-2", "accessible form labels").topic.skillIds, ["web-platform", "design-systems"]);
  assert.equal(relation(annotations, "supplement-02-field-2", "trace").taskCoverage.status, "full");
  assert.equal(relation(annotations, "supplement-02-field-1", "OpenTelemetry").taskCoverage.status, "partial");
  assert.equal(relation(annotations, "resume-04-field-3", null).topic.status, "non-learning");
});

test("complete captured objects reproduce the frozen snapshot byte for byte", () => {
  assert.deepEqual(currentReference, snapshot);
  assert.equal(sha256(`${JSON.stringify(currentReference, null, 2)}\n`), annotations.courseReference.sha256);
});

test("an unspecified React prototype does not receive complete form-interaction test coverage", () => {
  const item = relation(annotations, "resume-09-field-2", "交互测试");
  assert.equal(item.taskCoverage.status, "partial");
  assert.ok(item.taskCoverage.uncoveredScope.some((scope) => scope.includes("非表单")));
});

test("TypeScript schema units do not count as an async behavior testing subset", () => {
  const item = relation(annotations, "jd-05-field-2", "TypeScript");
  assert.equal(item.topic.status, "mapped");
  assert.equal(item.topic.basis, "literal");
  assert.equal(item.taskCoverage.status, "none");
  assert.deepEqual(item.taskCoverage.supportedScope, []);
});

for (const [fieldId, literal] of [
  ["jd-05-field-2", "test asynchronous TypeScript behavior"],
  ["jd-05-field-2", "asynchronous TypeScript behavior"],
  ["resume-05-field-2", "unit tests for a TypeScript date formatter"],
]) {
  test(`combined phrase retains only the taught testing subset: ${fieldId} / ${literal}`, () => {
    const item = relation(annotations, fieldId, literal);
    assert.deepEqual(item.topic.skillIds, ["typescript", "testing"]);
    assert.equal(item.taskCoverage.status, "partial");
    assert.deepEqual(item.taskCoverage.supportedScope.flatMap((support) => support.skillIds), ["testing"]);
    for (const citation of item.taskCoverage.supportedScope.flatMap((support) => support.evidence)) {
      assert.equal(citation.object, "registry");
      assert.equal(snapshot.objects.registry.value.tracks[Number(citation.pointer.split("/")[2])].skillId, "testing");
    }
  });
}

test("CLI integrity check includes all three source inputs, including legacy scorer bytes", async (context) => {
  const testRoot = await mkdtemp(path.join(tmpdir(), "course-input-hashes-"));
  const files = ["quality-corpus.json", "supplement-quality-corpus.json", "document-quality-evaluation.ts", "basis.md"];
  context.after(async () => {
    await Promise.all(files.map((file) => unlink(path.join(testRoot, file))));
    await rmdir(testRoot);
  });
  await Promise.all(files.map((file) => writeFile(path.join(testRoot, file), `frozen ${file}`, "utf8")));
  const descriptors = files.map((file) => ({ path: file, sha256: sha256(`frozen ${file}`) }));
  const source = { inputHashes: descriptors.slice(0, 3), basis: descriptors.slice(3) };
  assert.deepEqual(await verifyFrozenInputFiles?.(source, { root: testRoot }), [], "unaltered corpus, scorer and basis bytes must pass");
  await writeFile(path.join(testRoot, files[2]), "changed scorer bytes", "utf8");
  const changed = await verifyFrozenInputFiles(source, { root: testRoot });
  assert.equal(changed.length, 1);
  assert.equal(changed[0].path, "document-quality-evaluation.ts");
  assert.equal(changed[0].actual, sha256("changed scorer bytes"));
});

test("capture rejects computed external imports before executing isolated source copies", async (context) => {
  const testRoot = await mkdtemp(path.join(tmpdir(), "course-dynamic-import-"));
  const files = [...snapshot.dependencies.map((dependency) => dependency.path), "node_modules/zod/package.json"];
  const directories = new Set([testRoot]);
  for (const file of files) {
    for (let directory = path.dirname(path.join(testRoot, file)); directory !== testRoot; directory = path.dirname(directory)) directories.add(directory);
  }
  context.after(async () => {
    delete globalThis.__courseDynamicExecuted;
    await Promise.all(files.map((file) => unlink(path.join(testRoot, file)).catch((error) => { if (error.code !== "ENOENT") throw error; })));
    for (const directory of [...directories].sort((left, right) => right.length - left.length)) await rmdir(directory);
  });
  await Promise.all([...directories].map((directory) => mkdir(directory, { recursive: true })));
  await Promise.all(files.map((file) => copyFile(path.join(root, file), path.join(testRoot, file))));
  const rolePath = path.join(testRoot, "app/data/flagship-role.ts");
  const original = await readFile(rolePath, "utf8");
  await writeFile(rolePath, `${original}\nimport { basename } from "node:path";\nglobalThis.__courseDynamicExecuted = basename("a/b");\n`);
  await assert.rejects(captureCourseReference({ root: testRoot }), /external runtime imports/u);
  assert.equal(globalThis.__courseDynamicExecuted, undefined);
  await writeFile(rolePath, `${original}\nconst requestedModule = "node:path";\nglobalThis.__courseDynamicExecuted = typeof (await import(requestedModule)).basename;\n`);
  await assert.rejects(captureCourseReference({ root: testRoot }), /external runtime imports/u);
  assert.equal(globalThis.__courseDynamicExecuted, undefined);
});

reject("rejects a missing document including the zero-field injection document", (input) => {
  input.annotations.documents = input.annotations.documents.filter((document) => document.documentId !== "supplement-05");
}, "document-coverage");
reject("rejects a missing legacy field", (input) => {
  input.annotations.documents[0].fields.shift();
}, "field-coverage");
reject("rejects a missing additional facet", (input) => {
  input.annotations.documents[0].fields = input.annotations.documents[0].fields.filter((item) => item.fieldKind !== "additional");
}, "field-coverage");
reject("rejects a missing required literal", (input) => {
  field(input.annotations, "resume-01-field-1").relations.shift();
}, "literal-coverage");
reject("rejects a missing optional literal", (input) => {
  const item = field(input.annotations, "resume-01-field-2");
  item.relations = item.relations.filter((entry) => entry.literal !== "清洗规则");
}, "literal-coverage");
reject("rejects a missing combined literal", (input) => {
  const item = field(input.annotations, "jd-04-field-1");
  item.relations = item.relations.filter((entry) => entry.literal !== "define product metrics and investigate retention cohorts");
}, "literal-coverage");
reject("rejects a missing explicit non-learning account", (input) => {
  field(input.annotations, "resume-04-field-3").relations = [];
}, "literal-coverage");
reject("rejects duplicate literal policies", (input) => {
  const item = field(input.annotations, "resume-01-field-1");
  item.relations.push(structuredClone(item.relations[0]));
}, "duplicate-literal");
reject("rejects duplicate field accounts", (input) => {
  input.annotations.documents[0].fields.push(structuredClone(input.annotations.documents[0].fields[0]));
}, "duplicate-field");
reject("rejects duplicate document accounts", (input) => {
  input.annotations.documents.push(structuredClone(input.annotations.documents[0]));
}, "duplicate-document");
reject("rejects invented literal aliases not allowed by the source ledger", (input) => {
  field(input.annotations, "resume-01-field-1").relations[0].literal = "PostgreSQL expert";
}, "literal-coverage");
reject("rejects a combined literal losing a semantic group", (input) => {
  relation(input.annotations, "jd-04-field-1", "define product metrics and investigate retention cohorts").groupIds = ["g1"];
}, "group-coverage");
reject("rejects an illegal course skill ID", (input) => {
  relation(input.annotations, "jd-07-field-1", "SQL").topic.skillIds = ["made-up-sql"];
}, "illegal-skill");
reject("rejects mapping every known topic to an empty course set", (input) => {
  relation(input.annotations, "jd-07-field-1", "SQL").topic.skillIds = [];
}, "topic-shape");
reject("rejects duplicate skill IDs", (input) => {
  relation(input.annotations, "jd-07-field-1", "SQL").topic.skillIds = ["sql", "sql"];
}, "topic-shape");
reject("rejects collapsing ambiguity to one candidate", (input) => {
  relation(input.annotations, "jd-08-field-2", "accessible form labels").topic.skillIds = ["web-platform"];
}, "topic-shape");
reject("rejects fabricated object quotations", (input) => {
  relation(input.annotations, "jd-03-field-1", "SQL").topic.evidence[0].quote = "Teaches every SQL query and warehouse model";
}, "citation");
reject("rejects an object citation to a nonexistent pointer", (input) => {
  relation(input.annotations, "jd-03-field-1", "SQL").topic.evidence[0].pointer = "/skills/999/name";
}, "citation");
reject("rejects a full-coverage claim supported by a course name alone", (input) => {
  const item = relation(input.annotations, "jd-03-field-1", "SQL");
  item.taskCoverage.supportedScope[0].evidence = [{ object: "blueprint", pointer: "/skills/6/name", quote: snapshot.objects.blueprint.value.skills[6].name }];
}, "task-evidence");
reject("rejects full coverage without task evidence", (input) => {
  relation(input.annotations, "jd-03-field-1", "SQL").taskCoverage.supportedScope = [];
}, "coverage-shape");
reject("rejects partial coverage with its uncovered scope removed", (input) => {
  relation(input.annotations, "jd-06-field-1", "SQL").taskCoverage.uncoveredScope = [];
}, "coverage-shape");
reject("rejects none coverage with invented supported scope", (input) => {
  relation(input.annotations, "jd-07-field-1", "SQL").taskCoverage.supportedScope = structuredClone(relation(input.annotations, "jd-03-field-1", "SQL").taskCoverage.supportedScope);
}, "coverage-shape");
reject("rejects full coverage while uncovered scope is retained", (input) => {
  relation(input.annotations, "jd-06-field-1", "SQL").taskCoverage.status = "full";
}, "coverage-shape");
reject("rejects support attributed to a different course than its citation", (input) => {
  relation(input.annotations, "jd-03-field-1", "SQL").taskCoverage.supportedScope[0].skillIds = ["react"];
}, "task-evidence");
reject("rejects title-only evidence for a second attributed support skill", (input) => {
  const support = relation(input.annotations, "jd-05-field-2", "test asynchronous TypeScript behavior").taskCoverage.supportedScope[0];
  support.skillIds.push("typescript");
  support.evidence.push({ object: "registry", pointer: "/tracks/1/templates/0/title", quote: snapshot.objects.registry.value.tracks[1].templates[0].title });
}, "task-evidence");
reject("rejects changing a contextual HTML relation to an unproved literal alias", (input) => {
  relation(input.annotations, "jd-05-field-1", "HTML").topic.basis = "literal";
  relation(input.annotations, "jd-05-field-1", "HTML").topic.aliasId = "html-is-web";
}, "alias");
reject("rejects non-learning resource metadata promoted to a course", (input) => {
  relation(input.annotations, "jd-11-field-3", null).topic.skillIds = ["cloud-delivery"];
}, "topic-shape");
reject("rejects changing frozen source quote", (input) => {
  field(input.annotations, "resume-11-field-3").sourceQuote = "I can configure a Kubernetes cluster myself.";
}, "source-mismatch");
reject("rejects changing a secondary source to primary authority", (input) => {
  field(input.annotations, "supplement-06-field-2").sourceRole = "primary-jd-requirement";
}, "source-mismatch");
reject("rejects changing source actor or negation metadata", (input) => {
  field(input.annotations, "resume-11-field-1").sourceSemantics.actor = "document-author";
}, "source-mismatch");
reject("rejects altered source-annotation bytes", (input) => {
  input.sourceAnnotationText += "\n";
}, "source-hash");
reject("rejects an altered frozen data file even when its self-hash is recomputed", (input) => {
  const file = input.snapshot.sourceFiles[0];
  file.content += "\n// changed course\n";
  file.sha256 = sha256(file.content);
  file.byteLength = Buffer.byteLength(file.content);
  refreshSnapshotHash(input);
}, "current-reference-mismatch");
reject("rejects a changed schema dependency digest", (input) => {
  input.snapshot.dependencies.find((item) => item.path === "app/contracts/planning.ts").sha256 = "0".repeat(64);
  refreshSnapshotHash(input);
}, "current-reference-mismatch");
reject("rejects a missing schema dependency", (input) => {
  input.snapshot.dependencies = input.snapshot.dependencies.filter((item) => item.path !== "app/contracts/planning.ts");
  refreshSnapshotHash(input);
}, "dependency-coverage");
reject("rejects a changed export even if caller updates all self-declared hashes", (input) => {
  input.snapshot.objects.blueprint.value.skills[0].why = "This edited course covers every task.";
  rehashObject(input, "blueprint");
}, "current-reference-mismatch");
reject("rejects a stale object hash", (input) => {
  input.snapshot.objects.registry.value.tracks[0].templates[0].objective = "invented coverage";
  refreshSnapshotHash(input);
}, "object-hash");
reject("rejects an altered blueprint version", (input) => {
  input.snapshot.objects.blueprint.value.version = "2027.01";
  input.annotations.courseReference.identity.blueprint.version = "2027.01";
  rehashObject(input, "blueprint");
}, "course-identity");
reject("rejects a registry missing a complete track", (input) => {
  input.snapshot.objects.registry.value.tracks.pop();
  rehashObject(input, "registry");
}, "registry-completeness");
reject("rejects a registry missing a template within a retained track", (input) => {
  input.snapshot.objects.registry.value.tracks[0].templates.pop();
  rehashObject(input, "registry");
}, "registry-completeness");
reject("rejects validation without independently recaptured exports", (input) => {
  input.currentReference = undefined;
}, "current-reference-required");
reject("rejects a changed snapshot digest", (input) => {
  input.annotations.courseReference.sha256 = "0".repeat(64);
}, "snapshot-hash");
reject("rejects inaccurate declared totals", (input) => {
  input.annotations.totals.relations += 1;
}, "totals");
