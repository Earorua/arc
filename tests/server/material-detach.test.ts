// @vitest-environment node
import { expect, it } from "vitest";
import type { MaterialSelectionEntry } from "../../app/contracts/documents";
import { planningEventInputSchema } from "../../app/contracts/planning";
import { documentEndpointContracts } from "../../app/contracts/documents-api";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { memoryBucket } from "../helpers/document-bucket";
import { materialContextRequest, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";
import { createDocumentRuntime } from "../../app/server/documents/runtime";
import { createDocumentRoute } from "../../app/server/http/document-route-factories";
import { UnauthenticatedError } from "../../app/server/auth/session";

async function setup(withResume = false) {
  const db = createMaterialsD1();
  seedMaterialSelection(db);
  const runtime = createDocumentRuntime({ DB: db as unknown as D1Database, DOCUMENT_ASSETS: memoryBucket(),
    ARC_DOCUMENTS_ENABLED: "true", ARC_DOCUMENT_PLANNING_ENABLED: "true" }, { sourceResolver: materialSourceResolver() });
  const { scope: draft, selectionRef: initialSelection, source, audit, availability, target, planningDate, selectedScope } = materialContextRequest();
  const entry: MaterialSelectionEntry = { slot: "jd", documentId: "doc-a", documentVersionId: "version-a", confirmationId: "confirmation-a" };
  let selectionRef = initialSelection;
  if (withResume) {
    const resume = await runtime.invoke("owner-a", "createDocument", { kind: "resume", displayName: "Synthetic resume", text: "SQL", mutationId: "save-resume" });
    const { documentId, documentVersionId, textVersionId } = resume;
    const { draft: review } = await runtime.invoke("owner-a", "saveDocumentReviewDraft", { documentId, textVersionId, extractionId: null,
      items: [{ id: "skill", kind: "experience", text: "SQL", sourceRef: null, origin: "user", requirementLevel: null }], selfAssessmentHints: [], expectedRevision: 0, mutationId: "review-resume" });
    const { confirmationId } = await runtime.invoke("owner-a", "createDocumentConfirmation", { documentId, documentVersionId, textVersionId, items: review.items,
      reviewRevision: review.revision, expectedRevision: resume.revision, mutationId: "confirm-resume" });
    selectionRef = await runtime.invoke("owner-a", "createMaterialSelection", { scope: draft, entries: [entry, { slot: "resume", documentId, documentVersionId, confirmationId }], mutationId: "both-primary" });
  }
  const inputs = { source, audit, availability, target, planningDate, selectedScope };
  const preview = await runtime.invoke("owner-a", "createMaterialContext", { ...inputs, scope: draft, selectionRef, mutationId: "initial-context" });
  const generation = await runtime.invoke("owner-a", "generatePlanning", { ...inputs, materials: { selectionRef, contextVersionId: preview.contextVersionId, previewToken: preview.previewToken }, mutationId: "initial-generate" });
  const initial = generation.result.workspace;
  const { workspace } = await runtime.planning.appendEvent("owner-a", { mutationId: "actual-learning", baseVersionId: initial.activePlanVersionId,
    event: { kind: "completed", unitId: initial.dailyUnits[0]!.id, actualMinutes: 45, planningDate } });
  const scope = { kind: "goal" as const, goalId: workspace.goalId, workspaceId: workspace.id, baseVersionId: workspace.activePlanVersionId, revision: workspace.revision };
  const request = { scope, entry, mutationId: "remove-current-use" };
  const readLinks = () => runtime.invoke("owner-a", "readAdoptedMaterials", { goalId: scope.goalId, workspaceId: scope.workspaceId, baseVersionId: scope.baseVersionId });
  return { db, runtime, inputs, scope, workspace, entry, request, readLinks };
}

it("has a private strict detach contract and excludes its metadata event from public planning commands", () => {
  expect(documentEndpointContracts.detachAdoptedMaterial).toBeDefined();
  expect(documentEndpointContracts.detachAdoptedMaterial.method).toBe("POST");
  expect(planningEventInputSchema.safeParse({ kind: "material_usage_changed" }).success).toBe(false);
});

it("detaches the last adopted document without changing its library or historical plan, and invalidates a concurrent old preview", async () => {
  const f = await setup();
  try {
    const history = await f.runtime.invoke("owner-a", "readMaterialHistory", { goalId: f.scope.goalId });
    const selectionRef = await f.runtime.invoke("owner-a", "createMaterialSelection", { scope: f.scope, entries: [f.entry], mutationId: "old-select" });
    const { contextVersionId, previewToken } = await f.runtime.invoke("owner-a", "createMaterialContext", { ...f.inputs, scope: f.scope, selectionRef, mutationId: "old-preview" });
    const result = await Promise.all([0, 1].map(() => f.runtime.invoke("owner-a", "detachAdoptedMaterial", f.request)));
    const receipt = { goalId: f.scope.goalId, workspaceId: f.scope.workspaceId, baseVersionId: f.scope.baseVersionId, revision: f.workspace.revision + 1, documentId: f.entry.documentId };
    expect(result).toEqual([receipt, receipt]);
    expect(await f.readLinks()).toEqual({ entries: [] });
    const stored = await f.runtime.planning.getWorkspace("owner-a");
    expect(stored).toEqual({ ...f.workspace, revision: receipt.revision, lastSequence: f.workspace.lastSequence + 1, events: [...f.workspace.events, expect.objectContaining({ kind: "material_usage_changed" })] });
    expect(JSON.stringify(stored!.events.at(-1))).not.toContain(f.entry.documentId);
    expect(await f.runtime.invoke("owner-a", "readMaterialHistory", { goalId: f.scope.goalId })).toEqual(history);
    expect(history.plans[0].sourceAvailability).toBe("available");
    expect(f.db.database.prepare("SELECT lifecycle FROM documents WHERE id='doc-a'").get()).toEqual({ lifecycle: "active" });
    expect(f.db.database.prepare("SELECT state FROM document_confirmations WHERE id='confirmation-a'").get()).toEqual({ state: "active" });
    const records = f.db.database.prepare("SELECT result_json FROM document_mutations WHERE endpoint='detachAdoptedMaterial'").all() as { result_json: string }[];
    expect(records.map(row => JSON.parse(row.result_json))).toEqual([receipt]);
    await expect(f.runtime.invoke("owner-a", "readMaterialContext", { contextVersionId })).rejects.toThrow();
    await expect(f.runtime.invoke("owner-a", "createMaterialSelection", { scope: f.scope, entries: [f.entry], mutationId: "stale-tab" })).rejects.toThrow();
    await expect(f.runtime.invoke("owner-a", "materialReplan", { scope: f.scope, selectionRef, contextVersionId, previewToken, mutationId: "late-proposal" })).rejects.toThrow();
    await expect(f.runtime.invoke("owner-a", "detachAdoptedMaterial", { ...f.request, entry: { ...f.entry, documentVersionId: "other-version" } })).rejects.toMatchObject({ code: "conflict" });
    expect(await f.runtime.invoke("owner-a", "detachAdoptedMaterial", f.request)).toEqual(receipt);
    expect(await f.readLinks()).toEqual({ entries: [] });
    const lookup = { goalId: f.scope.goalId, workspaceId: f.scope.workspaceId, baseVersionId: f.scope.baseVersionId };
    const read = createDocumentRoute("readAdoptedMaterials", { requireUser: async () => ({ id: "owner-a" }), configuredOrigin: () => "https://arc.test",
      createService: () => f.runtime, rateLimiter: { reserve: async () => ({ allowed: true }) } });
    const check = (ids: string[]) => read(new Request("https://arc.test/api/planning/adopted-materials?" + new URLSearchParams({ ...lookup, checkDocumentIds: ids.join(",") })));
    expect(await (await check(["unknown", f.entry.documentId])).json()).toEqual({ entries: [], detachedDocumentIds: [f.entry.documentId] });
    expect(await (await check(["unknown"])).json()).toEqual({ entries: [] });
    expect((await check(["a", "b", "c", "d", "e", "f"])).status).toBe(400);
    const freshScope = { ...f.scope, revision: receipt.revision };
    const newSelection = await f.runtime.invoke("owner-a", "createMaterialSelection", { scope: freshScope, entries: [f.entry], mutationId: "explicit-reselection" });
    const next = await f.runtime.invoke("owner-a", "createMaterialContext", { ...f.inputs, scope: freshScope, selectionRef: newSelection, mutationId: "explicit-preview" });
    expect(next.preview.itemReferences).toContainEqual(expect.objectContaining({ confirmationId: f.entry.confirmationId }));
  } finally { f.db.close(); }
});

it("rejects wrong owner, stale scope, wrong current reference and pending replans without partial writes", async () => {
  const f = await setup();
  try {
    const links = await f.readLinks();
    expect(links.entries).toHaveLength(1);
    await expect(f.runtime.invoke("owner-b", "detachAdoptedMaterial", f.request)).rejects.toThrow();
    for (const scope of [{ ...f.scope, goalId: "other-goal" }, { ...f.scope, workspaceId: "other-workspace" }, { ...f.scope, baseVersionId: "old-plan" }, { ...f.scope, revision: 0 }]) {
      await expect(f.runtime.invoke("owner-a", "detachAdoptedMaterial", { ...f.request, scope })).rejects.toMatchObject({ code: "CONFLICT" });
    }
    for (const entry of [{ ...f.entry, slot: "resume" as const }, { ...f.entry, documentId: "other-document" }, { ...f.entry, documentVersionId: "other-version" }, { ...f.entry, confirmationId: "other-confirmation" }]) {
      await expect(f.runtime.invoke("owner-a", "detachAdoptedMaterial", { ...f.request, entry })).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(await f.runtime.planning.getWorkspace("owner-a")).toEqual(f.workspace);
    const active = f.workspace.pathVersions.find(path => path.id === f.workspace.activePathVersionId)!;
    const done = new Set(f.workspace.events.flatMap(event => event.kind === "completed" ? [event.unitId] : []));
    const proposed = await f.runtime.planning.appendAgentEventResponse("owner-a", { mutationId: "pending-replan", baseVersionId: f.scope.baseVersionId,
      event: { kind: "agent_replanned", baseRevision: f.scope.revision, planningDate: f.inputs.planningDate, unitOrder: active.units.map(unit => unit.id).filter(id => !done.has(id)) } }, f.scope);
    const pending = proposed.result.workspace;
    await expect(f.runtime.invoke("owner-a", "detachAdoptedMaterial", { ...f.request, scope: { ...f.scope, revision: pending.revision } })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.runtime.planning.getWorkspace("owner-a")).toEqual(pending);
    expect(await f.readLinks()).toEqual(links);
    expect(f.db.database.prepare("SELECT count(*) n FROM document_mutations WHERE endpoint='detachAdoptedMaterial'").get()).toEqual({ n: 0 });
  } finally { f.db.close(); }
});

it("rolls back the link, selection and receipt if the workspace event fails, and leaves the other adopted document alone", async () => {
  const f = await setup(true);
  try {
    const original = await f.readLinks();
    const selection = await f.runtime.invoke("owner-a", "createMaterialSelection", { scope: f.scope, entries: [f.entry], mutationId: "draft-before-failure" });
    f.db.database.exec("CREATE TRIGGER fail_detach_event BEFORE INSERT ON planning_events WHEN NEW.kind='material_usage_changed' BEGIN SELECT RAISE(ABORT,'offline-test-failure'); END");
    await expect(f.runtime.invoke("owner-a", "detachAdoptedMaterial", f.request)).rejects.toThrow();
    expect(await f.readLinks()).toEqual(original);
    expect(await f.runtime.invoke("owner-a", "readMaterialSelection", { selectionId: selection.selectionId })).toMatchObject({ selection: { state: "active" } });
    expect(f.db.database.prepare("SELECT count(*) n FROM document_mutations WHERE endpoint='detachAdoptedMaterial'").get()).toEqual({ n: 0 });
    expect(await f.runtime.planning.getWorkspace("owner-a")).toEqual(f.workspace);
    f.db.database.exec("DROP TRIGGER fail_detach_event");
    await f.runtime.invoke("owner-a", "detachAdoptedMaterial", f.request);
    expect(await f.readLinks()).toEqual({ entries: original.entries.filter(item => item.slot === "resume") });
    expect((await f.runtime.invoke("owner-a", "listDocuments", { limit: 10 })).documents.map(doc => doc.id)).toContain(f.entry.documentId);
  } finally { f.db.close(); }
});

it("requires an authenticated same-origin POST, protects caller ownership and returns only scoped refs", async () => {
  const f = await setup();
  try {
    const url = "https://arc.test/api/planning/adopted-materials/detach";
    const call = (owner: string | null, origin = "https://arc.test", input: unknown = f.request) => createDocumentRoute("detachAdoptedMaterial", {
      requireUser: async () => { if (!owner) throw new UnauthenticatedError(); return { id: owner }; }, configuredOrigin: () => "https://arc.test",
      createService: () => f.runtime, rateLimiter: { reserve: async () => ({ allowed: true }) },
    })(new Request(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(input) }));
    expect((await call(null)).status).toBe(401);
    expect((await call("owner-a", "https://other.test")).status).toBe(403);
    expect((await call("owner-a", undefined, { ...f.request, ownerId: "owner-b" })).status).toBe(400);
    expect((await call("owner-b")).status).toBe(404);
    await expect(f.runtime.planning.appendEvent("owner-a", { baseVersionId: f.scope.baseVersionId, mutationId: "forged", event: { kind: "material_usage_changed" } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const results = await Promise.all([f.request, { ...f.request, mutationId: "another-tab" }].map(input => call("owner-a", undefined, input)));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(Object.keys(await results.find(result => result.ok)!.json()).sort()).toEqual(["baseVersionId", "documentId", "goalId", "revision", "workspaceId"]);
  } finally { f.db.close(); }
});
