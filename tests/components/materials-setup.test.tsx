import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialSetupProvider, useMaterialSetup } from "../../app/components/materials/material-setup-provider";
import { MaterialContextReview, type MaterialPreviewInputs } from "../../app/components/materials/material-context-review";
import type { DocumentsClient } from "../../app/lib/documents-client";
import { materialContextRequest } from "../helpers/material-planning";
import { documentEndpointContracts } from "../../app/contracts/documents-api";

const caps = { documentsEnabled: true, analysisEnabled: true, planningEnabled: true, hasDocuments: true, providerLabel: "Offline", providerPolicyId: "policy", policyVersion: "2026.11.1", reason: "ready" } as const;
const ref = { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", revision: 1, confirmationId: "confirmation-a" };
const source = materialContextRequest();
const input: MaterialPreviewInputs = { source: source.source, audit: source.audit, availability: source.availability, target: source.target, planningDate: source.planningDate, selectedScope: source.selectedScope };
const preview = { confirmedItems: [{ id: "item-a", kind: "requirement", text: "PRIVATE-SETUP-SENTINEL", origin: "user", sourceRef: null, requirementLevel: "must" }], priorities: [], issues: [], uncoveredLabels: [] };
function fixture() {
  let selection: unknown = null;
  const invoke = vi.fn(async (endpoint: string, body: Record<string, unknown>): Promise<unknown> => {
    if (endpoint === "createMaterialSelection") { selection = { selectionId: "selection-a", schemaVersion: "2026.11.1", selectionRevision: 0, scope: body.scope, entries: body.entries, state: "active", boundGoalId: null }; return { selectionId: "selection-a", selectionRevision: 0 }; }
    if (endpoint === "readMaterialSelection") return { selection, versions: [{ documentId: ref.documentId, documentVersionId: ref.documentVersionId, state: "active" }] };
    if (endpoint === "createMaterialContext") return { contextVersionId: "context-a", previewToken: "a".repeat(64), preview };
    if (endpoint === "readMaterialContext") return { contextVersionId: "context-a", state: "active", expiresAt: "2026-11-05T00:00:00Z", preview };
    throw new Error("Unexpected");
  });
  const client = { capabilities: async () => caps, request: invoke } as unknown as DocumentsClient;
  const onPreview = vi.fn();
  function Controls() {
    const state = useMaterialSetup(); const [nextInput, setInput] = useState(input);
    return <><button disabled={!state?.ready} onClick={() => state?.setSlot("jd", ref)}>选择已确认 JD</button>
      <button onClick={() => setInput({ ...nextInput, selectedScope: "target-date" })}>修改范围</button>
      <MaterialContextReview input={nextInput} availableSkills={[{ id: "react", name: "React 19" }]} onPreview={onPreview} /></>;
  }
  return { invoke, client, Controls, onPreview };
}
describe("material context review in the existing setup", () => {
  beforeEach(() => localStorage.clear()); afterEach(cleanup);
  it("lists each supplement even without a resume or JD and removes only the chosen version", async () => {
    const { client, onPreview } = fixture();
    const unconfirmed = { documentId: "note-b", documentVersionId: "version-b", textVersionId: "text-b", revision: 1 };
    function Supplements() {
      const state = useMaterialSetup();
      return <><button disabled={!state?.ready} onClick={() => state?.setSupplements([ref, unconfirmed])}>选择两份补充资料</button>
        <MaterialContextReview input={input} onPreview={onPreview} /></>;
    }
    render(<MaterialSetupProvider ownerId="owner-a" scopeKey="setup" client={client}><Supplements /></MaterialSetupProvider>);
    const choose = screen.getByRole("button", { name: "选择两份补充资料" });
    await waitFor(() => expect(choose).toBeEnabled());
    fireEvent.click(choose);
    const summary = within(await screen.findByRole("region", { name: "本次资料选择" }));
    const rows = summary.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("补充资料 1 · 事实已确认");
    expect(rows[1]).toHaveTextContent("补充资料 2 · 待核对确认");
    expect(screen.getByRole("button", { name: "核对资料对路线的影响" })).toBeDisabled();
    fireEvent.click(within(rows[1]).getByRole("button", { name: "移除补充资料 2 选择" }));
    expect(summary.getAllByRole("listitem")).toHaveLength(1);
    expect(summary.getByRole("listitem")).toHaveTextContent("事实已确认");
    expect(screen.getByRole("button", { name: "核对资料对路线的影响" })).toBeEnabled();
  });
  it("shows which facts and skill words a grouped coverage warning refers to", async () => {
    const { client, invoke, Controls } = fixture();
    const original = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (endpoint, body) => endpoint === "createMaterialContext" ? {
      contextVersionId: "context-a", previewToken: "a".repeat(64), preview: {
        ...preview, confirmedItems: [
          { ...preview.confirmedItems[0], id: "one", text: "First requirement", skillLabels: ["unlisted-a"] },
          { ...preview.confirmedItems[0], id: "two", text: "Second requirement", skillLabels: ["unlisted-b"] },
          { ...preview.confirmedItems[0], id: "limit", kind: "constraint", text: "Weekly study limit", requirementLevel: null, skillLabels: ["TypeScript"] },
        ], issues: [{ code: "uncovered", itemIds: ["one", "two"], skillIds: [] }], uncoveredLabels: ["unlisted-a", "unlisted-b"],
      },
    } : original(endpoint, body));
    render(<MaterialSetupProvider ownerId="owner-a" scopeKey="setup" client={client}><Controls /></MaterialSetupProvider>);
    await waitFor(() => expect(screen.getByText("选择已确认 JD")).toBeEnabled());
    fireEvent.click(screen.getByText("选择已确认 JD")); fireEvent.click(await screen.findByText("核对资料对路线的影响"));
    expect(await screen.findByText(/有 2 项需注意/)).toBeInTheDocument();
    expect(screen.getByText("First requirement").closest("li")).toHaveTextContent("unlisted-a");
    expect(screen.getByText("Second requirement").closest("li")).toHaveTextContent("unlisted-b");
    expect(screen.getByText("Weekly study limit").closest("li")).toHaveTextContent("约束主题 TypeScript");
  });
  it("previews confirmed references and persists no facts, names or source text", async () => {
    const { client, invoke, Controls, onPreview } = fixture();
    render(<MaterialSetupProvider ownerId="owner-a" scopeKey="setup" client={client}><Controls /></MaterialSetupProvider>);
    await waitFor(() => expect(screen.getByText("选择已确认 JD")).toBeEnabled());
    fireEvent.click(screen.getByText("选择已确认 JD")); fireEvent.click(await screen.findByText("核对资料对路线的影响"));
    await screen.findByText("PRIVATE-SETUP-SENTINEL");
    const call = invoke.mock.calls.find(([endpoint]) => endpoint === "createMaterialContext")!;
    expect(documentEndpointContracts.createMaterialContext.request.safeParse(call[1]).success).toBe(true);
    expect(onPreview.mock.lastCall?.[0].reference.previewToken).toBe("a".repeat(64));
    expect(JSON.stringify(localStorage)).not.toContain("PRIVATE-SETUP-SENTINEL");
    fireEvent.click(screen.getByText("修改范围"));
    await waitFor(() => expect(screen.queryByText("PRIVATE-SETUP-SENTINEL")).not.toBeInTheDocument());
    expect(onPreview.mock.lastCall?.[0]).toBeNull();
  });
  it("counts independent kinds of reminders on the same fact separately", async () => {
    const { client, invoke, Controls } = fixture();
    const original = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (endpoint, body) => endpoint === "createMaterialContext" ? {
      contextVersionId: "context-a", previewToken: "a".repeat(64), preview: { ...preview, issues: [
        { code: "ambiguous-mapping", itemIds: ["item-a"], skillIds: ["sql", "react"] },
        { code: "uncovered", itemIds: ["item-a"], skillIds: [] },
      ] },
    } : original(endpoint, body));
    render(<MaterialSetupProvider ownerId="owner-a" scopeKey="setup" client={client}><Controls /></MaterialSetupProvider>);
    await waitFor(() => expect(screen.getByText("选择已确认 JD")).toBeEnabled());
    fireEvent.click(screen.getByText("选择已确认 JD")); fireEvent.click(await screen.findByText("核对资料对路线的影响"));
    expect(await screen.findByText(/有 2 项需注意/)).toBeInTheDocument();
  });
  it("retries a failed context without changing an already committed selection mutation body", async () => {
    const { client, invoke, Controls } = fixture(); let failed = false;
    const original = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (endpoint, body) => {
      if (endpoint === "createMaterialContext" && !failed) { failed = true; throw new Error("offline"); }
      return original(endpoint, body);
    });
    render(<MaterialSetupProvider ownerId="owner-a" scopeKey="setup" client={client}><Controls /></MaterialSetupProvider>);
    await waitFor(() => expect(screen.getByText("选择已确认 JD")).toBeEnabled());
    fireEvent.click(screen.getByText("选择已确认 JD")); fireEvent.click(await screen.findByText("核对资料对路线的影响"));
    await screen.findByRole("alert"); fireEvent.click(screen.getByText("核对资料对路线的影响"));
    await screen.findByText("PRIVATE-SETUP-SENTINEL");
    expect(invoke.mock.calls.filter(([method]) => method === "createMaterialSelection")).toHaveLength(1);
    const requests = invoke.mock.calls.filter(([method]) => method === "createMaterialContext").map(([, body]) => body);
    expect(requests[1]).toEqual(requests[0]);
  });
  it("requires a new preview after explicitly mapping a fact and retains no private mapping UI state locally", async () => {
    const { client, invoke, Controls, onPreview } = fixture();
    const original = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (endpoint, body) => {
      if (endpoint === "createMaterialContext") return { contextVersionId: body.skillMappings ? "mapped-context" : "context-a", previewToken: "a".repeat(64), preview: { ...preview,
        itemReferences: [{ id: "item-a", confirmationId: "confirmation-a", itemId: "original-item-a" }],
        issues: body.skillMappings ? [] : [{ code: "uncovered", itemIds: ["item-a"], skillIds: [] }],
        ...(body.skillMappings ? { skillMappings: body.skillMappings } : {}),
      } };
      return original(endpoint, body);
    });
    render(<MaterialSetupProvider ownerId="owner-a" scopeKey="setup" client={client}><Controls /></MaterialSetupProvider>);
    await waitFor(() => expect(screen.getByText("选择已确认 JD")).toBeEnabled());
    fireEvent.click(screen.getByText("选择已确认 JD")); fireEvent.click(await screen.findByText("核对资料对路线的影响"));
    const mapping = await screen.findByRole("combobox", { name: "事实 1 对应的已有技能" });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["自动对应；未匹配时保留未覆盖", "React 19"]);
    fireEvent.change(mapping, { target: { value: "react" } });
    expect(onPreview.mock.lastCall?.[0]).toBeNull();
    expect(screen.getByText("PRIVATE-SETUP-SENTINEL")).toBeInTheDocument();
    fireEvent.click(screen.getByText("核对资料对路线的影响"));
    await waitFor(() => expect(onPreview.mock.lastCall?.[0]?.reference.contextVersionId).toBe("mapped-context"));
    const contexts = invoke.mock.calls.filter(([method]) => method === "createMaterialContext");
    expect(contexts.at(-1)?.[1].skillMappings).toEqual([{ confirmationId: "confirmation-a", itemId: "original-item-a", skillId: "react" }]);
    expect(contexts.at(-1)?.[1].mutationId).not.toBe(contexts[0]?.[1].mutationId);
    expect(JSON.stringify(localStorage)).not.toContain("PRIVATE-SETUP-SENTINEL");
    expect(JSON.stringify(localStorage)).not.toContain("original-item-a");
    fireEvent.click(screen.getByText("修改范围"));
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "事实 1 对应的已有技能" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByText("核对资料对路线的影响"));
    await waitFor(() => expect(invoke.mock.calls.filter(([method]) => method === "createMaterialContext")).toHaveLength(3));
    expect(invoke.mock.calls.filter(([method]) => method === "createMaterialContext").at(-1)?.[1]).not.toHaveProperty("skillMappings");
  });
  it("shows frozen skill mappings as ready and read-only when recovering a locked preview", async () => {
    const { client, invoke, onPreview } = fixture(); const original = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (endpoint, body) => endpoint === "readMaterialContext"
      ? { contextVersionId: "context-a", state: "active", expiresAt: "2026-11-05T00:00:00Z", preview: { ...preview,
        itemReferences: [{ id: "item-a", confirmationId: "confirmation-a", itemId: "original-item-a" }],
        skillMappings: [{ confirmationId: "confirmation-a", itemId: "original-item-a", skillId: "react" }],
      } } : original(endpoint, body));
    function Recovery() {
      const state = useMaterialSetup();
      return <><button disabled={!state?.ready} onClick={() => {
        state?.setSlot("jd", ref);
        state?.setPreview({ contextVersionId: "context-a", previewToken: "a".repeat(64), selectionRef: { selectionId: "selection-a", selectionRevision: 0 } });
      }}>恢复预览</button><MaterialContextReview input={input} availableSkills={[{ id: "react", name: "React 19" }]} disabled recovering onPreview={onPreview} /></>;
    }
    render(<MaterialSetupProvider ownerId="owner-a" scopeKey="setup" client={client}><Recovery /></MaterialSetupProvider>);
    await waitFor(() => expect(screen.getByText("恢复预览")).toBeEnabled()); fireEvent.click(screen.getByText("恢复预览"));
    const control = await screen.findByRole("combobox", { name: "事实 1 对应的已有技能" });
    expect(control).toHaveValue("react"); expect(control).toBeDisabled();
    expect(screen.getByText("资料预览已就绪。创建路线时将再次校验所选版本。")).toBeInTheDocument();
    expect(onPreview.mock.lastCall?.[0]?.reference.contextVersionId).toBe("context-a");
  });
});
