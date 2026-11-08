import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialContextReview, type MaterialPreview, type MaterialPreviewInputs } from "../../app/components/materials/material-context-review";
import { MaterialSetupProvider, useMaterialSetup } from "../../app/components/materials/material-setup-provider";
import type { DocumentsClient } from "../../app/lib/documents-client";
import { materialContextRequest } from "../helpers/material-planning";

const caps = { documentsEnabled: true, analysisEnabled: true, planningEnabled: true, hasDocuments: true, providerLabel: "Offline", providerPolicyId: "policy", policyVersion: "2026.11.1", reason: "ready" } as const;
const ref = { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", revision: 1, confirmationId: "confirmation-a" };
const reference = { contextVersionId: "context-saved", previewToken: "a".repeat(64), selectionRef: { selectionId: "selection-a", selectionRevision: 0 } };
const source = materialContextRequest();
const input: MaterialPreviewInputs = { source: source.source, audit: source.audit, availability: source.availability, target: source.target, planningDate: source.planningDate, selectedScope: source.selectedScope };
const skills = [{ id: "design-systems", name: "设计系统" }, { id: "react", name: "React 19" }, { id: "sql", name: "SQL" }];
const basePreview: MaterialPreview = {
  confirmedItems: [{ id: "preview-fact", kind: "experience", text: "PRIVATE-FIGMA-FACT", skillLabels: ["Figma", "UI tokens"], origin: "user", sourceRef: null, requirementLevel: null }],
  itemReferences: [{ id: "preview-fact", confirmationId: ref.confirmationId, itemId: "private-fact" }],
  mappingDetails: [{ itemId: "preview-fact", termIndexes: [0, 1], skillIds: ["design-systems"], status: "mapped", basis: "contextual" }],
  priorities: [{ skillId: "design-systems", tier: 3, itemIds: ["preview-fact"] }], issues: [], uncoveredLabels: [],
};
const advicePreview: MaterialPreview = {
  ...basePreview,
  confirmedItems: [{ ...basePreview.confirmedItems[0]!, kind: "constraint", text: "每周学习 UI tokens 两小时", skillLabels: ["UI tokens"] }],
  itemReferences: [{ ...basePreview.itemReferences![0]!, learningIntentEligible: true }],
  mappingDetails: [{ itemId: "preview-fact", termIndexes: [0], skillIds: [], status: "non-learning", basis: null }],
  priorities: [], issues: [{ code: "learning-intent-not-adopted", itemIds: ["preview-fact"], skillIds: [] }],
};

function fixture(initial: MaterialPreview = basePreview, options: { recovering?: boolean; disabled?: boolean } = {}) {
  let selection: unknown = null;
  const request = vi.fn(async (endpoint: string, body: Record<string, unknown>): Promise<unknown> => {
    if (endpoint === "createMaterialSelection") { selection = { selectionId: "selection-a", selectionRevision: 0, scope: body.scope, entries: body.entries, state: "active" }; return reference.selectionRef; }
    if (endpoint === "readMaterialSelection") return { selection, versions: [] };
    if (endpoint === "createMaterialContext") return { contextVersionId: `context-${request.mock.calls.length}`, previewToken: "a".repeat(64), preview: {
      ...initial, ...(body.termMappings ? { termMappings: body.termMappings } : {}), ...(body.learningIntents ? { learningIntents: body.learningIntents } : {}), ...(body.skillMappings ? { skillMappings: body.skillMappings } : {}),
    } };
    if (endpoint === "readMaterialContext") return { ...reference, state: "active", expiresAt: "2026-11-08T00:00:00.000Z", preview: initial };
    throw Error(endpoint);
  });
  const onPreview = vi.fn();
  const client = { request, capabilities: async () => caps } as unknown as DocumentsClient;
  function Controls() {
    const state = useMaterialSetup(); const [nextInput, setInput] = useState(input); const [disabled, setDisabled] = useState(options.disabled ?? false); const [visible, setVisible] = useState(true);
    return <><button disabled={!state?.ready} onClick={() => { state?.setSupplements([ref]); if (options.recovering) state?.setPreview(reference); }}>选择资料</button>
      <button onClick={() => setInput({ ...nextInput, audit: { ...nextInput.audit, id: "audit-changed" } })}>修改自评</button>
      <button onClick={() => setInput({ ...nextInput, source: nextInput.source.source === "flagship" ? { source: "research", researchRunId: "research-ready" } : input.source })}>修改课程来源</button>
      <button onClick={() => state?.setSupplements([])}>清除资料</button>
      <button onClick={() => state?.setPreview({ ...reference, contextVersionId: "context-next" })}>切换保存预览</button>
      <button onClick={() => setVisible(false)}>关闭核对界面</button>
      <button onClick={() => setDisabled(true)}>锁定</button>
      <output aria-label="可采用预览">{state?.refs.preview?.contextVersionId ?? "none"}</output>
      {visible && <MaterialContextReview input={nextInput} availableSkills={skills} disabled={disabled} recovering={options.recovering} onPreview={onPreview} />}</>;
  }
  render(<MaterialSetupProvider ownerId="owner-a" scopeKey="choices" client={client}><Controls /></MaterialSetupProvider>);
  return { request, onPreview };
}

async function openPreview(recovering = false) {
  await waitFor(() => expect(screen.getByRole("button", { name: "选择资料" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "选择资料" }));
  if (!recovering) fireEvent.click(await screen.findByRole("button", { name: "核对资料对路线的影响" }));
  await screen.findByText(/资料预览已就绪/);
}
const termControl = (label: string) => screen.getByRole("combobox", { name: `事实 1 技能词 ${label} 对应的已有技能` });

describe("material term choices and explicit learning intent", () => {
  beforeEach(() => localStorage.clear()); afterEach(cleanup);

  it.each([
    { name: "mapped topic without practice", details: [{ itemId: "preview-fact", termIndexes: [0], skillIds: ["sql"], status: "mapped" as const, basis: "literal" as const }], priorities: [], mapped: 1, ranked: 0 },
    { name: "two courses with one practice", details: [{ itemId: "preview-fact", termIndexes: [0], skillIds: ["react", "sql"], status: "mapped" as const, basis: "manual" as const }], priorities: [{ skillId: "react", tier: 3, itemIds: ["preview-fact"] }], mapped: 2, ranked: 1 },
    { name: "duplicate mapped course", details: [
      { itemId: "preview-fact", termIndexes: [0], skillIds: ["sql"], status: "mapped" as const, basis: "literal" as const },
      { itemId: "preview-fact", termIndexes: [1], skillIds: ["sql"], status: "mapped" as const, basis: "manual" as const },
    ], priorities: [], mapped: 1, ranked: 0 },
    { name: "ambiguous courses", details: [{ itemId: "preview-fact", termIndexes: [0], skillIds: ["react", "sql"], status: "ambiguous" as const, basis: "literal" as const }], priorities: [], mapped: 0, ranked: 0 },
    { name: "uncovered omitted and non-learning topics", details: [
      { itemId: "preview-fact", termIndexes: [0], skillIds: [], status: "uncovered" as const, basis: null },
      { itemId: "preview-fact", termIndexes: [1], skillIds: [], status: "omitted" as const, basis: "manual" as const },
      { itemId: "preview-fact", termIndexes: [-1], skillIds: [], status: "non-learning" as const, basis: null },
    ], priorities: [], mapped: 0, ranked: 0 },
  ])("distinguishes course mapping from current priorities for $name", async ({ details, priorities, mapped, ranked }) => {
    fixture({ ...basePreview, mappingDetails: details, priorities }); await openPreview();
    expect(screen.getByText(`已对应课程 ${mapped} 项技能；参与当前排序 ${ranked} 项技能。`)).toBeInTheDocument();
    expect(screen.getByText(/否定、他人经历或未来计划/)).toHaveTextContent(/不代表已有实践或能力等级/);
  });

  it("reports only the provable priority count for a historical preview without mapping details", async () => {
    fixture({ ...basePreview, mappingDetails: undefined }, { recovering: true }); await openPreview(true);
    expect(screen.getByText("参与当前排序 1 项技能。")).toBeInTheDocument();
    expect(screen.queryByText(/已对应课程 \d+ 项技能/)).not.toBeInTheDocument();
    expect(screen.queryByText(/已映射 \d+ 项技能/)).not.toBeInTheDocument();
  });

  it("shows the retained labels, actual courses and contextual basis for every grouped term", async () => {
    fixture(); await openPreview();
    for (const label of ["Figma", "UI tokens"]) {
      const row = within(termControl(label).closest("li")!);
      expect(row.getByText(label)).toBeInTheDocument();
      expect(row.getByText(/已对应：设计系统/)).toHaveTextContent("依据：上下文对应");
    }
  });

  it("changes one term without changing other automatic mappings and supports explicit omit and return to automatic", async () => {
    const { request, onPreview } = fixture(); await openPreview();
    fireEvent.change(termControl("Figma"), { target: { value: "react" } });
    expect(onPreview.mock.lastCall?.[0]).toBeNull(); expect(screen.getByLabelText("可采用预览")).toHaveTextContent("none");
    expect(termControl("UI tokens")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    let body = request.mock.calls.filter(([method]) => method === "createMaterialContext").at(-1)![1];
    expect(body.termMappings).toEqual([{ confirmationId: ref.confirmationId, itemId: "private-fact", skillLabel: "Figma", skillIds: ["react"] }]);
    expect(body).not.toHaveProperty("skillMappings");
    fireEvent.change(termControl("Figma"), { target: { value: "__omit__" } });
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    body = request.mock.calls.filter(([method]) => method === "createMaterialContext").at(-1)![1];
    expect(body.termMappings).toEqual([{ confirmationId: ref.confirmationId, itemId: "private-fact", skillLabel: "Figma", skillIds: [] }]);
    fireEvent.change(termControl("Figma"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    expect(request.mock.calls.filter(([method]) => method === "createMaterialContext").at(-1)![1]).not.toHaveProperty("termMappings");
    expect(JSON.stringify(localStorage)).not.toMatch(/PRIVATE-FIGMA-FACT|private-fact|UI tokens|termMappings/);
  });

  it("preserves a stored multi-course choice on another term when editing one term", async () => {
    const stored = { confirmationId: ref.confirmationId, itemId: "private-fact", skillLabel: "UI tokens", skillIds: ["react", "sql"] };
    const { request } = fixture({ ...basePreview, termMappings: [stored] }); await openPreview();
    expect(termControl("UI tokens")).toHaveDisplayValue(/React 19、SQL/);
    fireEvent.change(termControl("Figma"), { target: { value: "design-systems" } });
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    expect(request.mock.calls.filter(([method]) => method === "createMaterialContext").at(-1)![1].termMappings).toEqual(expect.arrayContaining([
      stored, { confirmationId: ref.confirmationId, itemId: "private-fact", skillLabel: "Figma", skillIds: ["design-systems"] },
    ]));
  });

  it("adopts a constraint separately and removes its explicit mappings when adoption is withdrawn", async () => {
    const { request, onPreview } = fixture(advicePreview); await openPreview();
    const checkbox = screen.getByRole("checkbox", { name: "事实 1 作为本轮学习重点" });
    expect(checkbox).not.toBeChecked(); expect(screen.getByText(/未采用为学习重点，不用于本轮学习排序/)).toBeInTheDocument();
    expect(termControl("UI tokens")).toBeDisabled();
    fireEvent.click(checkbox);
    expect(onPreview.mock.lastCall?.[0]).toBeNull(); expect(screen.getByLabelText("可采用预览")).toHaveTextContent("none");
    expect(termControl("UI tokens")).toBeEnabled();
    fireEvent.change(termControl("UI tokens"), { target: { value: "design-systems" } });
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    const adopted = request.mock.calls.filter(([method]) => method === "createMaterialContext").at(-1)![1];
    expect(adopted.learningIntents).toEqual([{ confirmationId: ref.confirmationId, itemId: "private-fact" }]);
    expect(adopted.termMappings).toHaveLength(1); expect(adopted.audit).toEqual(input.audit); expect(adopted.availability).toEqual(input.availability);
    expect(advicePreview.confirmedItems[0]).toMatchObject({ kind: "constraint", requirementLevel: null });
    fireEvent.click(checkbox); expect(termControl("UI tokens")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    const withdrawn = request.mock.calls.filter(([method]) => method === "createMaterialContext").at(-1)![1];
    expect(withdrawn).not.toHaveProperty("learningIntents"); expect(withdrawn).not.toHaveProperty("termMappings");
  });

  it.each(["修改自评", "修改课程来源"])("immediately invalidates the adoption reference and resets choices after %s", async action => {
    const { request, onPreview } = fixture(); await openPreview();
    fireEvent.change(termControl("Figma"), { target: { value: "react" } });
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.getByLabelText("可采用预览")).toHaveTextContent("none"); expect(onPreview.mock.lastCall?.[0]).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    expect(request.mock.calls.filter(([method]) => method === "createMaterialContext").at(-1)![1]).not.toHaveProperty("termMappings");
  });

  it("does not accept a context response after the selected material was removed", async () => {
    const { request, onPreview } = fixture(); const original = request.getMockImplementation()!;
    const pending = Promise.withResolvers<unknown>();
    request.mockImplementation(async (endpoint, body) => endpoint === "createMaterialContext" ? pending.promise : original(endpoint, body));
    await waitFor(() => expect(screen.getByRole("button", { name: "选择资料" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "选择资料" }));
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" }));
    await waitFor(() => expect(request.mock.calls.some(([method]) => method === "createMaterialContext")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "清除资料" }));
    await act(async () => { pending.resolve({ ...reference, preview: basePreview }); await pending.promise; });
    expect(screen.queryByText("PRIVATE-FIGMA-FACT")).not.toBeInTheDocument();
    expect(screen.getByLabelText("可采用预览")).toHaveTextContent("none"); expect(onPreview.mock.lastCall?.[0]).toBeNull();
  });

  it("restores saved choices as read-only without persisting their labels or intent", async () => {
    const { request } = fixture({ ...advicePreview,
      learningIntents: [{ confirmationId: ref.confirmationId, itemId: "private-fact" }],
      termMappings: [{ confirmationId: ref.confirmationId, itemId: "private-fact", skillLabel: "UI tokens", skillIds: ["react", "sql"] }],
      mappingDetails: [{ itemId: "preview-fact", termIndexes: [0], skillIds: ["react", "sql"], status: "mapped", basis: "manual" }],
    }, { recovering: true }); await openPreview(true);
    expect(screen.getByRole("checkbox", { name: "事实 1 作为本轮学习重点" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "事实 1 作为本轮学习重点" })).toBeDisabled();
    expect(termControl("UI tokens")).toHaveDisplayValue(/React 19、SQL/); expect(termControl("UI tokens")).toBeDisabled();
    expect(screen.getByRole("button", { name: "核对资料对路线的影响" })).toBeDisabled();
    expect(request.mock.calls.some(([method]) => method === "createMaterialContext")).toBe(false);
    expect(JSON.stringify(localStorage)).not.toMatch(/UI tokens|private-fact|learningIntents|termMappings/);
  });

  it.each([
    [["sql"], "SQL"],
    [["sql", "retired-course"], "SQL、retired-course"],
  ] as const)("shows an old labelled fact's saved whole-fact mapping %j without implying per-term automatic matches", async (skillIds, names) => {
    const historical: MaterialPreview = { ...basePreview, mappingDetails: undefined,
      skillMappings: skillIds.map(skillId => ({ confirmationId: ref.confirmationId, itemId: "private-fact", skillId })),
    };
    const { request, onPreview } = fixture(historical, { recovering: true }); await openPreview(true);
    expect(screen.getByText(/历史整条事实对应/)).toHaveTextContent(`历史整条事实对应：${names}`);
    expect(screen.getByText(/已确认技能词 Figma、UI tokens/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /事实 1 技能词/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/自动对应/)).not.toBeInTheDocument();
    expect(onPreview.mock.lastCall?.[0]?.preview).toEqual(historical);
    expect(request.mock.calls.some(([method]) => method === "createMaterialContext")).toBe(false);
    expect(JSON.stringify(localStorage)).not.toMatch(/Figma|UI tokens|private-fact|skillMappings|retired-course/);
  });

  it("locks both explicit choice controls when disabled", async () => {
    fixture({ ...advicePreview, confirmedItems: [{ ...advicePreview.confirmedItems[0]!, kind: "requirement", requirementLevel: "unspecified" }] }); await openPreview();
    fireEvent.click(screen.getByRole("button", { name: "锁定" }));
    expect(screen.getByRole("checkbox", { name: "事实 1 作为本轮学习重点" })).toBeDisabled(); expect(termControl("UI tokens")).toBeDisabled();
  });

  it("does not offer a whole-fact override when the user retained an empty term list", async () => {
    fixture({ ...basePreview, confirmedItems: [{ ...basePreview.confirmedItems[0]!, skillLabels: [] }], mappingDetails: [] }); await openPreview();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("requires another preview even when an intent is toggled back to its original value", async () => {
    const { request } = fixture(advicePreview); await openPreview();
    const checkbox = screen.getByRole("checkbox", { name: "事实 1 作为本轮学习重点" });
    fireEvent.click(checkbox); fireEvent.click(checkbox);
    expect(screen.getByText("资料采用方式待重新预览，当前结果暂不可采用。")).toBeInTheDocument();
    expect(screen.getByLabelText("可采用预览")).toHaveTextContent("none");
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    const requests = request.mock.calls.filter(([method]) => method === "createMaterialContext");
    expect(requests[1]![1].mutationId).not.toBe(requests[0]![1].mutationId);
  });

  it("does not revive private choices or an old preview when a prior source is selected again", async () => {
    const { request } = fixture(); await openPreview();
    fireEvent.change(termControl("Figma"), { target: { value: "react" } });
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    fireEvent.click(screen.getByRole("button", { name: "修改课程来源" }));
    fireEvent.click(screen.getByRole("button", { name: "修改课程来源" }));
    expect(screen.queryByText("PRIVATE-FIGMA-FACT")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" })); await screen.findByText(/资料预览已就绪/);
    expect(request.mock.calls.filter(([method]) => method === "createMaterialContext").at(-1)![1]).not.toHaveProperty("termMappings");
  });

  it("hides a recovered snapshot immediately when its saved reference changes", async () => {
    const { request, onPreview } = fixture(basePreview, { recovering: true }); await openPreview(true);
    const pending = Promise.withResolvers<unknown>(); const original = request.getMockImplementation()!;
    request.mockImplementation(async (endpoint, body) => endpoint === "readMaterialContext" ? pending.promise : original(endpoint, body));
    fireEvent.click(screen.getByRole("button", { name: "切换保存预览" }));
    expect(screen.queryByText("PRIVATE-FIGMA-FACT")).not.toBeInTheDocument();
    expect(onPreview.mock.lastCall?.[0]).toBeNull();
    await act(async () => { pending.resolve({ ...reference, contextVersionId: "context-next", preview: { ...basePreview, confirmedItems: [] } }); await pending.promise; });
    expect(screen.getByLabelText("可采用预览")).toHaveTextContent("context-next");
  });

  it("keeps the parent preview invalid when reading a replacement recovery snapshot fails", async () => {
    const { request, onPreview } = fixture(basePreview, { recovering: true }); await openPreview(true);
    const pending = Promise.withResolvers<unknown>(); const original = request.getMockImplementation()!;
    request.mockImplementation(async (endpoint, body) => endpoint === "readMaterialContext" ? pending.promise : original(endpoint, body));
    fireEvent.click(screen.getByRole("button", { name: "切换保存预览" }));
    expect(onPreview.mock.lastCall?.[0]).toBeNull();
    await act(async () => { pending.reject(Error("Unavailable")); await Promise.resolve(); });
    expect(await screen.findByText("原预览已不可恢复，请返回路线确认保存结果。")).toBeInTheDocument();
    expect(onPreview.mock.lastCall?.[0]).toBeNull();
  });

  it("rejects a pending response after changing the source away and back", async () => {
    const { request, onPreview } = fixture(); await openPreview();
    const pending = Promise.withResolvers<unknown>(); const original = request.getMockImplementation()!;
    request.mockImplementation(async (endpoint, body) => endpoint === "createMaterialContext" ? pending.promise : original(endpoint, body));
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" }));
    await waitFor(() => expect(request.mock.calls.filter(([method]) => method === "createMaterialContext")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "修改课程来源" })); fireEvent.click(screen.getByRole("button", { name: "修改课程来源" }));
    await act(async () => { pending.resolve({ ...reference, preview: basePreview }); await pending.promise; });
    expect(onPreview.mock.lastCall?.[0]).toBeNull(); expect(screen.getByLabelText("可采用预览")).toHaveTextContent("none");
    expect(screen.queryByText("PRIVATE-FIGMA-FACT")).not.toBeInTheDocument();
  });

  it("does not publish a pending context after its review component was unmounted", async () => {
    const { request, onPreview } = fixture(); const original = request.getMockImplementation()!;
    const pending = Promise.withResolvers<unknown>();
    request.mockImplementation(async (endpoint, body) => endpoint === "createMaterialContext" ? pending.promise : original(endpoint, body));
    await waitFor(() => expect(screen.getByRole("button", { name: "选择资料" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "选择资料" }));
    fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" }));
    await waitFor(() => expect(request.mock.calls.some(([method]) => method === "createMaterialContext")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "关闭核对界面" }));
    await act(async () => { pending.resolve({ ...reference, preview: basePreview }); await pending.promise; });
    expect(onPreview.mock.lastCall?.[0]).toBeNull(); expect(screen.getByLabelText("可采用预览")).toHaveTextContent("none");
  });

  it("invalidates an in-flight preview synchronously when a term changes before the next render", async () => {
    const { request, onPreview } = fixture(); await openPreview();
    const previousRequests = request.mock.calls.filter(([method]) => method === "createMaterialContext").length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" }));
      fireEvent.change(termControl("Figma"), { target: { value: "react" } });
      await Promise.resolve(); await Promise.resolve();
    });
    expect(onPreview.mock.lastCall?.[0]).toBeNull(); expect(screen.getByLabelText("可采用预览")).toHaveTextContent("none");
    expect(request.mock.calls.filter(([method]) => method === "createMaterialContext")).toHaveLength(previousRequests);
  });

  it.each([
    ["ambiguous", ["react", "sql"], null, "对应待核对：React 19、SQL"],
    ["uncovered", [], null, "当前蓝图未覆盖"],
    ["omitted", [], "manual", "已明确不用于本轮映射 · 依据：手动选择"],
    ["mapped", ["sql"], "literal", "已对应：SQL · 依据：名称或已登记别名"],
  ] as const)("shows the saved %s result without treating it as an automatic match", async (status, skillIds, basis, text) => {
    fixture({ ...basePreview, mappingDetails: [{ itemId: "preview-fact", termIndexes: [0], status, skillIds: [...skillIds], basis }] }); await openPreview();
    expect(within(termControl("Figma").closest("li")!).getByText(text)).toBeInTheDocument();
  });
});
