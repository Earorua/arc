import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MaterialConfirmation } from "../../app/components/materials/material-confirmation";
import { SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION, GROUNDED_MATERIAL_REVIEW_PROJECTION, type DocumentReviewDraft } from "../../app/contracts/documents";
import { guidedCleaningHint } from "../helpers/material-guided-cleaning";

afterEach(cleanup);
const text = "１. 我在指导下清洗数据。", button = "采用 data cleaning 的需指导完成建议";
function draft(): DocumentReviewDraft {
  const sourceRef = { documentId: "document", documentVersionId: "version", textVersionId: "text", start: 0, end: text.length };
  return { id: "review", schemaVersion: "2026.11.1", documentId: "document", documentVersionId: "version", textVersionId: "text",
    extractionId: "extraction", origin: "ai", revision: 0, updatedAt: "2026-11-09T00:00:00.000Z", reviewProjection: SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION,
    items: [{ id: "candidate-1", kind: "experience", text, origin: "extracted", sourceRef, requirementLevel: null, skillLabels: ["data cleaning"] }],
    selfAssessmentHints: [guidedCleaningHint], reviewPoints: [{ id: "question", code: "confirm-self-assessment", resolution: "unresolved", sourceRef: { ...sourceRef, start: 3 } }] };
}
const skills = [{ id: "data-cleaning", name: "data cleaning" }];

it("displays the natural numbered fact, literal source and guided suggestion while requiring explicit adoption", () => {
  const adopted = vi.fn(), confirmed = vi.fn();
  render(<MaterialConfirmation draft={draft()} text={text} saving={false} confirmed={false} skills={skills}
    onItemsChange={vi.fn()} onConfirm={confirmed} onAdoptLevels={adopted} />);
  expect(screen.getByRole("textbox", { name: "事实 1" })).toHaveValue(text);
  expect(screen.getByRole("button", { name: "移除技能词 清洗数据" })).toBeInTheDocument();
  expect(screen.getByText("（规范名称 data cleaning）")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "请单独确认能力自评" })).toHaveValue("unresolved");
  expect(screen.getAllByText(text, { selector: "blockquote" }).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
  expect(adopted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
  expect(confirmed).toHaveBeenCalledOnce();
  expect(adopted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: button }));
  expect(adopted).toHaveBeenCalledExactlyOnceWith({ "data-cleaning": "guided" });
});

it.each([
  ["１. 我在指导下清洗了数据。", true],
  ["１. 我在指导下清洗数据的计划尚未执行。", false],
  ["１. 同事在指导下清洗数据。", false],
] as const)("immediately rechecks the current edited fact: %s", (edited, supported) => {
  const adopted = vi.fn();
  function Editor() {
    const [value, setValue] = useState(draft());
    return <MaterialConfirmation draft={value} text={text} saving={false} confirmed={false} skills={skills}
      onItemsChange={items => setValue({ ...value, items })} onConfirm={vi.fn()} onAdoptLevels={adopted} />;
  }
  render(<Editor />);
  expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "事实 1" }), { target: { value: edited } });
  expect(screen.queryByRole("button", { name: button }) !== null).toBe(supported);
  expect(screen.getAllByText(text, { selector: "blockquote" }).length).toBeGreaterThan(0);
  expect(adopted).not.toHaveBeenCalled();
});

it.each(["label", "item"])("hides the hint immediately when its %s is removed", removal => {
  function Editor() {
    const [value, setValue] = useState(draft());
    return <MaterialConfirmation draft={value} text={text} saving={false} confirmed={false} skills={skills}
      onItemsChange={items => setValue({ ...value, items })} onConfirm={vi.fn()} onAdoptLevels={vi.fn()} />;
  }
  render(<Editor />);
  expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: removal === "label" ? "移除技能词 清洗数据" : "移除事实 1" }));
  expect(screen.queryByRole("button", { name: button })).not.toBeInTheDocument();
});

it("does not invent a missing suggestion or enable the v3 reading for an old v2 draft", () => {
  const value = draft(), props = { text, saving: false, confirmed: false, skills, onItemsChange: vi.fn(), onConfirm: vi.fn(), onAdoptLevels: vi.fn() };
  const page = render(<MaterialConfirmation {...props} draft={{ ...value, selfAssessmentHints: [] }} />);
  expect(screen.queryByRole("button", { name: button })).not.toBeInTheDocument();
  page.rerender(<MaterialConfirmation {...props} draft={{ ...value, reviewProjection: GROUNDED_MATERIAL_REVIEW_PROJECTION }} />);
  expect(screen.queryByRole("button", { name: button })).not.toBeInTheDocument();
});
