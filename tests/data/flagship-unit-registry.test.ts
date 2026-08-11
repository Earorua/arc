import { describe, expect, it } from "vitest";
import { unitRegistrySchema } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { validateUnitRegistry } from "../../app/lib/planning/registry-validation";

type LockedTrack = {
  templates: [[string, number], [string, number], [string, number]];
  artifact: RegExp;
  vocabulary: RegExp;
};

const lockedMatrix: Record<string, LockedTrack> = {
  "web-platform": {
    templates: [["Trace a browser interaction end to end", 75], ["Explain the browser-runtime boundary", 30], ["Rebuild semantic HTML and event flow", 30]],
    artifact: /(?=.*\bform\b)(?=.*\b(?:request|event|trace)\b)/u,
    vocabulary: /\b(?:browser|dom|form|event|request)\b/u,
  },
  typescript: {
    templates: [["Model one UI-to-API contract", 90], ["Repair an unsafe typed boundary", 35], ["Practice unions, narrowing and inference", 30]],
    artifact: /(?=.*\bschema\b)(?=.*\b(?:inferred|request|result)\b)(?=.*\btypes?\b)/u,
    vocabulary: /\b(?:typescript|schema|types?|unions?|result|narrow\w*|infer\w*)\b/u,
  },
  react: {
    templates: [["Build an accessible async React flow", 90], ["Diagnose state ownership and rendering", 35], ["Rehearse state, events and effects", 30]],
    artifact: /(?=.*\bform\b)(?=.*\bloading\b)(?=.*\bsuccess\b)(?=.*\b(?:recovery|retry)\b)/u,
    vocabulary: /\b(?:react|state|render|effect|event|form|loading|success|recovery)\b/u,
  },
  "design-systems": {
    templates: [["Author a keyboard-safe component state model", 75], ["Audit semantics, focus and contrast", 30], ["Rebuild focus and error relationships", 30]],
    artifact: /(?=.*\bcomponent\b)(?=.*\bvisible focus\b)(?=.*\bstate text\b)/u,
    vocabulary: /\b(?:component|keyboard|focus|contrast|semantics|error)\b/u,
  },
  "http-apis": {
    templates: [["Design a typed idempotent write endpoint", 75], ["Review an HTTP failure contract", 30], ["Rehearse methods, status and retry semantics", 30]],
    artifact: /(?=.*\brequest\b)(?=.*\bresponse\b)(?=.*\bcontract\b)(?=.*\b(?:safe error|safe failure)\b)/u,
    vocabulary: /\b(?:http|endpoint|request|response|status|retry|success|failure|methods?)\b/u,
  },
  "edge-runtime": {
    templates: [["Ship a Worker-compatible route boundary", 90], ["Explain edge constraints and bindings", 35], ["Rebuild the isolate execution model", 30]],
    artifact: /(?=.*\bedge handler\b)(?=.*\binjected bindings\b)(?=.*\bnode-only\b)/u,
    vocabulary: /\b(?:edge|worker|isolate|binding|bindings|handler|route|runtime|isolation|node-only)\b/u,
  },
  sql: {
    templates: [["Model immutable versions and relations", 90], ["Review keys, cardinality and delete actions", 35], ["Rehearse joins and integrity constraints", 30]],
    artifact: /(?=.*\b(?:additive )?relational schema\b)(?=.*\bownership boundar(?:y|ies)\b)/u,
    vocabulary: /\b(?:sql|schema|relations?|relational|keys?|joins?|constraints?)\b/u,
  },
  "object-storage": {
    templates: [["Design private object metadata and compensation", 60], ["Threat-model an object access path", 30], ["Rehearse database-versus-object boundaries", 30]],
    artifact: /(?=.*\bput\b)(?=.*\bget\b)(?=.*\bcleanup\b)(?=.*\bprivate object keys\b)/u,
    vocabulary: /\b(?:object|storage|metadata|put|get|cleanup|keys)\b/u,
  },
  testing: {
    templates: [["Drive one behavior from RED to GREEN", 75], ["Strengthen a weak regression test", 30], ["Rehearse boundary and mutation tests", 30]],
    artifact: /(?=.*\bfocused test\b)(?=.*\b(?:red|failure before implementation|failing before implementation)\b)/u,
    vocabulary: /\b(?:test|tests|red|green|failure|mutation|boundary)\b/u,
  },
  security: {
    templates: [["Enforce session, ownership and secret boundaries", 90], ["Audit one authorization path", 35], ["Separate authentication from authorization", 30]],
    artifact: /(?=.*\bthreat model\b)(?=.*\bowner-scoped\b)(?=.*\bnegative tests?\b)/u,
    vocabulary: /\b(?:security|session|ownership|authorization|authentication|secret|owner-scoped|negative)\b/u,
  },
  "cloud-delivery": {
    templates: [["Build a reversible delivery runbook", 90], ["Diagnose a failed build or release", 35], ["Rehearse environment and rollback boundaries", 30]],
    artifact: /(?=.*\bbuild\b)(?=.*\bsmoke-check\b)(?=.*\brollback checklist\b)/u,
    vocabulary: /\b(?:delivery|release|build|smoke|rollback|environment)\b/u,
  },
  observability: {
    templates: [["Emit useful telemetry without private data", 60], ["Audit signal quality and redaction", 30], ["Rehearse metrics, logs and traces", 30]],
    artifact: /(?=.*\bstructured event contract\b)(?=.*\ballowed counters only\b)/u,
    vocabulary: /\b(?:telemetry|event|signal|redaction|metrics|logs|traces)\b/u,
  },
  "llm-contracts": {
    templates: [["Validate a mocked structured-model boundary", 90], ["Reject malformed model output safely", 35], ["Separate prompt text from output contracts", 30]],
    artifact: /(?=.*\bprovider-independent schema gate\b)(?=.*\bmalformed fixtures\b)/u,
    vocabulary: /\b(?:model|output|prompt|schema|provider|malformed)\b/u,
  },
  retrieval: {
    templates: [["Rank attributable evidence without fetching", 90], ["Audit provenance, recency and coverage", 35], ["Rehearse source attribution decisions", 30]],
    artifact: /(?=.*\bevidence registry\b)(?=.*\bsource-quality rationale\b)/u,
    vocabulary: /\b(?:retrieval|evidence|sources?|provenance|recency|attribution|claims?|passages?)\b/u,
  },
  "product-thinking": {
    templates: [["Turn a user outcome into acceptance criteria", 60], ["Defend one scope trade-off", 30], ["Separate outcomes from feature output", 30]],
    artifact: /(?=.*\bone-page product slice\b)(?=.*\bgoals\b)(?=.*\bnon-goals\b)(?=.*\bgates\b)/u,
    vocabulary: /\b(?:product|user|outcome|scope|feature|criteria|gates)\b/u,
  },
  "proof-of-work": {
    templates: [["Package a reviewable implementation artifact", 60], ["Assess whether a claim is inspectable", 30], ["Rehearse claim-to-evidence mapping", 30]],
    artifact: /(?=.*\b(?:commit|note)\b)(?=.*\breproduction\b)(?=.*\bverification evidence\b)/u,
    vocabulary: /\b(?:artifact|claim|evidence|commit|note|reproduction|verification)\b/u,
  },
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

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
      const locked = lockedMatrix[skill.id]!;
      expect(track.templates.map((template) => [template.title, template.estimatedMinutes])).toEqual(locked.templates);
      for (const template of track.templates) {
        expect(normalize(`${template.buildTask} ${template.proofRequirement}`), template.id).toMatch(locked.artifact);
      }
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

  it("keeps all 48 rubrics literal, concrete, and template-specific", () => {
    const rubricTriples: string[] = [];
    for (const track of flagshipUnitRegistry.tracks) {
      const vocabulary = lockedMatrix[track.skillId]!.vocabulary;
      for (const template of track.templates) {
        const rubric = normalize(template.rubric.join(" "));
        rubricTriples.push(rubric);
        expect(rubric, template.id).toMatch(vocabulary);
        expect(rubric, template.id).not.toMatch(
          /the artifact is incomplete|meets the stated criteria|also explains trade-offs/u,
        );
      }
    }
    expect(new Set(rubricTriples)).toHaveLength(48);
  });

  it("detects a template replaced by another template's rubric", () => {
    const registry = structuredClone(flagshipUnitRegistry);
    registry.tracks[0]!.templates[1]!.rubric = [...registry.tracks[0]!.templates[0]!.rubric];
    const rubricTriples = registry.tracks.flatMap((track) =>
      track.templates.map((template) => normalize(template.rubric.join(" "))),
    );
    expect(new Set(rubricTriples)).toHaveLength(rubricTriples.length - 1);
  });

  it("keeps objectives, rationale, and timed step labels independently authored", () => {
    const contentSignatures: string[] = [];
    const stepLabels: string[] = [];
    for (const track of flagshipUnitRegistry.tracks) {
      const vocabulary = lockedMatrix[track.skillId]!.vocabulary;
      for (const template of track.templates) {
        const signature = normalize([
          template.objective,
          template.whyNow,
          ...template.steps.map((step) => step.label),
        ].join(" "));
        contentSignatures.push(signature);
        for (const step of template.steps) {
          const label = normalize(step.label);
          stepLabels.push(label);
          expect(label, step.id).toMatch(vocabulary);
        }
        expect(signature, template.id).toMatch(vocabulary);
        expect(signature, template.id).not.toMatch(/\$\{|<skill>|skill name|placeholder|\btodo\b|\btbd\b/u);
      }
    }
    expect(new Set(contentSignatures)).toHaveLength(48);
    expect(new Set(stepLabels)).toHaveLength(stepLabels.length);
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
