import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MaterialTextPanel } from "../../app/components/materials/material-text-panel";
import type { DocumentsClient } from "../../app/lib/documents-client";
import type { MaterialDocumentDraftRef } from "../../app/lib/use-material-selection";
import { createMaterialAnalysisFixture } from "../helpers/material-analysis-e2e";
import { materialContextRequest } from "../helpers/material-planning";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "../../worker/document-executor/source-span-extraction";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lets the reader restore an omitted source word in the real editor and includes it in the next confirmed plan", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const text = "The role requires WAI-ARIA and PostgreSQL.";
  const f = await createMaterialAnalysisFixture({ sourceSpanResponse: { format: "source-spans-v2", items: [{
    kind: "requirement", requirementLevel: "must", source: { segmentId: "segment-1", quote: text }, skillTerms: ["WAI-ARIA"], selfLevelHint: null,
  }], reviewPoints: [] } });
  try {
    const doc = await f.http("createDocument", { kind: "jd", displayName: "Intake desk", text, mutationId: "create" });
    const ref = { documentId: doc.documentId, textVersionId: doc.textVersionId };
    const consent = await f.http("createDocumentConsent", { textVersionId: doc.textVersionId, purpose: "analysis",
      providerPolicyId: KIMI_GROUNDED_TERMS_POLICY_ID, policyVersion: "2026.11.1", mutationId: "consent" });
    const job = await f.http("createDocumentJob", { textVersionId: doc.textVersionId, consentId: consent.consentId, mutationId: "analyze" });
    await f.execute(job.jobId);
    const caps = { documentsEnabled: true, analysisEnabled: true, planningEnabled: true, hasDocuments: true, providerLabel: "Fixture",
      providerPolicyId: KIMI_GROUNDED_TERMS_POLICY_ID, policyVersion: "2026.11.1", reason: "ready" } as const;
    const client: DocumentsClient = { request: (endpoint, input) => f.http(endpoint, input), capabilities: async () => caps };
    let latest: MaterialDocumentDraftRef = doc;
    function Editor() {
      const [value, setValue] = useState(latest);
      return <MaterialTextPanel kind="jd" capabilities={caps} client={client} value={value}
        onChange={next => { latest = next; setValue(next); }} />;
    }
    const inputs = materialContextRequest();
    async function confirmAndPreview(name: string) {
      const confirm = screen.getByRole("button", { name: "确认这些事实" });
      await waitFor(() => expect(confirm).toBeEnabled());
      fireEvent.click(confirm);
      await waitFor(() => expect(latest.confirmationId).toBeTruthy());
      const scope = { ...inputs.scope, draftId: `draft-${name}` };
      const selectionRef = await f.http("createMaterialSelection", { scope, entries: [{ slot: "jd", documentId: doc.documentId,
        documentVersionId: doc.documentVersionId, confirmationId: latest.confirmationId! }], mutationId: `select-${name}` });
      const context = await f.http("createMaterialContext", { ...inputs, scope, selectionRef, mutationId: `preview-${name}` });
      return { ...context, selectionRef };
    }
    const page = render(<Editor />);
    await screen.findByRole("button", { name: "移除技能词 WAI-ARIA" });
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
    expect(latest.confirmationId).toBeUndefined();
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
