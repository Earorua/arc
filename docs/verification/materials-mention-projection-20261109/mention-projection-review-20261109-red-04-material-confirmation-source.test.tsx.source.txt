import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialConfirmation } from "../../app/components/materials/material-confirmation";
import { GROUNDED_MATERIAL_REVIEW_PROJECTION, SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION, type DocumentReviewDraft } from "../../app/contracts/documents";

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

  for (const projection of [undefined, GROUNDED_MATERIAL_REVIEW_PROJECTION, SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION]) {
    it.each([
      "My colleague tested SQL under supervision.",
      "I will test SQL under supervision.",
      "If I tested SQL under supervision, I would document it.",
      "I did not test SQL under supervision.",
      "The example says ‘I tested SQL under supervision.’",
      "I tested SQL.",
      "I cannot independently test SQL.",
      ...["按指导", "按照指导", "在导师指导下"].flatMap(qualifier => [
        "完成不了 SQL 查询练习", "完成 SQL 查询练习是我下周的计划。", "完成 SQL 查询练习的计划尚未执行。",
      ].map(action => qualifier + action)),
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

  for (const qualifier of ["按指导", "按照指导", "在导师指导下"]) {
    it.each([
      ["完成不了 React.js 组件练习", false],
      ["完成 React.js 组件练习是我下周的计划。", false],
      ["完成 React.js 组件练习的计划尚未执行。", false],
      ["完成 React.js 组件练习后，我记录了结果。", true],
      ["完成 React.js 组件练习，明天计划阅读 CSS 文档。", true],
      ["完成 React.js 组件练习，但我无法完成 CSS 页面。", true],
      ["完成 React.js 组件练习. 阅读 CSS 文档是我下周的计划。", true],
      ["完成 React.js 组件练习.阅读 CSS 文档是我下周的计划。", true],
      ["完成 React.js 组件练习。阅读 CSS 文档是我下周的计划。", true],
    ] as const)(`immediately checks the dotted-skill action after ${qualifier}: %s`, (action, supported) => {
      const adopted = vi.fn(), source = "I tested React.js under supervision.", value = assessmentDraft(GROUNDED_MATERIAL_REVIEW_PROJECTION);
      value.items[0] = { ...value.items[0]!, text: source, skillLabels: ["React.js"], sourceRef: { ...value.items[0]!.sourceRef!, end: source.length } };
      value.selfAssessmentHints = [{ ...value.selfAssessmentHints[0]!, skillLabel: "React.js" }];
      function Editor() {
        const [current, setCurrent] = useState(value);
        return <MaterialConfirmation draft={current} text={source} saving={false} confirmed={false} skills={[{ id: "reactjs", name: "React.js" }]}
          onItemsChange={items => setCurrent({ ...current, items })} onConfirm={vi.fn()} onAdoptLevels={adopted} />;
      }
      render(<Editor />);
      const buttonName = "采用 React.js 的需指导完成建议";
      expect(screen.getByRole("button", { name: buttonName })).toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox", { name: "事实 1" }), { target: { value: qualifier + action } });
      expect(screen.queryByRole("button", { name: buttonName }) !== null).toBe(supported);
      expect(screen.getAllByText(source, { selector: "blockquote" }).length).toBeGreaterThan(0);
      expect(adopted).not.toHaveBeenCalled();
      if (supported) {
        fireEvent.click(screen.getByRole("button", { name: buttonName }));
        expect(adopted).toHaveBeenCalledExactlyOnceWith({ reactjs: "guided" });
      }
    });
  }

  it.each([
    "I tested 'SQL' under supervision.",
    ...["按指导", "按照指导", "在导师指导下"].flatMap(qualifier => [
      "完成 SQL 查询练习后，我记录了结果。", "完成 SQL 查询练习，明天计划阅读 React 文档。", "完成 SQL 查询练习，但我无法完成 React 页面。",
    ].map(action => qualifier + action)),
  ])("offers supported practice but only adopts it on an explicit click: %s", text => {
    const adopted = vi.fn();
    function Editor() {
      const [value, setValue] = useState(assessmentDraft(GROUNDED_MATERIAL_REVIEW_PROJECTION));
      return <MaterialConfirmation draft={value} text={guided} saving={false} confirmed={false} skills={skills}
        onItemsChange={items => setValue({ ...value, items })} onConfirm={vi.fn()} onAdoptLevels={adopted} />;
    }
    render(<Editor />);
    fireEvent.change(screen.getByRole("textbox", { name: "事实 1" }), { target: { value: text } });
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

describe("versioned source-mention review controls", () => {
  afterEach(cleanup);
  function sourceDraft(text: string, skillLabels: string[] = []): DocumentReviewDraft {
    return { ...draft, reviewProjection: SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION,
      items: [{ id: "mention", kind: "experience", text, origin: "extracted", requirementLevel: null, skillLabels,
        sourceRef: { documentId: draft.documentId, documentVersionId: draft.documentVersionId, textVersionId: draft.textVersionId,
          start: 0, end: text.length } }],
    };
  }

  it("adds a v3 negative source mention and displays its raw spelling beside the canonical label", () => {
    const text = "I have no experience with data cleansing.", changed = vi.fn(), adopted = vi.fn();
    function Editor() {
      const [value, setValue] = useState(sourceDraft(text));
      return <MaterialConfirmation draft={value} text={text} saving={false} confirmed={false}
        onItemsChange={(items, addition) => { changed(items, addition); setValue({ ...value, items }); }}
        onConfirm={vi.fn()} onAdoptLevels={adopted} />;
    }
    render(<Editor />);
    fireEvent.click(screen.getByText("从原文补充技能词"));
    const input = screen.getByRole("textbox", { name: "事实 1 原文词" });
    fireEvent.change(input, { target: { value: "data cleansing" } });
    expect(screen.getByRole("button", { name: "补充技能词" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "补充技能词" }));
    expect(changed).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({ text, origin: "user", skillLabels: ["data cleaning"] })],
      { itemId: "mention", sourceTerm: "data cleansing" });
    expect(screen.getByRole("button", { name: "移除技能词 data cleansing" })).toBeInTheDocument();
    expect(screen.getByText("（规范名称 data cleaning）")).toBeInTheDocument();
    expect(screen.queryByText("单独核对能力建议")).not.toBeInTheDocument();
    expect(adopted).not.toHaveBeenCalled();
  });

  it("shows the raw alias of an already nominated negative v3 topic", () => {
    const text = "I have no experience with data cleansing.";
    render(<MaterialConfirmation draft={sourceDraft(text, ["data cleaning"])} text={text} saving={false} confirmed={false}
      onItemsChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "移除技能词 data cleansing" })).toBeInTheDocument();
    expect(screen.getByText("（规范名称 data cleaning）")).toBeInTheDocument();
  });

  it("keeps the v2 negative-source correction rule when the same text is reopened", () => {
    const text = "I have never used SQL.", value = { ...sourceDraft(text), reviewProjection: GROUNDED_MATERIAL_REVIEW_PROJECTION };
    render(<MaterialConfirmation draft={value} text={text} saving={false} confirmed={false} onItemsChange={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText("从原文补充技能词"));
    fireEvent.change(screen.getByRole("textbox", { name: "事实 1 原文词" }), { target: { value: "SQL" } });
    expect(screen.getByRole("button", { name: "补充技能词" })).toBeDisabled();
  });

  it.each([GROUNDED_MATERIAL_REVIEW_PROJECTION, SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION])(
    "keeps the eight-term quota and hides correction after persisted reclassification for %s", reviewProjection => {
      const words = ["SQL", "React", "TypeScript", "Docker", "Python", "Rust", "Vitest", "WAI-ARIA"];
      const text = `I used ${words.join(", ")} and CSS.`, value = { ...sourceDraft(text, words), reviewProjection };
      const props = { text, saving: false, confirmed: false, onItemsChange: vi.fn(), onConfirm: vi.fn() };
      const page = render(<MaterialConfirmation {...props} draft={value} />);
      fireEvent.click(screen.getByText("从原文补充技能词"));
      fireEvent.change(screen.getByRole("textbox", { name: "事实 1 原文词" }), { target: { value: "CSS" } });
      expect(screen.getByRole("button", { name: "补充技能词" })).toBeDisabled();
      page.rerender(<MaterialConfirmation {...props} draft={{ ...value, reclassifiedItemIds: ["mention"],
        items: [{ ...value.items[0]!, kind: "constraint", origin: "user", skillLabels: [] }] }} />);
      expect(screen.queryByText("从原文补充约束主题")).not.toBeInTheDocument();
      expect(screen.queryByRole("textbox", { name: "事实 1 原文词" })).not.toBeInTheDocument();
    });

  it.each(["SQL is not required.", "If assigned to the database team, SQL will be required."])(
    "keeps the normal main-JD classification gate for a v3 mention: %s", text => {
      const confirmed = vi.fn(), adopted = vi.fn(), initial = sourceDraft(text, ["SQL"]);
      function Editor() {
        const [value, setValue] = useState<DocumentReviewDraft>({ ...initial,
          items: [{ ...initial.items[0]!, kind: "requirement", requirementLevel: "unspecified" }] });
        return <MaterialConfirmation draft={value} text={text} documentKind="jd" saving={false} confirmed={false}
          onItemsChange={items => setValue({ ...value, items })} onConfirm={confirmed} onAdoptLevels={adopted} />;
      }
      render(<Editor />);
      const confirm = screen.getByRole("button", { name: "确认这些事实" });
      expect(confirm).toBeDisabled();
      expect(screen.getByRole("combobox", { name: "事实 1 要求类型" })).toHaveValue("unspecified");
      expect(screen.getByRole("button", { name: "移除技能词 SQL" })).toBeInTheDocument();
      fireEvent.click(confirm);
      expect(confirmed).not.toHaveBeenCalled();
      fireEvent.change(screen.getByRole("combobox", { name: "事实 1 要求类型" }), { target: { value: "preferred" } });
      expect(confirm).toBeEnabled();
      fireEvent.click(confirm);
      expect(confirmed).toHaveBeenCalledOnce();
      expect(adopted).not.toHaveBeenCalled();
    });
});
