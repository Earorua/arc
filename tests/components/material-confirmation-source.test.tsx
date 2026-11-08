import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialConfirmation } from "../../app/components/materials/material-confirmation";
import { GROUNDED_MATERIAL_REVIEW_PROJECTION, type DocumentReviewDraft } from "../../app/contracts/documents";

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

describe("edited material self-assessment suggestions", () => {
  afterEach(cleanup);
  const guided = "I tested SQL under supervision.";
  const buttonName = "采用 SQL 的需指导完成建议";
  const skills = [{ id: "sql", name: "SQL" }, { id: "react", name: "React" }];
  function assessmentDraft(projection: DocumentReviewDraft["reviewProjection"]): DocumentReviewDraft {
    return { ...draft, reviewProjection: projection,
      items: [{ id: "practice", text: guided, kind: "experience", origin: "extracted", requirementLevel: null, skillLabels: ["SQL"],
        sourceRef: { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", start: 0, end: guided.length } }],
      selfAssessmentHints: [{ id: "hint-practice-0", candidateId: "practice", skillLabel: "SQL", level: "guided" }],
    };
  }

  for (const projection of [undefined, GROUNDED_MATERIAL_REVIEW_PROJECTION]) {
    it.each([
      "My colleague tested SQL under supervision.",
      "I will test SQL under supervision.",
      "If I tested SQL under supervision, I would document it.",
      "I did not test SQL under supervision.",
      "The example says ‘I tested SQL under supervision.’",
      "I tested SQL.",
      "I cannot independently test SQL.",
    ])(`hides the unsupported ${projection ?? "historical"} suggestion on the edit render: %s`, text => {
      const adopted = vi.fn(), changed = vi.fn();
      function Editor() {
        const [value, setValue] = useState(assessmentDraft(projection));
        const [saving, setSaving] = useState(false);
        return <MaterialConfirmation draft={value} text={guided} saving={saving} confirmed={false} skills={skills}
          onItemsChange={items => { changed(items); setValue({ ...value, items }); setSaving(true); }} onConfirm={vi.fn()} onAdoptLevels={adopted} />;
      }
      render(<Editor />);
      expect(screen.getByRole("button", { name: buttonName })).toBeInTheDocument();
      expect(adopted).not.toHaveBeenCalled();
      fireEvent.change(screen.getByRole("textbox", { name: "事实 1" }), { target: { value: text } });
      expect(changed).toHaveBeenCalledWith([expect.objectContaining({ text, origin: "user", skillLabels: ["SQL"] })]);
      expect(screen.getByText("正在保存核对修改…")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: buttonName })).not.toBeInTheDocument();
      expect(screen.queryByText("单独核对能力建议")).not.toBeInTheDocument();
      expect(screen.queryByText(/SQL · 不确定/)).not.toBeInTheDocument();
      expect(screen.getAllByText(guided, { selector: "blockquote" }).length).toBeGreaterThan(0);
      expect(adopted).not.toHaveBeenCalled();
    });
  }

  it("offers supported quoted-tool guidance but only adopts it on an explicit click", () => {
    const adopted = vi.fn();
    function Editor() {
      const [value, setValue] = useState(assessmentDraft(GROUNDED_MATERIAL_REVIEW_PROJECTION));
      return <MaterialConfirmation draft={value} text={guided} saving={false} confirmed={false} skills={skills}
        onItemsChange={items => setValue({ ...value, items })} onConfirm={vi.fn()} onAdoptLevels={adopted} />;
    }
    render(<Editor />);
    fireEvent.change(screen.getByRole("textbox", { name: "事实 1" }), { target: { value: "I tested 'SQL' under supervision." } });
    expect(adopted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: buttonName }));
    expect(adopted).toHaveBeenCalledExactlyOnceWith({ sql: "guided" });
  });

  it("keeps SQL's supported suggestion while hiding React's colleague assessment", () => {
    const adopted = vi.fn(), value = assessmentDraft(GROUNDED_MATERIAL_REVIEW_PROJECTION);
    value.items[0] = { ...value.items[0]!, origin: "user", text: "I tested SQL under supervision, but my colleague tested React under supervision.", skillLabels: ["SQL", "React"] };
    value.selfAssessmentHints.push({ id: "hint-practice-1", candidateId: "practice", skillLabel: "React", level: "guided" });
    render(<MaterialConfirmation draft={value} text={guided} saving={false} confirmed={false} skills={skills}
      onItemsChange={vi.fn()} onConfirm={vi.fn()} onAdoptLevels={adopted} />);
    expect(screen.getByRole("button", { name: buttonName })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "采用 React 的需指导完成建议" })).not.toBeInTheDocument();
    expect(adopted).not.toHaveBeenCalled();
  });

  it("revalidates an extracted grounded fact without changing historical summary behavior", () => {
    const adopted = vi.fn(), value = assessmentDraft(undefined);
    value.items[0] = { ...value.items[0]!, text: "Tested SQL." };
    const props = { text: guided, saving: false, confirmed: false, skills, onItemsChange: vi.fn(), onConfirm: vi.fn(), onAdoptLevels: adopted };
    const page = render(<MaterialConfirmation {...props} draft={value} />);
    expect(screen.getByRole("button", { name: buttonName })).toBeInTheDocument();
    page.rerender(<MaterialConfirmation {...props} draft={{ ...value, reviewProjection: GROUNDED_MATERIAL_REVIEW_PROJECTION }} />);
    expect(screen.queryByRole("button", { name: buttonName })).not.toBeInTheDocument();
    expect(adopted).not.toHaveBeenCalled();
  });
});
