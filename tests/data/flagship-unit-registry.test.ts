import { describe, expect, it } from "vitest";
import { unitRegistrySchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { validateUnitRegistry } from "../../app/lib/planning/registry-validation";

describe("flagshipUnitRegistry", () => {
  it("is parsed once as the versioned flagship registry", () => {
    expect(unitRegistrySchema.parse(flagshipUnitRegistry)).toEqual(flagshipUnitRegistry);
    expect(flagshipUnitRegistry).toMatchObject({
      id: "ai-native-full-stack-engineer-units",
      version: "2026.08.1",
      blueprintId: flagshipBlueprint.id,
      blueprintVersion: flagshipBlueprint.version,
    });
    expect(validateUnitRegistry(flagshipUnitRegistry, flagshipBlueprint)).toEqual({ valid: true, issues: [] });
  });

  it("covers exactly all 16 skills with the locked three-unit matrix", () => {
    const lockedMatrix: Record<string, [[string, number], [string, number], [string, number]]> = {
      "web-platform": [["Trace a browser interaction end to end", 75], ["Explain browser-runtime boundary", 30], ["Rebuild semantic HTML and event flow", 30]],
      typescript: [["Model one UI-to-API contract", 90], ["Repair unsafe typed boundary", 35], ["Practice unions narrowing inference", 30]],
      react: [["Build accessible async React flow", 90], ["Diagnose state ownership/rendering", 35], ["Rehearse state events effects", 30]],
      "design-systems": [["Author keyboard-safe component state model", 75], ["Audit semantics focus contrast", 30], ["Rebuild focus/error relationships", 30]],
      "http-apis": [["Design typed idempotent write endpoint", 75], ["Review HTTP failure contract", 30], ["Rehearse methods status retry semantics", 30]],
      "edge-runtime": [["Ship Worker-compatible route boundary", 90], ["Explain edge constraints/bindings", 35], ["Rebuild isolate execution model", 30]],
      sql: [["Model immutable versions and relations", 90], ["Review keys cardinality delete actions", 35], ["Rehearse joins/integrity constraints", 30]],
      "object-storage": [["Design private object metadata and compensation", 60], ["Threat-model object access path", 30], ["Rehearse database-vs-object boundaries", 30]],
      testing: [["Drive behavior RED to GREEN", 75], ["Strengthen weak regression test", 30], ["Rehearse boundary/mutation tests", 30]],
      security: [["Enforce session ownership secret boundaries", 90], ["Audit authorization path", 35], ["Separate authentication from authorization", 30]],
      "cloud-delivery": [["Build reversible delivery runbook", 90], ["Diagnose failed build/release", 35], ["Rehearse environment/rollback boundaries", 30]],
      observability: [["Emit useful telemetry without private data", 60], ["Audit signal quality/redaction", 30], ["Rehearse metrics/logs/traces", 30]],
      "llm-contracts": [["Validate mocked structured-model boundary", 90], ["Reject malformed model output", 35], ["Separate prompt text/output contracts", 30]],
      retrieval: [["Rank attributable evidence without fetching", 90], ["Audit provenance recency coverage", 35], ["Rehearse source attribution decisions", 30]],
      "product-thinking": [["Turn user outcome into acceptance criteria", 60], ["Defend one scope trade-off", 30], ["Separate outcomes from feature output", 30]],
      "proof-of-work": [["Package reviewable implementation artifact", 60], ["Assess whether claim inspectable", 30], ["Rehearse claim-to-evidence mapping", 30]],
    };
    const tracks = new Map(flagshipUnitRegistry.tracks.map((track) => [track.skillId, track]));
    expect([...tracks.keys()].sort()).toEqual(flagshipBlueprint.skills.map((skill) => skill.id).sort());
    expect(tracks).toHaveLength(16);
    expect(flagshipUnitRegistry.tracks.flatMap((track) => track.templates)).toHaveLength(48);

    for (const skill of flagshipBlueprint.skills) {
      const track = tracks.get(skill.id);
      expect(track, skill.id).toBeDefined();
      if (!track) continue;
      expect(track.templates.map((template) => template.id)).toEqual([
        `${skill.id}-learn-01`,
        `${skill.id}-calibrate-01`,
        `${skill.id}-reinforce-01`,
      ]);
      expect(track.templates.map((template) => template.kind)).toEqual(["learn", "calibrate", "reinforce"]);
      expect(track.templates.map((template) => [template.title, template.estimatedMinutes])).toEqual(lockedMatrix[skill.id]);
    }
  });

  it("uses stable unique IDs, exact minute totals, and inspectable authored content", () => {
    const templates = flagshipUnitRegistry.tracks.flatMap((track) => track.templates);
    const templateIds = templates.map((template) => template.id);
    const stepIds = templates.flatMap((template) => template.steps.map((step) => step.id));
    const checkpointIds = templates.flatMap((template) => template.checkpoints.map((checkpoint) => checkpoint.id));

    expect(new Set(templateIds)).toHaveLength(templateIds.length);
    expect(new Set(stepIds)).toHaveLength(stepIds.length);
    expect(new Set(checkpointIds)).toHaveLength(checkpointIds.length);
    for (const template of templates) {
      expect(template.estimatedMinutes).toBeGreaterThanOrEqual(15);
      expect(template.estimatedMinutes).toBeLessThanOrEqual(180);
      expect(template.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(template.estimatedMinutes);
      expect(template.completionCriteria.length).toBeGreaterThanOrEqual(2);
      expect(template.rubric).toHaveLength(3);
      expect(template.rubric[0]).toMatch(/^Level 1:/u);
      expect(template.rubric[1]).toMatch(/^Level 2:/u);
      expect(template.rubric[2]).toMatch(/^Level 3:/u);
      expect(template.proofRequirement).toMatch(/^(?:Provide|Submit) /u);
      expect(template.proofRequirement).not.toMatch(/Arc (?:verified|approved|certified)/iu);
    }
  });

  it("resolves every resource to the template skill with a blueprint backlink", () => {
    const resources = new Map(flagshipBlueprint.resources.map((resource) => [resource.id, resource]));
    for (const track of flagshipUnitRegistry.tracks) {
      for (const template of track.templates) {
        expect(template.primaryResourceId).toBe(`${track.skillId}-official`);
        expect(template.alternativeResourceIds).toEqual([]);
        expect(resources.get(template.primaryResourceId)?.skillIds).toContain(track.skillId);
      }
    }
  });

  it("splits only long templates into contiguous 30-to-60-minute checkpoints", () => {
    for (const template of flagshipUnitRegistry.tracks.flatMap((track) => track.templates)) {
      if (template.estimatedMinutes <= 60) {
        expect(template.checkpoints, template.id).toEqual([]);
        continue;
      }
      expect(template.checkpoints.length).toBeGreaterThan(0);
      expect(template.checkpoints.flatMap((checkpoint) => checkpoint.stepIds)).toEqual(
        template.steps.map((step) => step.id),
      );
      expect(template.checkpoints.reduce((sum, checkpoint) => sum + checkpoint.estimatedMinutes, 0)).toBe(
        template.estimatedMinutes,
      );
      for (const checkpoint of template.checkpoints) {
        expect(checkpoint.estimatedMinutes).toBeGreaterThanOrEqual(30);
        expect(checkpoint.estimatedMinutes).toBeLessThanOrEqual(60);
      }
    }
  });
});
