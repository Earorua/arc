import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MaterialTextPanel } from "../../app/components/materials/material-text-panel";
import type { DocumentsClient } from "../../app/lib/documents-client";
import type { MaterialDocumentDraftRef } from "../../app/lib/use-material-selection";
import { createMaterialAnalysisFixture } from "../helpers/material-analysis-e2e";
import { materialContextRequest } from "../helpers/material-planning";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "../../app/server/documents/policy";
import { SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION } from "../../app/contracts/documents";
import { createMaterialMentionReviewFixture } from "../helpers/material-mention-review-fixture";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lets the reader restore an omitted source word in the real editor and includes it in the next confirmed plan", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const text = "The role requires WAI-ARIA and PostgreSQL.";
  const f = await createMaterialAnalysisFixture({ sourceSpanResponse: { format: "source-spans-v2", items: [{
    kind: "requirement", requirementLevel: "must", source: { segmentId: "segment-1", quote: text }, skillTerms: ["WAI-ARIA"], selfLevelHint: null,
  }], reviewPoints: [] } });
  try {
    const caps = { documentsEnabled: true, analysisEnabled: true, planningEnabled: true, hasDocuments: true, providerLabel: "Fixture",
      providerPolicyId: KIMI_GROUNDED_TERMS_POLICY_ID, policyVersion: "2026.11.1", reason: "ready" } as const;
    const client: DocumentsClient = { request: async (endpoint, input) => {
      const result = await f.http(endpoint, input);
      if (endpoint === "createDocumentJob" && "jobId" in result) await f.execute(result.jobId);
      return result;
    }, capabilities: async () => caps };
    let latest: MaterialDocumentDraftRef | null = null;
    function currentRef(): MaterialDocumentDraftRef {
      if (!latest) throw new Error("The editor has not saved this document");
      return latest;
    }
    function Editor() {
      const [value, setValue] = useState<MaterialDocumentDraftRef | null>(latest);
      return <MaterialTextPanel kind="jd" capabilities={caps} client={client} value={value} pollIntervalMs={5}
        onChange={next => { latest = next; setValue(next); }} />;
    }
    const inputs = materialContextRequest();
    async function confirmAndPreview(name: string) {
      const confirm = screen.getByRole("button", { name: "确认这些事实" });
      await waitFor(() => expect(confirm).toBeEnabled());
      fireEvent.click(confirm);
      await waitFor(() => expect(currentRef().confirmationId).toBeTruthy());
      const scope = { ...inputs.scope, draftId: `draft-${name}` };
      const selectionRef = await f.http("createMaterialSelection", { scope, entries: [{ slot: "jd", documentId: doc.documentId,
        documentVersionId: doc.documentVersionId, confirmationId: currentRef().confirmationId! }], mutationId: `select-${name}` });
      const context = await f.http("createMaterialContext", { ...inputs, scope, selectionRef, mutationId: `preview-${name}` });
      return { ...context, selectionRef };
    }
    const page = render(<Editor />);
    fireEvent.change(screen.getByRole("textbox", { name: "岗位 JD正文" }), { target: { value: text } });
    const analyze = screen.getByRole("button", { name: "保存并 AI 分析" });
    expect(analyze).toBeDisabled();
    expect(f.providerCalls()).toBe(0);
    fireEvent.click(screen.getByRole("checkbox", { name: /允许将当前文本/ }));
    fireEvent.click(analyze);
    await screen.findByRole("button", { name: "移除技能词 WAI-ARIA" });
    const doc = currentRef(), ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    expect(f.providerCalls()).toBe(1);
    expect(f.db.database.prepare("SELECT provider_policy_id FROM document_jobs WHERE id=?").get(doc.jobId!)?.provider_policy_id)
      .toBe(KIMI_GROUNDED_TERMS_POLICY_ID);
    expect(screen.queryByRole("button", { name: "移除技能词 PostgreSQL" })).not.toBeInTheDocument();
    expect((await confirmAndPreview("original")).preview.overlay?.mandatorySkillIds).toEqual(["design-systems"]);
    fireEvent.click(screen.getByText("从原文补充技能词"));
    const input = screen.getByRole("textbox", { name: "事实 1 原文词" });
    const add = screen.getByRole("button", { name: "补充技能词" });
    fireEvent.change(input, { target: { value: "SQL" } });
    expect(add).toBeDisabled();
    fireEvent.change(input, { target: { value: "PostgreSQL" } });
    fireEvent.click(add);
    await waitFor(async () => expect((await f.http("readDocumentReviewDraft", ref)).draft?.items[0]?.skillLabels).toEqual(["WAI-ARIA", "PostgreSQL"]));
    expect(currentRef().confirmationId).toBeUndefined();
    page.unmount();
    render(<Editor />);
    await screen.findByRole("button", { name: "移除技能词 PostgreSQL" });
    expect(screen.getByRole("textbox", { name: "事实 1" })).toHaveValue(text);
    const corrected = await confirmAndPreview("corrected");
    expect(corrected.preview.overlay?.mandatorySkillIds.toSorted()).toEqual(["design-systems", "sql"]);
    const { source, audit, availability, target, selectedScope, planningDate } = inputs;
    const { result } = await f.http("generatePlanning", { source, audit, availability, target, selectedScope, planningDate, mutationId: "generate",
      materials: { contextVersionId: corrected.contextVersionId, previewToken: corrected.previewToken, selectionRef: corrected.selectionRef } });
    expect(result.workspace.audit).toEqual(expect.objectContaining({ answers: audit.answers }));
    const history = await f.http("readMaterialHistory", { goalId: result.workspace.goalId });
    expect(history.plans.find(plan => plan.contextVersionId === corrected.contextVersionId)?.explanations)
      .toContainEqual(expect.objectContaining({ ruleId: "mandatory-scope-protection-v1", skillId: "sql" }));
  } finally { await f.dispose(); }
});

it("persists an explicitly added negative v3 topic through the real editor, then keeps removed words and facts removed", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const f = createMaterialMentionReviewFixture(), text = "I have never used SQL.", adopted = vi.fn();
  try {
    const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Topic only", text, mutationId: "create-mention" });
    await f.deliver(doc, [{ id: "negative", kind: "experience", text, requirementLevel: null, skillLabels: [], selfLevelHint: null,
      source: { segmentId: "segment-1", quote: text } }]);
    let latest: MaterialDocumentDraftRef = doc;
    const caps = await f.client.capabilities();
    function Editor() {
      const [value, setValue] = useState(latest);
      return <MaterialTextPanel kind="resume" capabilities={caps} client={f.client} value={value}
        skills={[{ id: "sql", name: "SQL" }]} onAdoptLevels={adopted}
        onChange={next => { latest = next; setValue(next); }} />;
    }
    const read = () => f.client.request("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId });
    let page = render(<Editor />);
    fireEvent.click(await screen.findByText("从原文补充技能词"));
    fireEvent.change(screen.getByRole("textbox", { name: "事实 1 原文词" }), { target: { value: "SQL" } });
    expect(screen.getByRole("button", { name: "补充技能词" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "补充技能词" }));
    await waitFor(async () => expect((await read()).draft?.items[0]?.skillLabels).toEqual(["SQL"]));
    expect((await read()).draft).toMatchObject({ reviewProjection: SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION, selfAssessmentHints: [] });
    page.unmount(); f.restart(); page = render(<Editor />);
    await screen.findByRole("button", { name: "移除技能词 SQL" });
    expect(screen.getByRole("textbox", { name: "事实 1" })).toHaveValue(text);
    fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
    await waitFor(() => expect(latest.confirmationId).toBeTruthy());
    const input = materialContextRequest();
    const selectionRef = await f.client.request("createMaterialSelection", { scope: input.scope, entries: [{ slot: "resume",
      documentId: doc.documentId, documentVersionId: doc.documentVersionId, confirmationId: latest.confirmationId! }], mutationId: "select-negative" });
    const { preview } = await f.client.request("createMaterialContext", { ...input, selectionRef });
    expect(preview.mappingDetails?.[0]).toMatchObject({ status: "mapped", skillIds: ["sql"] });
    expect(preview.priorities).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "移除技能词 SQL" }));
    await waitFor(async () => expect((await read()).draft?.items[0]?.skillLabels).toEqual([]));
    expect(latest.confirmationId).toBeUndefined();
    page.unmount(); f.restart(); page = render(<Editor />);
    await screen.findByRole("textbox", { name: "事实 1" });
    expect(screen.queryByRole("button", { name: "移除技能词 SQL" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "移除事实 1" }));
    await waitFor(async () => expect((await read()).draft?.items).toEqual([]));
    page.unmount(); f.restart(); render(<Editor />);
    await screen.findByText("核对资料事实");
    expect(screen.queryByRole("textbox", { name: "事实 1" })).not.toBeInTheDocument();
    expect((await read()).draft?.items).toEqual([]);
    expect(adopted).not.toHaveBeenCalled();
    expect(f.trace.filter(row => row.endpoint === "saveDocumentReviewDraft").every(row => !Object.hasOwn(row.body as object, "reviewProjection"))).toBe(true);
  } finally { cleanup(); f.dispose(); }
});

it.each(["My colleague tested SQL under supervision.", "I will test SQL under supervision."])(
  "retains the v3 topic but removes the old personal hint after saving and reopening this editor change: %s", async text => {
    vi.stubGlobal("crypto", webcrypto);
    const f = createMaterialMentionReviewFixture(), source = "I tested SQL under supervision.", adopted = vi.fn();
    try {
      const doc = await f.client.request("createDocument", { kind: "resume", displayName: "Personal practice", text: source, mutationId: "create-guided" });
      await f.deliver(doc, [{ id: "guided", kind: "experience", text: source, requirementLevel: null, skillLabels: ["SQL"], selfLevelHint: "guided",
        source: { segmentId: "segment-1", quote: source } }]);
      const caps = await f.client.capabilities();
      let latest: MaterialDocumentDraftRef = doc;
      function Editor() {
        const [value, setValue] = useState(latest);
        return <MaterialTextPanel kind="resume" capabilities={caps} client={f.client} value={value}
          skills={[{ id: "sql", name: "SQL" }]} onAdoptLevels={adopted}
          onChange={next => { latest = next; setValue(next); }} />;
      }
      const read = () => f.client.request("readDocumentReviewDraft", { documentId: doc.documentId, textVersionId: doc.textVersionId });
      const initial = (await read()).draft!, extraction = f.db.database.prepare("SELECT * FROM document_extractions").get();
      const page = render(<Editor />);
      await screen.findByRole("button", { name: "采用 SQL 的需指导完成建议" });
      fireEvent.change(screen.getByRole("textbox", { name: "事实 1" }), { target: { value: text } });
      expect(screen.queryByRole("button", { name: "采用 SQL 的需指导完成建议" })).not.toBeInTheDocument();
      await waitFor(async () => expect((await read()).draft).toMatchObject({ reviewProjection: SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION,
        items: [{ text, skillLabels: ["SQL"], sourceRef: initial.items[0]!.sourceRef }], selfAssessmentHints: [] }));
      page.unmount(); f.restart(); render(<Editor />);
      await screen.findByRole("button", { name: "移除技能词 SQL" });
      expect(screen.queryByRole("button", { name: "采用 SQL 的需指导完成建议" })).not.toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox", { name: "事实 1" }), { target: { value: source } });
      await waitFor(async () => expect((await read()).draft).toMatchObject({ items: [{ text: source, skillLabels: ["SQL"] }], selfAssessmentHints: [] }));
      expect(f.db.database.prepare("SELECT * FROM document_extractions").get()).toEqual(extraction);
      expect(adopted).not.toHaveBeenCalled();
    } finally { cleanup(); f.dispose(); }
  });
