import { useState } from "react";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MaterialTextPanel } from "../../app/components/materials/material-text-panel";
import type { MaterialDocumentDraftRef } from "../../app/lib/use-material-selection";
import { createDocumentsClient, type DocumentsClient } from "../../app/lib/documents-client";
import type { DocumentCapabilities } from "../../app/contracts/document-capabilities";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { createMaterialsUat } from "../materials-uat/composition";
import corpus from "../fixtures/documents/quality-corpus.json";
import { materialContextRequest } from "../helpers/material-planning";

const origin = "https://b0.invalid";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const pair = ["resume-01", "jd-01"] as const;
function Page({ kind, capabilities, client, initial = null, record, adopt }: {
  kind: "resume" | "jd"; capabilities: DocumentCapabilities; client: DocumentsClient;
  initial?: MaterialDocumentDraftRef | null;
  record(ref: MaterialDocumentDraftRef): void; adopt(): void;
}) {
  const [ref, setRef] = useState<MaterialDocumentDraftRef | null>(initial);
  return <MaterialTextPanel value={ref} onChange={next => { record(next); setRef(next); }} kind={kind}
    client={client} capabilities={capabilities} pollIntervalMs={3} skills={flagshipBlueprint.skills} onAdoptLevels={adopt} />;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("rehearses one private review page per frozen case, then compares plans and deletes every document", async () => {
  const network = vi.fn(async () => { throw new Error("B0 has no network transport"); });
  vi.stubGlobal("fetch", network);
  const app = createMaterialsUat(origin);
  const client = createDocumentsClient({ fetch: async (path, init) => app.fetch(new Request(new URL(String(path), origin), {
    ...init, headers: { ...init?.headers, origin },
  }), "owner-a") });
  const refs = new Map<string, MaterialDocumentDraftRef>();
  const records = [];
  try {
    const caps = await client.capabilities();
    expect(caps.analysisEnabled).toBe(true);
    // B4 needs all 24 actual version IDs before enrollment. Saving the body does not create a job.
    for (const doc of corpus.documents) {
      const kind = doc.kind === "jd" ? "jd" : "resume";
      render(<Page kind={kind} capabilities={caps} client={client} record={ref => refs.set(doc.id, ref)} adopt={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(kind === "jd" ? "岗位 JD正文" : "简历正文"), { target: { value: doc.text } });
      fireEvent.click(screen.getByRole("button", { name: "保存并手动整理" }));
      await screen.findByRole("button", { name: "添加事实" });
      expect(refs.get(doc.id)?.jobId).toBeUndefined();
      cleanup();
    }
    expect(refs.size).toBe(24);
    expect(app.stats().fakeAnalyses).toBe(0);
    for (const doc of corpus.documents) {
      const start = Date.now(), adopt = vi.fn(), before = app.stats().fakeAnalyses;
      const kind = doc.kind === "jd" ? "jd" : "resume";
      const registered = refs.get(doc.id)!;
      render(<Page kind={kind} capabilities={caps} client={client} initial={registered} record={ref => refs.set(doc.id, ref)} adopt={adopt} />);
      await waitFor(() => expect(screen.getByLabelText(kind === "jd" ? "岗位 JD正文" : "简历正文")).toHaveValue(doc.text));
      const send = screen.getByRole("button", { name: "保存并 AI 分析" });
      expect(send).toBeDisabled();
      expect(app.stats().fakeAnalyses).toBe(before);
      fireEvent.click(screen.getByLabelText(/允许将当前文本/));
      fireEvent.click(send);
      await screen.findByDisplayValue(doc.goldFields[0]!.acceptedForms[0]!);
      const items = screen.getAllByRole("textbox", { name: /^事实 \d+$/u });
      expect(items, doc.id).toHaveLength(doc.goldFields.length);
      const saved = refs.get(doc.id)!;
      expect((await client.request("readDocumentReviewDraft", { documentId: saved.documentId, textVersionId: saved.textVersionId })).draft?.origin).toBe("ai");
      for (const [i, field] of doc.goldFields.entries()) expect(field.acceptedForms, doc.id).toContain((items[i] as HTMLTextAreaElement).value);
      const confirm = screen.getByRole("button", { name: "确认这些事实" });
      const resolutions = Array.from(document.querySelectorAll<HTMLElement>(".material-review-points select"));
      expect(resolutions.length).toBe(doc.expectedReviewPoints.length);
      if (doc.category === "edge") expect(confirm, doc.id).toBeDisabled();
      for (const select of resolutions) {
        await waitFor(() => expect(select).toBeEnabled());
        fireEvent.change(select, { target: { value: "confirmed" } });
        await waitFor(() => expect(select).toBeEnabled());
      }
      const ambiguous = screen.queryAllByRole("combobox", { name: /事实 \d+ 要求类型/u }).filter(el => el.querySelector("option:checked")?.getAttribute("value") === "unspecified");
      for (const select of ambiguous) fireEvent.change(select, { target: { value: "preferred" } });
      await waitFor(() => expect(confirm).toBeEnabled()); fireEvent.click(confirm);
      await screen.findByText("已确认，可用于本次规划。");
      expect(adopt).not.toHaveBeenCalled();
      const ref = refs.get(doc.id)!;
      expect(ref.confirmationId).toBeTruthy();
      expect(ref.textVersionId).toBe(registered.textVersionId);
      const { draft } = await client.request("readDocumentReviewDraft", { documentId: ref.documentId, textVersionId: ref.textVersionId });
      for (const [i, item] of draft!.items.entries()) {
        expect(item.sourceRef?.textVersionId).toBe(ref.textVersionId);
        expect(doc.text.slice(item.sourceRef!.start, item.sourceRef!.end)).toBe(doc.goldFields[i]!.source.quote);
      }
      expect(draft?.reviewPoints?.map(p => p.code) ?? []).toEqual(doc.expectedReviewPoints.map(p => p.code));
      expect(app.stats().fakeAnalyses).toBe(before + 1);
      records.push({ caseId: doc.id, textSha256: sha(doc.text), documentId: ref.documentId, textVersionId: ref.textVersionId,
        documentVersionId: ref.documentVersionId, consentId: ref.consentId, jobId: ref.jobId, confirmationId: ref.confirmationId, category: doc.category, prefilled: items.length,
        reviewPoints: resolutions.length, reclassified: ambiguous.length, manualEntries: 0, automaticSelfAssessments: 0,
        fixtureSends: 1, elapsedMs: Date.now() - start, status: "confirmed" });
      cleanup();
    }
    const source = materialContextRequest();
    const entries = pair.map(id => { const ref = refs.get(id)!; return { slot: id.startsWith("jd-") ? "jd" as const : "resume" as const,
      documentId: ref.documentId, documentVersionId: ref.documentVersionId, confirmationId: ref.confirmationId! }; });
    const selection = await client.request("createMaterialSelection", { scope: source.scope, entries, mutationId: "b0-pair" });
    const { preview, contextVersionId } = await client.request("createMaterialContext", { ...source, selectionRef: selection });
    const inputs = { blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, audit: source.audit,
      availability: source.availability, target: source.target, planningDate: source.planningDate };
    const baseline = buildLearningPaths(inputs).fullScope.units, personalized = buildLearningPaths({ ...inputs, materialOverlay: preview.overlay }).fullScope.units;
    const beforeIds = baseline.map(x => x.id), afterIds = personalized.map(x => x.id);
    expect([...beforeIds].sort()).toEqual([...afterIds].sort());
    const firstDifference = afterIds.findIndex((id, i) => id !== beforeIds[i]);
    expect(firstDifference).toBeGreaterThanOrEqual(0);
    for (const [i, unit] of personalized.entries()) for (const dep of unit.prerequisiteUnitIds) expect(afterIds.slice(0, i)).toContain(dep);
    const sourceLinks = preview.priorities.filter(priority => priority.tier === 0).flatMap(p => p.itemIds.map(id => {
      const ref = preview.itemReferences?.find(x => x.id === id), span = preview.confirmedItems.find(x => x.id === id)?.sourceRef;
      expect(ref && span).toBeTruthy();
      return { skillId: p.skillId, itemId: ref!.itemId, textVersionId: span!.textVersionId, start: span!.start, end: span!.end,
        confirmationId: ref!.confirmationId, contextVersionId };
    }));
    expect(sourceLinks.length).toBeGreaterThan(0);
    for (const ref of refs.values()) {
      const deletion = await client.request("deleteDocument", { documentId: ref.documentId, expectedRevision: ref.revision, mutationId: `delete-${ref.documentId}` });
      await app.maintain();
      expect((await client.request("readDocumentDeletion", { deletionJobId: deletion.deletionJobId })).state).toBe("completed");
    }
    expect(app.stats()).toMatchObject({ fakeAnalyses: 24, objects: 0 });
    expect(network).not.toHaveBeenCalled();
    if (process.env.ARC_MATERIALS_B0_RECORD === "1") {
      const dir = "work/gate1b-b0";
      await mkdir(dir, { recursive: true });
      await writeFile(`${dir}/ui-rehearsal.json`, JSON.stringify({ mode: "offline-dom-fixture", cases: records, beforeIds, afterIds,
        inputSha256: sha(JSON.stringify(inputs)), pair, firstDifference, sourceLinks, deletedDocuments: refs.size, objectsRemaining: 0, externalRequests: 0 }, null, 2));
    }
  } finally { await app.close(); }
}, 120_000);
