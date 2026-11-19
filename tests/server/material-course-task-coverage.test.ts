// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { ConfirmedMaterialItem } from "../../app/contracts/documents";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { mapMaterialItemTerms, mapMaterialPracticeSkills } from "../../app/lib/materials/skill-mapper";
import { createCourseTaskCoverageEvaluator } from "../../app/lib/materials/course-task-coverage";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { materialContextRequest, materialNow, seedMaterialSelection } from "../helpers/material-planning";

const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
const fact = (text: string, skillLabels: string[], id = "fact"): ConfirmedMaterialItem => ({
  id, text, skillLabels, kind: "requirement", requirementLevel: "must", origin: "user", sourceRef: null,
});
function setup(items: ConfirmedMaterialItem[], registry = flagshipUnitRegistry, blueprint = flagshipBlueprint) {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  db.database.prepare("UPDATE document_confirmations SET items_json=? WHERE id='confirmation-a'").run(JSON.stringify(items));
  const sourceResolver = new PlanningSourceResolver({ intelligence: { getPublished: async () => blueprint }, flagshipRegistry: registry });
  let next = 0;
  const materials = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver, now: materialNow, createId: () => `coverage-${++next}` });
  return { db, materials };
}

describe("content-backed course task coverage", () => {
  it("distinguishes a topic name, a narrow taught task, an unsupported query and a mixed task", async () => {
    const items = [fact("SQL", ["SQL"], "name"),
      fact("Design SQL entities, keys, ownership and delete behavior.", ["SQL"], "narrow"),
      fact("Write SQL window queries.", ["SQL"], "window"),
      fact("Design SQL entities, keys, ownership and delete behavior, then optimize window queries.", ["SQL"], "mixed")];
    const { materials } = setup(items);
    const { preview } = await materials.create("owner-a", materialContextRequest());
    expect(preview.mappingDetails?.map(detail => detail.taskCoverage)).toEqual([
      { status: "none", support: [], remaining: "unspecified-task" },
      { status: "full", support: ["sql-schema"], remaining: null },
      { status: "none", support: [], remaining: "unassessed-scope" },
      { status: "partial", support: ["sql-schema"], remaining: "unassessed-scope" },
    ]);
    expect(preview.mappingDetails?.every(detail => detail.status === "mapped" && detail.skillIds[0] === "sql")).toBe(true);
  });

  it("does not merge same-topic terms with different coverage and recomputes a manual course choice", async () => {
    const text = "Write ownership-safe SQL joins. Write SQL window queries.";
    const { materials } = setup([fact(text, ["ownership-safe SQL joins", "SQL window queries"])]);
    const first = await materials.create("owner-a", materialContextRequest());
    expect(first.preview.mappingDetails).toMatchObject([
      { termIndexes: [0], status: "mapped", skillIds: ["sql"], taskCoverage: { status: "full", support: ["sql-joins"] } },
      { termIndexes: [1], status: "mapped", skillIds: ["sql"], taskCoverage: { status: "none", support: [] } },
    ]);
    const chosen = await materials.create("owner-a", { ...materialContextRequest(), mutationId: "wrong-course", termMappings: [
      { confirmationId: "confirmation-a", itemId: "fact", skillLabel: "ownership-safe SQL joins", skillIds: ["react"] },
    ] });
    expect(chosen.preview.mappingDetails?.[0]).toMatchObject({ basis: "manual", skillIds: ["react"], taskCoverage: { status: "none", support: [], remaining: "unassessed-scope" } });
  });

  it("invalidates a claim when its exact content leaf changes even at the same catalog version", async () => {
    const registry = structuredClone(flagshipUnitRegistry);
    registry.tracks.find(track => track.skillId === "sql")!.templates.find(unit => unit.id === "sql-learn-01")!.buildTask = "Review a database glossary.";
    const { materials } = setup([fact("Design SQL entities, keys, ownership and delete behavior.", ["SQL"])], registry);
    expect((await materials.create("owner-a", materialContextRequest())).preview.mappingDetails?.[0]).toMatchObject({
      status: "mapped", taskCoverage: { status: "none", support: [], remaining: "unverified-content" },
    });
  });

  it("requires the exact narrowing criterion and never inherits evidence in Research or an invalid registry", () => {
    const item = fact("Create a strict TypeScript schema with inferred request/result types and exhaustive narrowing.", ["TypeScript"]);
    const [detail] = mapMaterialItemTerms([item], flagshipBlueprint, flagshipUnitRegistry);
    const changed = structuredClone(flagshipUnitRegistry);
    changed.tracks.find(track => track.skillId === "typescript")!.templates[0]!.completionCriteria[1] = "Print the result type.";
    for (const [blueprint, registry] of [
      [flagshipBlueprint, changed],
      [{ ...flagshipBlueprint, id: "research-other" }, { ...flagshipUnitRegistry, blueprintId: "research-other" }],
      [flagshipBlueprint, { ...flagshipUnitRegistry, id: "another-catalog" }],
      [flagshipBlueprint, { ...flagshipUnitRegistry, tracks: [] }],
    ] satisfies [typeof flagshipBlueprint, typeof flagshipUnitRegistry][]) expect(createCourseTaskCoverageEvaluator(blueprint, registry)(detail!, item)).toEqual({
      status: "none", support: [], remaining: "unverified-content",
    });
    expect(createCourseTaskCoverageEvaluator(flagshipBlueprint, flagshipUnitRegistry, "research")(detail!, item)).toEqual({
      status: "none", support: [], remaining: "unverified-content",
    });
  });

  it("keeps unknown modifiers and tool-specific tasks outside full coverage", async () => {
    const { materials } = setup([
      fact("Create a strict TypeScript schema with inferred request/result types and exhaustive narrowing.", ["TypeScript"], "types"),
      fact("Build a TypeScript date formatter and test async timeouts.", ["TypeScript"], "date"),
      fact("Build a React form with loading, success, failure and retry states and an arbitrary analytics prototype.", ["React"], "react"),
      fact("Write focused software behavior tests from RED to GREEN for a Kubernetes operator.", ["testing"], "tests"),
      fact("Build a labeled semantic HTML form. Add a WebGPU simulation.", ["HTML"], "extra"),
    ]);
    expect((await materials.create("owner-a", materialContextRequest())).preview.mappingDetails?.map(detail => detail.taskCoverage)).toEqual([
      { status: "full", support: ["typescript-contract"], remaining: null },
      { status: "none", support: [], remaining: "unassessed-scope" },
      { status: "partial", support: ["react-form"], remaining: "unassessed-scope" },
      { status: "partial", support: ["behavior-tests"], remaining: "unassessed-scope" },
      { status: "partial", support: ["semantic-form"], remaining: "unassessed-scope" },
    ]);
  });

  it("retains a soft-wrapped unknown modifier in a multi-label task scope", async () => {
    const { materials } = setup([fact("Build a labeled semantic HTML form\nwith a WebGPU simulation. Use SQL.", ["HTML", "SQL"])]);
    const { preview } = await materials.create("owner-a", materialContextRequest());
    expect(preview.mappingDetails?.find(detail => detail.termIndexes.includes(0))).toMatchObject({
      status: "mapped", skillIds: ["web-platform"],
      taskCoverage: { status: "partial", support: ["semantic-form"], remaining: "unassessed-scope" },
    });
  });

  it("recognizes the other narrow taught families without equating links with teaching", async () => {
    const { materials } = setup([
      fact("Build a labeled semantic HTML form.", ["HTML"], "form"),
      fact("Audit component semantics, focus and contrast.", ["component semantics, focus and contrast"], "component"),
      fact("Choose software logs and traces for event details and cross-boundary latency.", ["logs"], "signals"),
      fact("Write a release checklist with build gates, smoke checks and rollback triggers.", ["release checklist"], "release"),
      fact("Operate Kubernetes: https://example.com/release-checklist", ["Kubernetes"], "link"),
    ]);
    expect((await materials.create("owner-a", materialContextRequest())).preview.mappingDetails?.map(detail => detail.taskCoverage)).toEqual([
      { status: "full", support: ["semantic-form"], remaining: null },
      { status: "full", support: ["component-audit"], remaining: null },
      { status: "full", support: ["software-signals"], remaining: null },
      { status: "full", support: ["release-checklist"], remaining: null },
      { status: "none", support: [], remaining: "unassessed-scope" },
    ]);
  });

  it("does not use task coverage to adopt ability, practice or an unadopted priority", async () => {
    const item = { ...fact("Design SQL entities, keys, ownership and delete behavior.", ["SQL"]), kind: "constraint" as const, requirementLevel: null };
    const { db, materials } = setup([item]);
    db.database.exec("UPDATE material_selection_entries SET slot='supplement'");
    const request = materialContextRequest();
    const before = await materials.create("owner-a", request);
    expect(before.preview.mappingDetails?.[0]?.taskCoverage).toEqual({ status: "not-applicable", support: [], remaining: null });
    expect(before.preview.priorities).toEqual([]);
    const adopted = await materials.create("owner-a", { ...request, mutationId: "adopt-intent", learningIntents: [{ confirmationId: "confirmation-a", itemId: "fact" }] });
    expect(adopted.preview.mappingDetails?.[0]?.taskCoverage?.status).toBe("full");
    expect(adopted.preview.priorities[0]).toMatchObject({ tier: 3, practiceItemIds: [] });
    const saved = db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(adopted.contextVersionId) as { snapshot_json: string };
    expect(JSON.parse(saved.snapshot_json).audit).toEqual(request.audit);
    const omitted = await materials.create("owner-a", { ...request, mutationId: "omit", learningIntents: [{ confirmationId: "confirmation-a", itemId: "fact" }], termMappings: [{ confirmationId: "confirmation-a", itemId: "fact", skillLabel: "SQL", skillIds: [] }] });
    expect(omitted.preview.mappingDetails?.[0]?.taskCoverage).toEqual({ status: "not-applicable", support: [], remaining: null });
    expect(omitted.preview.priorities).toEqual([]);
  });

  it("distinguishes explicit topic conjunction from alternatives and keeps each actor's practice evidence", () => {
    const compound = fact("I wrote SQL queries and my colleague used TypeScript.", ["I wrote SQL queries and my colleague used TypeScript"]);
    const alternatives = fact("Use SQL or TypeScript.", ["SQL or TypeScript"]);
    expect(mapMaterialItemTerms([compound], flagshipBlueprint, flagshipUnitRegistry)).toMatchObject([{ status: "mapped", skillIds: ["typescript", "sql"] }]);
    expect(mapMaterialItemTerms([alternatives], flagshipBlueprint, flagshipUnitRegistry)).toMatchObject([{ status: "ambiguous", skillIds: ["typescript", "sql"] }]);
    expect(mapMaterialPracticeSkills([{ ...compound, kind: "experience", requirementLevel: null }], flagshipBlueprint, flagshipUnitRegistry)).toEqual([{ itemId: "fact", skillId: "sql" }]);
    expect(mapMaterialPracticeSkills([{ ...compound, text: "I have never used SQL and I wrote TypeScript.", skillLabels: ["I have never used SQL and I wrote TypeScript"], kind: "experience", requirementLevel: null }], flagshipBlueprint, flagshipUnitRegistry)).toEqual([{ itemId: "fact", skillId: "typescript" }]);
  });
});
