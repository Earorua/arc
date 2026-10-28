import { beforeEach, describe, expect, it } from "vitest";
import { adaptiveDraftSchema, claimGuestSetupDraft, clearSetupDrafts, legacyDraftSchema, readSetupDraft, writeSetupDraft } from "../../app/components/setup/setup-draft";
import { createSkillAuditDraft } from "../../app/components/setup/skill-audit-step";
import { createAvailabilityDraft } from "../../app/components/setup/availability-step";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";

const legacy = { step: 2, customRole: "数据产品经理", answers: { roleId: "数据产品经理", level: "beginner" as const, weeklyMinutes: 180, targetWeeks: 18 }, source: { source: "flagship" as const, roleId: "ai-native-full-stack-engineer" as const }, adaptiveSelected: false, adaptiveStarted: false };
beforeEach(() => localStorage.clear());

describe("validated setup drafts", () => {
  it("rejects owner, source, schema and freshness mismatches at the storage boundary", () => {
    writeSetupDraft("user:alice", "flow", legacyDraftSchema, legacy);
    const key = localStorage.key(0)!;
    const original = JSON.parse(localStorage.getItem(key)!);
    for (const patch of [{ owner: "user:bob" }, { source: "another-flow" }, { version: 2 }, { updatedAt: 0 }, { data: { ...legacy, step: 8 } }]) {
      localStorage.setItem(key, JSON.stringify({ ...original, ...patch }));
      expect(readSetupDraft("user:alice", "flow", legacyDraftSchema)).toBeNull();
    }
    localStorage.setItem(key, "{broken");
    expect(readSetupDraft("user:alice", "flow", legacyDraftSchema)).toBeNull();
  });

  it("rejects unknown skill levels while retaining incomplete optional evidence as editable input", () => {
    const draft = { stageIndex: 0, auditDraft: createSkillAuditDraft(flagshipBlueprint), availabilityDraft: createAvailabilityDraft("UTC"), targetWeeks: 18, selectedScope: null };
    draft.auditDraft.evidence["web-platform"] = [{ id: "evidence-web-platform-1", kind: "project", url: "", note: "" }];
    expect(writeSetupDraft("user:alice", "adaptive:flagship:one", adaptiveDraftSchema, draft)).toBe(true);
    expect(readSetupDraft("user:alice", "adaptive:flagship:one", adaptiveDraftSchema)).toMatchObject({ auditDraft: draft.auditDraft });
    const invalid = { ...draft, auditDraft: { ...draft.auditDraft, levels: { ...draft.auditDraft.levels, "web-platform": "expert" } } };
    expect(adaptiveDraftSchema.safeParse(invalid).success).toBe(false);
  });

  it("resets only this owner's setup drafts and preserves research recovery", () => {
    writeSetupDraft("user:alice", "flow", legacyDraftSchema, legacy);
    writeSetupDraft("user:bob", "flow", legacyDraftSchema, legacy);
    localStorage.setItem("arc:role-research:v1", "research-recovery-sentinel");
    clearSetupDrafts("user:alice");
    expect(readSetupDraft("user:alice", "flow", legacyDraftSchema)).toBeNull();
    expect(readSetupDraft("user:bob", "flow", legacyDraftSchema)).toEqual(legacy);
    expect(localStorage.getItem("arc:role-research:v1")).toBe("research-recovery-sentinel");
  });

  it("does not transfer a research source through the guest handoff", () => {
    writeSetupDraft("guest", "flow", legacyDraftSchema, { ...legacy, source: { source: "research", researchRunId: "research-owner-a" } });
    expect(claimGuestSetupDraft("user:bob")).toBeNull();
    expect(readSetupDraft("user:bob", "flow", legacyDraftSchema)).toBeNull();
  });
});
