import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import * as materials from "../../app/contracts/material-planning";
import { MAX_MATERIAL_CONTEXT_JSON_BYTES, materialScopeSchema, utf8Bytes } from "../../app/contracts/documents";
import { generatePlanningRequestSchema } from "../../app/contracts/planning-api";
import { canonicalJson, fingerprint } from "../../app/lib/planning/fingerprint";

it("continues to reject expanded uncovered lists over the total preview byte bound", () => {
  const preview = { confirmedItems: [], priorities: [], issues: [], uncoveredLabels: Array.from({ length: 1000 }, (_, index) => `${"界".repeat(96)}${index}`) };
  expect(utf8Bytes(JSON.stringify(preview))).toBeGreaterThan(MAX_MATERIAL_CONTEXT_JSON_BYTES);
  const parsed = materials.materialContextPreviewSchema.safeParse(preview);
  expect(parsed.success).toBe(false);
  if (!parsed.success) expect(parsed.error.issues.map(issue => issue.message)).toEqual(["Serialized material exceeds byte limit"]);
});

const scope = { kind: "draft", draftId: "draft-a", previousGoalId: null } as const;
const audit = { id: "audit-a", schemaVersion: "2026.08.1", blueprintId: "ai-native-full-stack-engineer", blueprintVersion: "2026.08.1", answers: [{ skillId: "sql", level: "uncertain", evidenceRefs: [] }], evidence: [], createdBy: "owner-a", inputFingerprint: "p2-audit" };
const availability = { id: "availability-a", schemaVersion: "2026.08.1", timeZone: "Asia/Shanghai", weekdays: { monday: 60, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 }, exceptions: [], weeklyMinutes: 60, inputFingerprint: "p2-time" };
const target = { id: "target-a", schemaVersion: "2026.08.1", targetWeeks: 8, inputFingerprint: "p2-target" };
const snapshot = { schemaVersion: "2026.11.1", ownerId: "owner-a", selectionRef: { selectionId: "selection-a", selectionRevision: 1 }, scope, sourceReference: { source: "flagship", roleId: "ai-native-full-stack-engineer" }, dependencies: [{ slot: "resume", documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", confirmationId: "confirmation-a", generation: 1, confirmationDigest: "a".repeat(64) }], audit, availability, target, planningDate: "2026-11-04", selectedScope: "full-scope", policyVersion: "2026.11.1", mappingVersion: "2026.11.1", explanationVersion: "2026.11.1" };

describe("material planning contract", () => {
  it("binds term choices and learning intent adoption to the selected version without order semantics", async () => {
    const term = { confirmationId: "confirmation-a", itemId: "fact-a", skillLabel: "UI tokens", skillIds: ["design-systems", "react"] };
    const intent = { confirmationId: "confirmation-a", itemId: "fact-a" };
    const value = { ...snapshot, termMappings: [term], learningIntents: [intent] };
    expect(materials.contextInputSnapshotSchema.safeParse(value).success).toBe(true);
    const digest = await materials.createMaterialContextFingerprint(value);
    expect(await materials.createMaterialContextFingerprint({ ...value, termMappings: [{ ...term, skillIds: [...term.skillIds].reverse() }] })).toBe(digest);
    expect(await materials.createMaterialContextFingerprint({ ...value, learningIntents: [] })).not.toBe(digest);
    expect(await materials.createMaterialContextFingerprint({ ...value, termMappings: [{ ...term, skillIds: [] }] })).not.toBe(digest);
    expect(await materials.createMaterialContextFingerprint({ ...snapshot, termMappings: [], learningIntents: [] })).toBe(await materials.createMaterialContextFingerprint(snapshot));
    const reordered = { ...value, termMappings: [term, { ...term, skillLabel: "React", skillIds: [] }], learningIntents: [intent, { ...intent, itemId: "fact-b" }] };
    expect(await materials.createMaterialContextFingerprint(reordered)).toBe(await materials.createMaterialContextFingerprint({ ...reordered,
      termMappings: [...reordered.termMappings].reverse(), learningIntents: [...reordered.learningIntents].reverse() }));
    for (const invalid of [
      { ...value, learningIntents: [intent, intent] },
      { ...value, learningIntents: [{ ...intent, confirmationId: "other" }] },
      { ...value, termMappings: [term, term] },
      { ...value, termMappings: [{ ...term, skillIds: ["react", "react"] }] },
      { ...value, termMappings: [{ ...term, confirmationId: "other" }] },
      { ...value, skillMappings: [{ ...intent, skillId: "sql" }] },
    ]) expect(materials.contextInputSnapshotSchema.safeParse(invalid).success).toBe(false);
  });
  it("strictly binds opaque mapping choices to selected confirmations and semantic fingerprints", async () => {
    const mapping = { confirmationId: "confirmation-a", itemId: "fact-a", skillId: "react" };
    const mapped = { ...snapshot, skillMappings: [mapping] };
    expect(materials.contextInputSnapshotSchema.safeParse(mapped).success).toBe(true);
    expect(await materials.createMaterialContextFingerprint(mapped)).not.toBe(await materials.createMaterialContextFingerprint({ ...mapped, skillMappings: [{ ...mapping, skillId: "sql" }] }));
    expect(await materials.createMaterialContextFingerprint({ ...snapshot, skillMappings: [] })).toBe(await materials.createMaterialContextFingerprint(snapshot));
    for (const invalid of [[mapping, mapping], [{ ...mapping, ownerId: "owner-b" }], [{ ...mapping, confirmationId: "unselected-confirmation" }]]) {
      expect(materials.contextInputSnapshotSchema.safeParse({ ...snapshot, skillMappings: invalid }).success).toBe(false);
    }
  });
  it("requires a bounded explanation version in the strict context snapshot", () => {
    expect(materials.contextInputSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const { explanationVersion, ...missingExplanationVersion } = snapshot;
    void explanationVersion;
    expect(materials.contextInputSnapshotSchema.safeParse(missingExplanationVersion).success).toBe(false);
    for (const value of [null, "", "latest", `2026.11.${"1".repeat(25)}`]) expect(materials.contextInputSnapshotSchema.safeParse({ ...snapshot, explanationVersion: value }).success).toBe(false);
    expect(materials.contextInputSnapshotSchema.safeParse({ ...snapshot, explanationPolicyVersion: "2026.11.1" }).success).toBe(false);
  });
  it("changes the semantic fingerprint when explanation version changes", async () => {
    expect(await materials.createMaterialContextFingerprint(snapshot)).not.toBe(await materials.createMaterialContextFingerprint({ ...snapshot, explanationVersion: "2026.11.2" }));
  });
  it.each([scope, { ...scope, previousGoalId: "goal-previous" }, { kind: "goal", goalId: "goal-a", workspaceId: "workspace-a", baseVersionId: "plan-a", revision: 2 }])("accepts scoped creation or current-route input %j", (value) => expect(materialScopeSchema.parse(value)).toEqual(value));
  it("rejects mixed scopes and archived goals as writable scopes", () => {
    expect(materialScopeSchema.safeParse({ ...scope, goalId: "goal-a" }).success).toBe(false);
    expect(materialScopeSchema.safeParse({ kind: "archived", goalId: "goal-a" }).success).toBe(false);
  });
  it("public references carry only explicit versions and preview digest", () => {
    const reference = { contextVersionId: "context-a", selectionRef: snapshot.selectionRef, previewToken: "a".repeat(64) };
    expect(materials.materialPlanningReferenceSchema.parse(reference)).toEqual(reference);
    expect(materials.materialPlanningReferenceSchema.safeParse({ ...reference, ownerId: "owner-a" }).success).toBe(false);
    expect(materials.materialPlanningReferenceSchema.safeParse({ ...reference, previewToken: "p2-old" }).success).toBe(false);
  });
  it("uses SHA-256 over normalized semantic inputs, independently of old p2 hashes", async () => {
    const normalized = materials.normalizeContextInputSnapshot(snapshot);
    const result = await materials.createMaterialContextFingerprint(snapshot);
    expect(result).toBe(createHash("sha256").update(canonicalJson(normalized)).digest("hex"));
    expect(result).not.toMatch(/^p2-/u);
    expect(await materials.createMaterialContextFingerprint({ ...snapshot, target: { ...target, id: "target-b", inputFingerprint: "different-metadata" }, audit: { ...audit, id: "audit-b", inputFingerprint: "different-metadata" } })).toBe(result);
    expect(await materials.createMaterialContextFingerprint({ ...snapshot, dependencies: [{ ...snapshot.dependencies[0], confirmationId: "confirmation-b" }] })).not.toBe(result);
    expect(await materials.createMaterialContextFingerprint({ ...snapshot, ownerId: "owner-b" })).not.toBe(result);
    expect(await materials.createMaterialContextFingerprint({ ...snapshot, audit: { ...audit, answers: [{ ...audit.answers[0], level: "guided" }] } })).not.toBe(result);
  });
  it("normalizes display order but includes complete time and version dependencies", async () => {
    const expanded = { ...snapshot, dependencies: [...snapshot.dependencies, { ...snapshot.dependencies[0], slot: "jd", documentId: "doc-b", documentVersionId: "version-b", textVersionId: "text-b", confirmationId: "confirmation-b" }] };
    expect(await materials.createMaterialContextFingerprint(expanded)).toBe(await materials.createMaterialContextFingerprint({ ...expanded, dependencies: [...expanded.dependencies].reverse() }));
    expect(await materials.createMaterialContextFingerprint(snapshot)).not.toBe(await materials.createMaterialContextFingerprint({ ...snapshot, availability: { ...availability, timeZone: "UTC" } }));
    expect(materials.contextInputSnapshotSchema.safeParse({ ...snapshot, rawText: "private resume" }).success).toBe(false);
    expect(materials.contextInputSnapshotSchema.safeParse({ ...snapshot, dependencies: [snapshot.dependencies[0], snapshot.dependencies[0]] }).success).toBe(false);
  });
  it("lets public history and learning events replay after deletion but refuses new private uses", () => {
    const input = { operation: "regenerate", ownerMatches: true, contextState: "active", unexpired: true, versionsMatch: true, selectionMatches: true, scopeMatches: true, sourceMatches: true };
    expect(materials.materialContextReplayDecision(input)).toBe("allow");
    expect(materials.materialContextReplayDecision({ ...input, contextState: "revoked" })).toBe("gone");
    expect(materials.materialContextReplayDecision({ ...input, operation: "mutation-retry", contextState: "revoked" })).toBe("gone");
    expect(materials.materialContextReplayDecision({ ...input, operation: "accept-proposal", versionsMatch: false })).toBe("conflict");
    expect(materials.materialContextReplayDecision({ ...input, operation: "read-history", contextState: "revoked" })).toBe("public-only");
    expect(materials.materialContextReplayDecision({ ...input, operation: "learning-event", contextState: "revoked" })).toBe("public-only");
    expect(materials.materialContextReplayDecision({ ...input, ownerMatches: false })).toBe("not-found");
  });
  it("preserves exact old requests and fingerprints without sentinel fields", () => {
    const old = { mutationId: "mutation-a", roleId: "ai-native-full-stack-engineer", audit, availability, target, planningDate: "2026-11-04", selectedScope: "full-scope" };
    const before = fingerprint(old);
    expect(materials.generatePlanningWithMaterialsRequestSchema.parse(old)).toEqual(generatePlanningRequestSchema.parse(old));
    expect(fingerprint(materials.generatePlanningWithMaterialsRequestSchema.parse(old))).toBe(before);
    expect(Object.hasOwn(materials.generatePlanningWithMaterialsRequestSchema.parse(old), "materials")).toBe(false);
    expect(materials.generatePlanningWithMaterialsRequestSchema.safeParse({ ...old, materials: null }).success).toBe(false);
    expect(materials.generatePlanningWithMaterialsRequestSchema.safeParse({ ...old, materials: { contextVersionId: "context-a", selectionRef: snapshot.selectionRef, previewToken: "a".repeat(64) } }).success).toBe(true);
  });
});
