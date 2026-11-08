// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { ConfirmedMaterialItem } from "../../app/contracts/documents";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { materialContextRequest, materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";

const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
const fact = (text: string, skillLabels?: string[]): ConfirmedMaterialItem => ({
  id: "practice-fact", kind: "experience", text, origin: "user", sourceRef: null, requirementLevel: null,
  ...(skillLabels === undefined ? {} : { skillLabels }),
});
const longFact = "I wrote SQL queries for monthly reports and reviewed the results with finance to correct inconsistent totals before sending the final dataset to the reporting team.";
function setup(items: ConfirmedMaterialItem[], slot: "resume" | "jd" | "supplement" = "resume") {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  db.database.prepare("UPDATE documents SET kind=?").run(slot);
  db.database.prepare("UPDATE material_selection_entries SET slot=?").run(slot);
  db.database.prepare("UPDATE document_confirmations SET items_json=? WHERE id='confirmation-a'").run(JSON.stringify(items));
  let id = 0;
  const materials = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver: materialSourceResolver(), now: materialNow, createId: () => `practice-context-${++id}` });
  return { db, materials };
}

describe("personal practice priorities from confirmed material relations", () => {
  it.each([
    ["denied SQL", "I have never used SQL.", ["SQL"], []],
    ["colleague SQL", "My colleague wrote SQL queries.", ["SQL"], []],
    ["future SQL", "I plan to learn SQL next month.", ["SQL"], []],
    ["own React and colleague SQL", "I built React components; my colleague wrote SQL queries.", ["React", "SQL"], ["react"]],
  ] as const)("keeps %s mapped without borrowing personal practice", async (_name, text, labels, expected) => {
    const { db, materials } = setup([fact(text, [...labels])]);
    const request = materialContextRequest();
    const { preview, contextVersionId } = await materials.create("owner-a", request);
    expect(preview.mappingDetails?.filter(row => row.status === "mapped").flatMap(row => row.skillIds).sort())
      .toEqual(labels.map(label => label.toLowerCase()).sort());
    expect(preview.priorities.map(row => row.skillId).sort()).toEqual(expected);
    expect(preview.confirmedItems[0]).toMatchObject({ text, skillLabels: labels });
    expect(preview.itemReferences?.[0]).not.toHaveProperty("learningIntentEligible");
    const saved = db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(contextVersionId) as { snapshot_json: string };
    expect(JSON.parse(saved.snapshot_json)).toMatchObject({ audit: request.audit, availability: request.availability, target: request.target });
    expect((await materials.read("owner-a", contextVersionId)).preview).toEqual(preview);
  });

  it("retains a personal SQL practice priority", async () => {
    const { materials } = setup([fact("I wrote SQL queries.", ["SQL"])]);
    const { preview } = await materials.create("owner-a", materialContextRequest());
    expect(preview.priorities).toEqual([{ skillId: "sql", tier: 3, itemIds: [preview.confirmedItems[0]!.id] }]);
  });

  it.each([
    "I tested SQL under my mentor's guidance.",
    "I tested SQL without guidance.",
    "I tested the SQL queries supplied by my mentor.",
    "I modified the SQL supplied by my mentor.",
    "I only changed parameters in the supplied SQL queries.",
    "My mentor supplied SQL; I only changed parameters in the SQL queries.",
    "I wrote SQL queries, but I have never configured SQL for production.",
    longFact,
    "SQL",
  ])("retains bounded personal practice without changing self-assessment: %s", async text => {
    const { db, materials } = setup([fact(text)]);
    const request = materialContextRequest();
    const { preview, contextVersionId } = await materials.create("owner-a", request);
    expect(preview.priorities.map(row => [row.skillId, row.tier])).toEqual([["sql", 3]]);
    const saved = db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(contextVersionId) as { snapshot_json: string };
    expect(JSON.parse(saved.snapshot_json).audit).toEqual(request.audit);
  });

  it.each([
    ["I wrote SQL queries, but I have never configured SQLite.", ["sql"]],
    ["I have never used SQL, but I configured SQLite.", ["sql"]],
    ["I have never used SQL; my colleague configured SQLite.", []],
  ] as const)("checks alternative words for one automatic course independently: %s", async (text, expected) => {
    const { materials } = setup([fact(text)]);
    const { preview } = await materials.create("owner-a", materialContextRequest());
    expect(preview.mappingDetails).toEqual([{ itemId: preview.confirmedItems[0]!.id, termIndexes: [-1], status: "mapped", skillIds: ["sql"], basis: "literal" }]);
    expect(preview.priorities.map(row => row.skillId)).toEqual(expected);
  });

  it.each([
    ["Built accessible product interfaces.", ["react"]],
    [longFact, ["react"]],
    ["I have never used SQL.", []],
    ["I built React components; my colleague wrote SQL queries.", []],
  ] as const)("uses confirmed whole-fact evidence for a nonliteral manual relation: %s", async (text, expected) => {
    const { materials } = setup([fact(text)]);
    const { preview } = await materials.create("owner-a", { ...materialContextRequest(),
      skillMappings: [{ confirmationId: "confirmation-a", itemId: "practice-fact", skillId: "react" }],
    });
    expect(preview.mappingDetails?.[0]).toMatchObject({ status: "mapped", skillIds: ["react"], basis: "manual" });
    expect(preview.priorities.map(row => row.skillId)).toEqual(expected);
  });

  it.each([
    ["I wrote SQL queries; my colleague built React components.", ["react"]],
    ["I have never used SQL; I built React components.", []],
  ] as const)("uses the original SQL term for its manual React relation: %s", async (text, expected) => {
    const { materials } = setup([fact(text, ["SQL"])]);
    const { preview } = await materials.create("owner-a", { ...materialContextRequest(),
      termMappings: [{ confirmationId: "confirmation-a", itemId: "practice-fact", skillLabel: "SQL", skillIds: ["react"] }],
    });
    expect(preview.mappingDetails?.[0]).toMatchObject({ status: "mapped", skillIds: ["react"], basis: "manual" });
    expect(preview.priorities.map(row => row.skillId)).toEqual(expected);
  });

  it("keeps removed and explicitly omitted terms out of practice", async () => {
    const { materials } = setup([fact("I wrote SQL queries and built React components.", ["React"])]);
    const request = materialContextRequest();
    const retained = await materials.create("owner-a", request);
    expect(retained.preview.priorities.map(row => row.skillId)).toEqual(["react"]);
    const omitted = await materials.create("owner-a", { ...request, mutationId: "omit-react",
      termMappings: [{ confirmationId: "confirmation-a", itemId: "practice-fact", skillLabel: "React", skillIds: [] }],
    });
    expect(omitted.preview.priorities).toEqual([]);
    expect(omitted.preview.mappingDetails?.[0]).toMatchObject({ status: "omitted", skillIds: [] });
    await expect(materials.create("owner-a", { ...request, mutationId: "restore-sql",
      termMappings: [{ confirmationId: "confirmation-a", itemId: "practice-fact", skillLabel: "SQL", skillIds: ["sql"] }],
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("keeps an empty retained list empty and rejects whole-fact overrides for labelled facts", async () => {
    const { materials } = setup([fact("I wrote SQL queries.", [])]);
    const request = materialContextRequest();
    const { preview } = await materials.create("owner-a", request);
    expect(preview.mappingDetails).toEqual([]); expect(preview.priorities).toEqual([]);
    await expect(materials.create("owner-a", { ...request, mutationId: "whole-override",
      skillMappings: [{ confirmationId: "confirmation-a", itemId: "practice-fact", skillId: "sql" }],
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("retains the ambiguity of an unlabelled fact matching multiple courses", async () => {
    const { materials } = setup([fact("I built React components; my colleague wrote SQL queries.")]);
    const { preview } = await materials.create("owner-a", materialContextRequest());
    expect(preview.mappingDetails?.[0]).toMatchObject({ status: "ambiguous", skillIds: ["react", "sql"] });
    expect(preview.priorities).toEqual([]);
  });

  it.each(["must", "preferred"] as const)("retains primary JD %s requirements without personal practice", async level => {
    const { materials } = setup([{ ...fact("The role requires SQL.", ["SQL"]), kind: "requirement", requirementLevel: level }], "jd");
    const { preview } = await materials.create("owner-a", materialContextRequest());
    expect(preview.priorities.map(row => [row.skillId, row.tier])).toEqual([["sql", level === "must" ? 0 : 4]]);
    expect(preview.overlay?.mandatorySkillIds).toEqual(level === "must" ? ["sql"] : []);
  });

  it.each(["requirement", "constraint"] as const)("requires separate learning-intent adoption for a supplemental %s", async kind => {
    const { materials } = setup([{ ...fact("I plan to learn SQL.", ["SQL"]), kind, requirementLevel: kind === "requirement" ? "unspecified" : null }], "supplement");
    const request = materialContextRequest();
    const before = await materials.create("owner-a", request);
    expect(before.preview.priorities).toEqual([]);
    expect(before.preview.itemReferences?.[0]?.learningIntentEligible).toBe(true);
    const after = await materials.create("owner-a", { ...request, mutationId: "adopt-topic",
      learningIntents: [{ confirmationId: "confirmation-a", itemId: "practice-fact" }],
    });
    expect(after.preview.priorities).toEqual([{ skillId: "sql", tier: 3, itemIds: [after.preview.confirmedItems[0]!.id], practiceItemIds: [], learningIntentItemIds: [after.preview.confirmedItems[0]!.id] }]);
  });

  it("does not adopt an unsupported ordinary experience as learning intent", async () => {
    const { materials } = setup([fact("I plan to learn SQL.", ["SQL"])]);
    await expect(materials.create("owner-a", { ...materialContextRequest(),
      learningIntents: [{ confirmationId: "confirmation-a", itemId: "practice-fact" }],
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("binds new contexts to policy 2026.11.3 without changing mapping identity or saved reads", async () => {
    expect(longFact).toHaveLength(164);
    const { db, materials } = setup([fact("I have never used SQL.", ["SQL"])]);
    const request = materialContextRequest();
    const first = await materials.create("owner-a", request);
    const row = db.database.prepare("SELECT snapshot_json, preview_json, fingerprint FROM material_context_versions WHERE id=?").get(first.contextVersionId) as { snapshot_json: string; preview_json: string; fingerprint: string };
    expect(JSON.parse(row.snapshot_json)).toMatchObject({ policyVersion: "2026.11.3", mappingVersion: "2026.11.5" });
    expect(first.preview.overlay?.policyVersion).toBe("2026.11.3");
    expect(JSON.parse(row.preview_json)).toEqual(first.preview);
    expect(await materials.create("owner-a", request)).toEqual(first);
    const reopened = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver: materialSourceResolver(), now: materialNow });
    expect((await reopened.read("owner-a", first.contextVersionId)).preview).toEqual(first.preview);
    expect(db.database.prepare("SELECT snapshot_json, preview_json, fingerprint FROM material_context_versions WHERE id=?").get(first.contextVersionId)).toEqual(row);
  });
});
