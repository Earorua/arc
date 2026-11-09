import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialConfirmation } from "../../app/components/materials/material-confirmation";
import { MaterialSetupProvider, useMaterialSetup } from "../../app/components/materials/material-setup-provider";
import { AdaptiveSetupFlow } from "../../app/components/setup/adaptive-setup-flow";
import {
  GROUNDED_MATERIAL_REVIEW_PROJECTION, SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION,
  type DocumentReviewDraft, type MaterialSelection,
} from "../../app/contracts/documents";
import {
  documentEndpointContracts, type DocumentEndpoint, type DocumentEndpointRequest, type DocumentEndpointResponse,
} from "../../app/contracts/documents-api";
import type { PlanningWorkspace, SkillSelfLevel } from "../../app/contracts/planning";
import type { GeneratePlanningRequest } from "../../app/contracts/planning-api";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import type { DocumentsClient } from "../../app/lib/documents-client";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningService } from "../../app/server/planning/service";
import { materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";
import { createMaterialsD1 } from "../helpers/materials-d1";

const dbs: ReturnType<typeof createMaterialsD1>[] = [];
const caps = { documentsEnabled: true, analysisEnabled: true, planningEnabled: true, hasDocuments: true,
  providerLabel: "Offline", providerPolicyId: "policy", policyVersion: "2026.11.1", reason: "ready" } as const;
const ref = { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", revision: 0, confirmationId: "confirmation-a" };
const text = "I tested TypeScript under supervision.";
type ReviewProjection = NonNullable<DocumentReviewDraft["reviewProjection"]>;

function makeDraft(reviewProjection: ReviewProjection = SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION): DocumentReviewDraft {
  return {
    id: "review-a", schemaVersion: "2026.11.1", documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a",
    extractionId: "extraction-a", origin: "ai", revision: 0, updatedAt: materialNow().toISOString(), reviewProjection,
    items: [{ id: "practice-a", kind: "experience", origin: "extracted", text,
      sourceRef: { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", start: 0, end: text.length },
      requirementLevel: null, skillLabels: ["TypeScript"] }],
    selfAssessmentHints: [{ id: "hint-a", candidateId: "practice-a", skillLabel: "TypeScript", level: "guided" }], reviewPoints: [],
  };
}

function skillGroup(id: string) {
  const skill = flagshipBlueprint.skills.find(skill => skill.id === id)!;
  return within(screen.getByRole("group", { name: `${skill.name} 自我评估`, hidden: true }));
}

function level(id: string, value: SkillSelfLevel) {
  return document.querySelector<HTMLInputElement>(`input[name="level-${id}"][value="${value}"]`)!;
}

function fixture(projection: ReviewProjection = SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION) {
  const db = createMaterialsD1();
  dbs.push(db);
  seedMaterialSelection(db);
  const draft = makeDraft(projection);
  db.database.prepare("UPDATE documents SET kind='resume',display_name='Synthetic Resume'").run();
  db.database.prepare("UPDATE material_selection_entries SET slot='resume'").run();
  db.database.prepare("UPDATE document_confirmations SET items_json=?").run(JSON.stringify(draft.items));
  const sourceResolver = materialSourceResolver();
  let id = 0;
  const repository = new D1PlanningRepository(db as unknown as D1Database, { sourceResolver, now: materialNow, createId: () => `stored-${++id}` });
  const materials = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver, planningRepository: repository,
    now: materialNow, createId: () => `context-${++id}` });
  const service = new PlanningService({ repository, sourceResolver, materials, now: materialNow, createId: () => `planning-${++id}` });
  let selection: MaterialSelection | null = null;

  // Only document transport/selection metadata is synthetic. Context creation, planning,
  // audit serialization and repository reload use the real services and in-memory D1.
  async function invoke(endpoint: DocumentEndpoint, body: unknown): Promise<unknown> {
    if (endpoint === "readDocument") return {
      document: { id: "doc-a", schemaVersion: "2026.11.1", kind: "resume", displayName: "Synthetic Resume",
        revision: 0, generation: 0, lifecycle: "active", currentDocumentVersionId: "version-a",
        createdAt: materialNow().toISOString(), updatedAt: materialNow().toISOString() },
      version: { id: "version-a", documentId: "doc-a", textVersionId: "text-a", schemaVersion: "2026.11.1", revision: 0,
        state: "ready", parserVersion: "2026.11.1", textDigest: "a".repeat(64), codePoints: text.length,
        utf8Bytes: text.length, createdAt: materialNow().toISOString() },
      text,
    };
    if (endpoint === "readDocumentReviewDraft") return { draft };
    if (endpoint === "createDocumentConfirmation") return { confirmationId: "confirmation-a", revision: 0 };
    if (endpoint === "createMaterialSelection") {
      const input = documentEndpointContracts.createMaterialSelection.request.parse(body);
      selection = { selectionId: "selection-a", schemaVersion: "2026.11.1", selectionRevision: 0, scope: input.scope,
        entries: input.entries, state: "active", boundGoalId: null };
      db.database.prepare("UPDATE material_selections SET scope_json=? WHERE id='selection-a'").run(JSON.stringify(input.scope));
      return { selectionId: "selection-a", selectionRevision: 0 };
    }
    if (endpoint === "readMaterialSelection") return { selection,
      versions: [{ documentId: "doc-a", documentVersionId: "version-a", state: "active" }] };
    if (endpoint === "createMaterialContext") return materials.create("owner-a", documentEndpointContracts.createMaterialContext.request.parse(body));
    if (endpoint === "readMaterialContext") return materials.read("owner-a", documentEndpointContracts.readMaterialContext.request.parse(body).contextVersionId);
    throw new Error(`Unexpected offline endpoint: ${endpoint}`);
  }
  const client: DocumentsClient = {
    capabilities: async () => caps,
    async request<K extends DocumentEndpoint>(endpoint: K, body: DocumentEndpointRequest<K>): Promise<DocumentEndpointResponse<K>> {
      documentEndpointContracts[endpoint].request.parse(body);
      return documentEndpointContracts[endpoint].response.parse(await invoke(endpoint, body)) as DocumentEndpointResponse<K>;
    },
  };
  const requests: GeneratePlanningRequest[] = [];
  let generated: PlanningWorkspace | null = null;
  async function generate(request: GeneratePlanningRequest) {
    requests.push(request);
    generated = (await service.generate("owner-a", request)).workspace;
    return true;
  }
  function SelectResume() {
    const state = useMaterialSetup();
    return <button disabled={!state?.ready} onClick={() => state?.setSlot("resume", ref)}>Load synthetic resume</button>;
  }
  function App() {
    return <MaterialSetupProvider ownerId="owner-a" scopeKey="adoption-persistence" client={client}>
      <SelectResume />
      <AdaptiveSetupFlow draftOwner="user:owner-a" blueprint={flagshipBlueprint} registry={flagshipUnitRegistry} generate={generate}
        navigate={vi.fn()} createMutationId={() => "generation-adoption"} now={materialNow} timeZone="UTC" />
    </MaterialSetupProvider>;
  }
  return { db, App, requests, sourceResolver, generated: () => generated };
}

async function loadResume() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Load synthetic resume" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Load synthetic resume" }));
  await screen.findByRole("button", { name: "采用 TypeScript 的需指导完成建议" });
}

async function createRoute() {
  fireEvent.click(screen.getByRole("button", { name: "继续" }));
  fireEvent.click(screen.getByRole("button", { name: "继续" }));
  fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "创建路线" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "创建路线" }));
  await screen.findByText("计划已就绪。");
}

async function reloadWorkspace(f: ReturnType<typeof fixture>) {
  const reopened = new PlanningService({ repository: new D1PlanningRepository(f.db as unknown as D1Database,
    { sourceResolver: f.sourceResolver }), sourceResolver: f.sourceResolver });
  return reopened.getWorkspace("owner-a");
}

beforeEach(() => { localStorage.clear(); vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { cleanup(); dbs.splice(0).forEach(db => db.close()); vi.unstubAllGlobals(); });

describe("material capability adoption and persistence", () => {
  it.each([GROUNDED_MATERIAL_REVIEW_PROJECTION, SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION])(
    "keeps %s adoption optional and persists the explicit audit after a manual override and remount",
    async projection => {
      const f = fixture(projection);
      const page = render(<f.App />);
      await loadResume();
      expect(level("typescript", "unseen")).toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "确认这些事实" })).toBeEnabled());
      for (const skill of flagshipBlueprint.skills) expect(level(skill.id, "unseen")).toBeChecked();

      fireEvent.click(skillGroup("web-platform").getByRole("radio", { name: "了解概念" }));
      fireEvent.click(screen.getByRole("button", { name: "采用 TypeScript 的需指导完成建议" }));
      for (const skill of flagshipBlueprint.skills) {
        expect(level(skill.id, skill.id === "typescript" ? "guided" : skill.id === "web-platform" ? "conceptual" : "unseen")).toBeChecked();
      }
      fireEvent.click(skillGroup("typescript").getByRole("radio", { name: "可独立完成" }));
      fireEvent.click(screen.getByRole("button", { name: "未逐项评估的技能设为不确定" }));
      expect(level("typescript", "independent")).toBeChecked();
      expect(level("web-platform", "conceptual")).toBeChecked();
      expect(level("sql", "uncertain")).toBeChecked();

      page.unmount();
      render(<f.App />);
      await screen.findByText("已恢复本岗位的设置草稿。");
      await screen.findByRole("button", { name: "采用 TypeScript 的需指导完成建议" });
      expect(level("typescript", "independent")).toBeChecked();
      expect(level("web-platform", "conceptual")).toBeChecked();
      expect(level("sql", "uncertain")).toBeChecked();
      fireEvent.click(screen.getByRole("checkbox", { name: "我已核对当前技能自评" }));
      await createRoute();

      expect(f.requests).toHaveLength(1);
      const request = f.requests[0]!;
      expect(request.audit.answers.find(answer => answer.skillId === "typescript")?.level).toBe("independent");
      expect(request.audit.answers.find(answer => answer.skillId === "web-platform")?.level).toBe("conceptual");
      expect(request.audit.answers.find(answer => answer.skillId === "sql")?.level).toBe("uncertain");
      expect(request.audit.evidence).toEqual([]);
      expect(request.materials).toBeDefined();
      const reloaded = await reloadWorkspace(f);
      expect(reloaded?.audit).toEqual(request.audit);
      expect(reloaded).toEqual(f.generated());
      const stored = f.db.database.prepare("SELECT payload_json FROM skill_audit_versions WHERE id=?").get(request.audit.id) as { payload_json: string };
      expect(JSON.parse(stored.payload_json)).toEqual(request.audit);
      const snapshot = f.db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?")
        .get(request.materials!.contextVersionId) as { snapshot_json: string };
      expect(JSON.parse(snapshot.snapshot_json).audit).toEqual(request.audit);
      const path = reloaded!.pathVersions.find(path => path.id === reloaded!.activePathVersionId)!;
      const kinds = (skillId: string) => [...new Set(path.units.filter(unit => unit.skillId === skillId).map(unit => unit.kind))];
      expect(kinds("typescript")).toContain("calibrate");
      expect(kinds("typescript")).not.toContain("learn");
      expect(kinds("sql")).toEqual(expect.arrayContaining(["calibrate", "learn"]));
    },
  );

  it("offers adoption only for a retained hint with one current skill match", () => {
    const draft = makeDraft(), adopt = vi.fn();
    const props = { draft, text, saving: false, confirmed: false, onItemsChange: vi.fn(), onConfirm: vi.fn(), onAdoptLevels: adopt };
    const page = render(<MaterialConfirmation {...props} skills={[]} />);
    expect(screen.queryByRole("button", { name: /采用 TypeScript/ })).not.toBeInTheDocument();
    page.rerender(<MaterialConfirmation {...props} skills={[{ id: "a", name: "TypeScript" }, { id: "b", name: "TypeScript" }]} />);
    expect(screen.queryByRole("button", { name: /采用 TypeScript/ })).not.toBeInTheDocument();
    page.rerender(<MaterialConfirmation {...props} skills={flagshipBlueprint.skills} />);
    expect(adopt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /采用 TypeScript/ }));
    expect(adopt).toHaveBeenCalledExactlyOnceWith({ typescript: "guided" });
    page.rerender(<MaterialConfirmation {...props} skills={flagshipBlueprint.skills} draft={{ ...draft, items: [] }} />);
    expect(screen.queryByRole("button", { name: /采用 TypeScript/ })).not.toBeInTheDocument();
    expect(adopt).toHaveBeenCalledTimes(1);
  });

  it("persists an adopted guided level with the existing public project evidence reference", async () => {
    const f = fixture();
    render(<f.App />);
    await loadResume();
    const skillRoot = within(level("typescript", "unseen").closest(".audit-skill") as HTMLElement);
    fireEvent.click(skillRoot.getByText("添加作品证据（可选）"));
    fireEvent.click(await skillRoot.findByRole("button", { name: "为 TypeScript 添加证据链接" }));
    fireEvent.change(screen.getByLabelText("TypeScript 证据链接 1"), { target: { value: "https://github.com/example/public-project" } });
    fireEvent.change(screen.getByLabelText("TypeScript 证据说明 1"), { target: { value: "Public project I selected" } });
    fireEvent.click(screen.getByRole("button", { name: "采用 TypeScript 的需指导完成建议" }));
    fireEvent.click(screen.getByRole("button", { name: "未逐项评估的技能设为不确定" }));
    expect(level("typescript", "guided")).toBeChecked();
    await createRoute();

    expect(f.requests).toHaveLength(1);
    const request = f.requests[0]!;
    const answer = request.audit.answers.find(answer => answer.skillId === "typescript")!;
    expect(answer.level).toBe("guided");
    expect(answer.evidenceRefs).toEqual(["evidence-typescript-1"]);
    expect(request.audit.evidence).toEqual([{ id: "evidence-typescript-1", kind: "project", url: "https://github.com/example/public-project",
      note: "Public project I selected", skillId: "typescript" }]);
    expect((await reloadWorkspace(f))?.audit).toEqual(request.audit);
  });

  it("clears prior skill review and acknowledgment when explicitly restarting the role audit", async () => {
    const f = fixture();
    render(<f.App />);
    await loadResume();
    fireEvent.click(screen.getByRole("button", { name: "采用 TypeScript 的需指导完成建议" }));
    expect(level("typescript", "guided")).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "我已核对当前技能自评" }));
    expect(screen.getByRole("button", { name: "继续" })).toBeEnabled();
    fireEvent.click(screen.getByText("草稿选项"));
    fireEvent.click(screen.getByRole("button", { name: "重新填写此岗位" }));
    expect(level("typescript", "unseen")).toBeChecked();
    expect.soft(screen.getByRole("checkbox", { name: "我已核对当前技能自评" })).not.toBeChecked();
    expect.soft(screen.getByRole("button", { name: "继续" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "未逐项评估的技能设为不确定" }));
    expect.soft(level("typescript", "uncertain")).toBeChecked();
    expect(level("sql", "uncertain")).toBeChecked();
  });
});
