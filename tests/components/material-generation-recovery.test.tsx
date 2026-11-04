import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdaptiveSetupFlow } from "../../app/components/setup/adaptive-setup-flow";
import { adaptiveDraftSchema, writeSetupDraft } from "../../app/components/setup/setup-draft";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { materialContextRequest } from "../helpers/material-planning";
const materialState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../../app/components/materials/material-setup-provider", () => ({
  useMaterialSetup: () => materialState.value, MaterialSelectionSummary: () => null,
  MaterialSetupSlot: () => null, MaterialSetupLibrary: () => null,
}));
beforeEach(() => localStorage.clear()); afterEach(cleanup);
function setup() {
  const input = materialContextRequest();
  const original = { source: input.source, audit: input.audit, availability: input.availability, target: input.target, planningDate: input.planningDate, selectedScope: input.selectedScope,
    materials: { contextVersionId: "context-expired", previewToken: "a".repeat(64), selectionRef: input.selectionRef }, mutationId: "generate-original" };
  const { mutationId, ...payload } = original;
  const draftSource = `adaptive:flagship:${flagshipBlueprint.id}:${flagshipBlueprint.version}:${flagshipUnitRegistry.id}:${flagshipUnitRegistry.version}`;
  writeSetupDraft("user:owner-a", draftSource, adaptiveDraftSchema, { stageIndex: 2, furthestStep: 3, auditDraft: { levels: Object.fromEntries(flagshipBlueprint.skills.map(skill => [skill.id, "conceptual" as const])), evidence: {} }, availabilityDraft: { timeZone: "UTC", weekdays: input.availability.weekdays, exceptions: [] }, targetWeeks: 52, selectedScope: "full-scope", planningInstant: "2026-11-04T00:00:00.000Z", buildAttempt: { key: JSON.stringify(payload), mutationId } });
  const request = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => { throw Error("expired preview"); });
  materialState.value = { refs: { draftId: "draft-a", slots: { jd: { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", revision: 0, confirmationId: "confirmation-a" } }, supplements: [], preview: original.materials, selection: input.selectionRef }, capabilities: { documentsEnabled: true, planningEnabled: true }, client: { request }, runScoped: (work: (signal: AbortSignal) => Promise<unknown>) => work(new AbortController().signal), setSelection: vi.fn(), setPreview: vi.fn() };
  const generate = vi.fn().mockResolvedValue(true); const navigate = vi.fn(); const schedule = vi.fn();
  const props = { blueprint: flagshipBlueprint, registry: flagshipUnitRegistry, source: input.source, draftOwner: "user:owner-a", lockedGeneration: true, generate, navigate, now: () => new Date("2026-11-04T02:00:00.000Z"), createMutationId: () => "generate-replacement", timeZone: "UTC", scheduleForSubmit: schedule };
  return { original, request, generate, navigate, schedule, props };
}
it("replays the exact original mutation and opaque material refs despite an expired preview GET", async () => {
  const state = setup(); render(<AdaptiveSetupFlow {...state.props} />);
  await screen.findByText("原预览已不可恢复，请返回路线确认保存结果。");
  const retry = screen.getByRole("button", { name: "重试保存原计划" });
  expect(retry).toBeEnabled(); fireEvent.click(retry);
  await waitFor(() => expect(state.generate).toHaveBeenCalledWith(state.original));
  expect(state.schedule).not.toHaveBeenCalled();
  expect(state.navigate).toHaveBeenCalledWith("/path?created=1");
});
it("does not enable replacement from timeout or a failed authoritative receipt query", async () => {
  const state = setup(); const check = vi.fn().mockResolvedValue(false);
  render(<AdaptiveSetupFlow {...state.props} checkMaterialRecovery={check} />);
  fireEvent.click(await screen.findByRole("button", { name: "查询保存状态并恢复预览" }));
  await waitFor(() => expect(check).toHaveBeenCalledWith(state.original));
  expect(screen.getByRole("button", { name: "核对资料对路线的影响" })).toBeDisabled();
  expect(state.generate).not.toHaveBeenCalled();
});
it("re-previews only after authoritative proof and preserves every non-material generation input", async () => {
  const state = setup(); const check = vi.fn().mockResolvedValue(true); const prepare = vi.fn().mockResolvedValue(true);
  state.request.mockImplementation(async (endpoint) => {
    if (endpoint === "readMaterialContext") throw Error("expired preview");
    if (endpoint === "readMaterialSelection") return { selection: { state: "active", scope: { kind: "draft", draftId: "draft-a", previousGoalId: null }, entries: [{ slot: "jd", documentId: "doc-a", documentVersionId: "version-a", confirmationId: "confirmation-a" }], selectionId: "selection-a", selectionRevision: 0 } };
    if (endpoint === "createMaterialContext") return { contextVersionId: "context-fresh", previewToken: "b".repeat(64), preview: { confirmedItems: [], priorities: [], issues: [], uncoveredLabels: [] } };
    throw Error(String(endpoint));
  });
  render(<AdaptiveSetupFlow {...state.props} checkMaterialRecovery={check} prepareMaterialReplacement={prepare} />);
  fireEvent.click(await screen.findByRole("button", { name: "查询保存状态并恢复预览" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "核对资料对路线的影响" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "采用新预览并继续保存" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" }));
  await screen.findByText("资料预览已就绪。创建路线时将再次校验所选版本。");
  fireEvent.click(screen.getByRole("button", { name: "采用新预览并继续保存" }));
  const replacement = { ...state.original, mutationId: "generate-replacement", materials: { ...state.original.materials, contextVersionId: "context-fresh", previewToken: "b".repeat(64) } };
  await waitFor(() => expect(state.generate).toHaveBeenCalledWith(replacement));
  expect(prepare).toHaveBeenCalledWith(state.original, replacement);
  expect(state.request.mock.calls.find(([endpoint]) => endpoint === "createMaterialContext")?.[1]).toMatchObject({ audit: state.original.audit, availability: state.original.availability, target: state.original.target, planningDate: state.original.planningDate, selectedScope: state.original.selectedScope, scope: { kind: "draft", draftId: "draft-a", previousGoalId: null } });
  expect(state.schedule).not.toHaveBeenCalled();
});
