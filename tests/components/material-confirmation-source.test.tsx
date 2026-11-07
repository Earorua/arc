import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialConfirmation } from "../../app/components/materials/material-confirmation";
import type { DocumentReviewDraft } from "../../app/contracts/documents";

const draft: DocumentReviewDraft = {
  id: "review-a", schemaVersion: "2026.11.1", documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a",
  revision: 0, extractionId: null, origin: "manual", updatedAt: "2026-11-07T00:00:00.000Z", selfAssessmentHints: [],
  items: [{ id: "advice", text: "建议练习 SQL", kind: "requirement", requirementLevel: "unspecified", origin: "user", sourceRef: null, skillLabels: ["SQL"] }],
};

describe("source-aware material requirement confirmation", () => {
  afterEach(cleanup);

  it("names unresolved information and keeps fact confirmation separate from capability adoption", () => {
    const text = "本人是否编写查询待确认。", confirmed = vi.fn(), adopted = vi.fn(), changed = vi.fn();
    const value: DocumentReviewDraft = { ...draft,
      items: [{ ...draft.items[0]!, kind: "constraint", requirementLevel: null, text, skillLabels: [] }],
      reviewPoints: [{ id: "missing-role", code: "missing-information", resolution: "unresolved",
        sourceRef: { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", start: 0, end: text.length } }],
    };
    render(<MaterialConfirmation draft={value} text={text} saving={false} confirmed={false} onItemsChange={vi.fn()}
      onReviewPointsChange={changed} onConfirm={confirmed} onAdoptLevels={adopted} />);
    expect(screen.getByRole("combobox", { name: "信息缺失或待确认" })).toHaveValue("unresolved");
    expect(screen.getByText(text, { selector: "blockquote" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
    expect(confirmed).toHaveBeenCalledOnce();
    expect(adopted).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(["resume", "supplement"] as const)("confirms an unclassified %s suggestion without imposing a JD requirement", documentKind => {
    const confirmed = vi.fn(), changed = vi.fn(), adopted = vi.fn();
    render(<MaterialConfirmation draft={draft} text="建议练习 SQL" documentKind={documentKind} saving={false} confirmed={false}
      onItemsChange={changed} onConfirm={confirmed} onAdoptLevels={adopted} />);
    expect(screen.getByRole("option", { name: "建议或学习要求" })).toBeInTheDocument();
    expect(screen.queryByLabelText("事实 1 要求类型")).not.toBeInTheDocument();
    expect(screen.queryByText(/尚未区分必备或加分/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
    expect(confirmed).toHaveBeenCalledOnce(); expect(changed).not.toHaveBeenCalled(); expect(adopted).not.toHaveBeenCalled();
  });

  it("still requires every high-impact review point for a supplement", () => {
    const confirmed = vi.fn();
    function Harness() {
      const [value, setValue] = useState<DocumentReviewDraft>({ ...draft, reviewPoints: [{ id: "point", code: "conflicting-requirement", resolution: "unresolved",
        sourceRef: { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", start: 0, end: 8 } }] });
      return <MaterialConfirmation draft={value} text="建议练习 SQL" documentKind="supplement" saving={false} confirmed={false}
        onItemsChange={vi.fn()} onReviewPointsChange={reviewPoints => setValue({ ...value, reviewPoints })} onConfirm={confirmed} />;
    }
    render(<Harness />);
    const confirm = screen.getByRole("button", { name: "确认这些事实" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "建议或学习要求分类存在冲突" }), { target: { value: "confirmed" } });
    expect(confirm).toBeEnabled(); fireEvent.click(confirm); expect(confirmed).toHaveBeenCalledOnce();
  });

  it("continues blocking an unclassified main JD requirement", () => {
    render(<MaterialConfirmation draft={draft} text="建议练习 SQL" documentKind="jd" saving={false} confirmed={false}
      onItemsChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("option", { name: "岗位要求" })).toBeInTheDocument();
    expect(screen.getByLabelText("事实 1 要求类型")).toHaveValue("unspecified");
    expect(screen.getByRole("button", { name: "确认这些事实" })).toBeDisabled();
  });
});
