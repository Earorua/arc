import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { unitRegistrySchema, type UnitTemplate } from "../../app/contracts/planning";
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
    artifact: /(?=.*\bform\b)(?=.*\b(?:request|event)\b)/u,
    vocabulary: /\b(?:browser|dom|form|event|request)\b/u,
  },
  typescript: {
    templates: [["Model one UI-to-API contract", 90], ["Repair an unsafe typed boundary", 35], ["Practice unions, narrowing and inference", 30]],
    artifact: /\b(?:schema|boundary|result union)\b/u,
    vocabulary: /\b(?:typescript|schema|types?|unions?|result|narrow\w*|infer\w*)\b/u,
  },
  react: {
    templates: [["Build an accessible async React flow", 90], ["Diagnose state ownership and rendering", 35], ["Rehearse state, events and effects", 30]],
    artifact: /(?=.*\b(?:form|component tree|event)\b)(?=.*\b(?:loading|state|effect|synchronization|recovery)\b)/u,
    vocabulary: /\b(?:react|state|render|effect|event|form|loading|success|recovery)\b/u,
  },
  "design-systems": {
    templates: [["Author a keyboard-safe component state model", 75], ["Audit semantics, focus and contrast", 30], ["Rebuild focus and error relationships", 30]],
    artifact: /(?=.*\b(?:component|control|field)\b)(?=.*\b(?:focus|state|interaction|error)\b)/u,
    vocabulary: /\b(?:component|keyboard|focus|contrast|semantics|error)\b/u,
  },
  "http-apis": {
    templates: [["Design a typed idempotent write endpoint", 75], ["Review an HTTP failure contract", 30], ["Rehearse methods, status and retry semantics", 30]],
    artifact: /(?=.*\b(?:endpoint|request-response)\b)(?=.*\b(?:request|response|failure|retry|status|conflict)\b)/u,
    vocabulary: /\b(?:http|endpoint|request|response|status|retry|success|failure|methods?)\b/u,
  },
  "edge-runtime": {
    templates: [["Ship a Worker-compatible route boundary", 90], ["Explain edge constraints and bindings", 35], ["Rebuild the isolate execution model", 30]],
    artifact: /(?=.*\b(?:edge route|route design|handler)\b)(?=.*\b(?:bindings|runtime|request state)\b)/u,
    vocabulary: /\b(?:edge|worker|isolate|binding|bindings|handler|route|runtime|isolation|node-only)\b/u,
  },
  sql: {
    templates: [["Model immutable versions and relations", 90], ["Review keys, cardinality and delete actions", 35], ["Rehearse joins and integrity constraints", 30]],
    artifact: /(?=.*\b(?:schema|join)\b)(?=.*\b(?:ownership|integrity|constraints)\b)/u,
    vocabulary: /\b(?:sql|schema|relations?|relational|keys?|joins?|constraints?)\b/u,
  },
  "object-storage": {
    templates: [["Design private object metadata and compensation", 60], ["Threat-model an object access path", 30], ["Rehearse database-versus-object boundaries", 30]],
    artifact: /(?=.*\b(?:put|get|object access|boundary table)\b)(?=.*\b(?:private|metadata|cleanup|boundary)\b)/u,
    vocabulary: /\b(?:object|storage|metadata|put|get|cleanup|keys)\b/u,
  },
  testing: {
    templates: [["Drive one behavior from RED to GREEN", 75], ["Strengthen a weak regression test", 30], ["Rehearse boundary and mutation tests", 30]],
    artifact: /(?=.*\btest\b)(?=.*\b(?:failing|failure|mutation|boundary)\b)/u,
    vocabulary: /\b(?:test|tests|red|green|failure|mutation|boundary)\b/u,
  },
  security: {
    templates: [["Enforce session, ownership and secret boundaries", 90], ["Audit one authorization path", 35], ["Separate authentication from authorization", 30]],
    artifact: /(?=.*\b(?:threat model|authorization|identity)\b)(?=.*\b(?:owner-scoped|cross-owner|permission|negative)\b)/u,
    vocabulary: /\b(?:security|session|ownership|authorization|authentication|secret|owner-scoped|negative)\b/u,
  },
  "cloud-delivery": {
    templates: [["Build a reversible delivery runbook", 90], ["Diagnose a failed build or release", 35], ["Rehearse environment and rollback boundaries", 30]],
    artifact: /(?=.*\b(?:build|release|environment)\b)(?=.*\b(?:rollback|recovery|decision)\b)/u,
    vocabulary: /\b(?:delivery|release|build|smoke|rollback|environment)\b/u,
  },
  observability: {
    templates: [["Emit useful telemetry without private data", 60], ["Audit signal quality and redaction", 30], ["Rehearse metrics, logs and traces", 30]],
    artifact: /(?=.*\b(?:event contract|signal)\b)(?=.*\b(?:counters|unsafe|retention|cardinality)\b)/u,
    vocabulary: /\b(?:telemetry|event|signal|redaction|metrics|logs|traces)\b/u,
  },
  "llm-contracts": {
    templates: [["Validate a mocked structured-model boundary", 90], ["Reject malformed model output safely", 35], ["Separate prompt text from output contracts", 30]],
    artifact: /(?=.*\b(?:schema|validation)\b)(?=.*\b(?:provider|model-output|mocked|output)\b)/u,
    vocabulary: /\b(?:model|output|prompt|schema|provider|malformed)\b/u,
  },
  retrieval: {
    templates: [["Rank attributable evidence without fetching", 90], ["Audit provenance, recency and coverage", 35], ["Rehearse source attribution decisions", 30]],
    artifact: /(?=.*\b(?:evidence registry|claim-to-source)\b)(?=.*\b(?:source-quality|attributed|evidence)\b)/u,
    vocabulary: /\b(?:retrieval|evidence|sources?|provenance|recency|attribution|claims?|passages?)\b/u,
  },
  "product-thinking": {
    templates: [["Turn a user outcome into acceptance criteria", 60], ["Defend one scope trade-off", 30], ["Separate outcomes from feature output", 30]],
    artifact: /(?=.*\b(?:product slice|scope|feature)\b)(?=.*\b(?:goals|outcome|hypotheses|decision)\b)/u,
    vocabulary: /\b(?:product|user|outcome|scope|feature|criteria|gates)\b/u,
  },
  "proof-of-work": {
    templates: [["Package a reviewable implementation artifact", 60], ["Assess whether a claim is inspectable", 30], ["Rehearse claim-to-evidence mapping", 30]],
    artifact: /(?=.*\b(?:commit|claim-to-evidence)\b)(?=.*\b(?:reproduction|independent review|unsupported wording|verification)\b)/u,
    vocabulary: /\b(?:artifact|claim|evidence|commit|note|reproduction|verification)\b/u,
  },
};

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function authoredContentTuple(template: UnitTemplate) {
  return [
    template.objective,
    template.whyNow,
    template.buildTask,
    template.proofRequirement,
    template.steps.map(({ label, minutes }) => [label, minutes]),
    template.completionCriteria,
    template.rubric,
  ] as const;
}

function authoredContentDigest(template: UnitTemplate): string {
  return createHash("sha256").update(JSON.stringify(authoredContentTuple(template))).digest("hex");
}

const expectedAuthoredContentDigests: Record<string, string> = {
  "cloud-delivery-calibrate-01": "8f1b994d48d3131c4c3aba2ac4a0d9404b3dbcc960abc19cf7d30871f3237916",
  "cloud-delivery-learn-01": "c4d86ce9875bd9933de0373529036297726b760a10f8944cd9efb8dc7b39b224",
  "cloud-delivery-reinforce-01": "807d50a809f1f8bec1ff65fd744f4f37d49706f9bbd6707f95cee948eadbe0c5",
  "design-systems-calibrate-01": "3c478aa0401183aa02970ef8f26fc596517f06730151e734f946e14b3c627b73",
  "design-systems-learn-01": "01d623158162efcabeaa2d740597dfb0073462b91106b4a2128e7304102b0dd3",
  "design-systems-reinforce-01": "ce53c2c178038d98677bcab1593ef20182e946ae9f6cfabc8aafa93db7760aa0",
  "edge-runtime-calibrate-01": "ab5285eae90c90e4ecba2b54497b24dd17aff8f1f0e5e4ba6fb6b23076e53a94",
  "edge-runtime-learn-01": "f76f782caa3a1354ee0dfa830e1ee803a63ead825b518befa371061229a757fe",
  "edge-runtime-reinforce-01": "902edf0e2bbd64dffa62a5b07ebd548668338b62edeff955a7328ba29dd2bbc4",
  "http-apis-calibrate-01": "a4631fe38437316fd1dd0d67a76a130ea15dcdff7f989346f6e45325f9c84771",
  "http-apis-learn-01": "d3f839d8c82f4ec67efc4fe776a65d047369d7810223eb51ab35796fb184b071",
  "http-apis-reinforce-01": "d674a918fb48dc6cb4e66f545b0c7637f408cf81fddbad0463fd49e8dd5724e2",
  "llm-contracts-calibrate-01": "f1aa46e1b1f9ec9353814d966738135899cce971722affe83b827077a284f3e6",
  "llm-contracts-learn-01": "f87ba57cb76bc1decf0ba1987409b66fd18ab1fc2d8415bcbbaf5c688bf476a1",
  "llm-contracts-reinforce-01": "943004b81c98b264cdbbca65fec663f38922cb3c71fd0be1450bb6aa848dc720",
  "object-storage-calibrate-01": "11ae9ebf1b7ad3b677e5d5762eb88fff9d3e7c57406cdf4e9bec2f61cd9c94c3",
  "object-storage-learn-01": "68c28de6f8e7359e1289d9ea75d03a4236e74c71b9a9ab0bee1f164af63322af",
  "object-storage-reinforce-01": "a478c843ae64b0d7951e366f0c19bd2a62b395c238e61deb4217065db251a5e3",
  "observability-calibrate-01": "930fb778251dbeff8817445126e695b78bce97628088e959151e114b4f8a9b09",
  "observability-learn-01": "95a86725487c4b20af56d9ed61674784026aa367308fa9eecff5a717f3cb11d6",
  "observability-reinforce-01": "1483e074edad8f162b563401a8ae2d7a76cb388d9102121b5553cae2789ff8e6",
  "product-thinking-calibrate-01": "6eec76d9d288633cb8697f39d2d23d83bcb021a241ee7ff34984bf7b72fde7cf",
  "product-thinking-learn-01": "881db36e108c496b7fecd6538a808c642caa788c90e396b3ca1abbc48dbfa818",
  "product-thinking-reinforce-01": "dd40a45f30fccbcc1dcef4a0f87330603c3ed300d21ffbba90d9da355c666c66",
  "proof-of-work-calibrate-01": "fea28a844845f1ab0dc6ca6649e77d743e14a138e4efd63e3ed23ac88cf6ffd3",
  "proof-of-work-learn-01": "068bd67d192978385a847a607d0352938b61419e0127ac59d9c452c4381bcf37",
  "proof-of-work-reinforce-01": "06fa11f45c8eb98d1d5a394989179cf3c64832bf1cb2448223b2b6f23b66c9e6",
  "react-calibrate-01": "949e22c4e2b7ffdb7a7e7e8898c0f2aa0b9189e1dbc5e6dfcd2bbea1acc61376",
  "react-learn-01": "9e3d089008710fd3a62762ff69592f45abfc5af3eb323f18466659c988d53a00",
  "react-reinforce-01": "cc8c8e848adf076f45470e91365a062644694cdc97823558d7749b12023b250c",
  "retrieval-calibrate-01": "7cc196d2def22db1112312896589bf3430775109f76e1011f17988e6836e69fe",
  "retrieval-learn-01": "7e4a4e4d4f465ace9c11bc14c1a89b4798b3ce03e97eac6b7d2db18dc97f43dd",
  "retrieval-reinforce-01": "248c673cccbeb2a0647963d5a2f1af88e7d36f6ac8dc2ba7c49d03b43dff3f56",
  "security-calibrate-01": "83ab3a09908ff1f3d7587ce093adfb079b7644408693db578b1d720c4f061488",
  "security-learn-01": "5cdff281e256029cd066fb61e2e13ff6618082ea0d340057256df9a4aaf68ced",
  "security-reinforce-01": "f57c111d88aa031774feb979c5286802a02fbb39e75f951a35af78a2525fa69c",
  "sql-calibrate-01": "8add0dc6a3fa4e1fc7c0102d2382c2d1a40c0bf19bc994e8476774556f491fd8",
  "sql-learn-01": "761c48b544decc8dda71bf41afbaf5891d094218e05d519d93e2d0bdf5328628",
  "sql-reinforce-01": "bd6eca469132a6e50e6a1206977c2375955f16f2c17d8afc42e1dca8bbb903e8",
  "testing-calibrate-01": "1cba8afcfb0393d1c7275dd7b2a835e4e28f86f889e7a992dfc1ce82114bda04",
  "testing-learn-01": "4abd2c189d691ce951bd61bebf0cfcab7b600fb7f03cdf26685889e9e971d132",
  "testing-reinforce-01": "d3803900ecee7097f903d7d747b66b3f992d1eabefe2cfe7f81f80e717613c1c",
  "typescript-calibrate-01": "5f2fc6e57133dd51c6aff47fa5a371ce088bb2960a92c47b2c1c5185d35f33b8",
  "typescript-learn-01": "93f3656e7c80a5fabaf41176e702c5259df0bb2eaf254064c1bc4b774813fc68",
  "typescript-reinforce-01": "e957da772e4894bfe0b6eae4e34efc2b4692eaae636286b2e88622581a6aa0f5",
  "web-platform-calibrate-01": "1b5b9a615fe1122fe6f598340a9040c0fb2b31c5fb67bfc74e9dae7fed212cc0",
  "web-platform-learn-01": "9526ace338ef2615c69bca7b3fe866c04ca0c928a3b4f25aed6fcec40315ca1f",
  "web-platform-reinforce-01": "39a0085620759c6cddd5434b375a2ef797b1545c7f96f0cbe8913c8fada9323a",
};

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
        expect(normalize(template.buildTask), template.id).toMatch(locked.artifact);
        const proof = normalize(template.proofRequirement);
        expect(proof, template.id).toMatch(/^(?:provide|submit)\b/u);
        expect(proof, template.id).toMatch(
          /\b(?:artifact|document|diagram|schema|types|test\w*|evidence|verification|review|report|record|table|matrix|check\w*|contract|sequence|model|slice|commit|note|diff|trace|output|gate)\b/u,
        );
      }
    }
  });

  it("locks every authored content field to an explicit SHA-256 digest", () => {
    const actual = Object.fromEntries(
      flagshipUnitRegistry.tracks.flatMap((track) =>
        track.templates.map((template) => [template.id, authoredContentDigest(template)]),
      ),
    );
    expect.soft(Object.keys(actual).sort()).toEqual(Object.keys(expectedAuthoredContentDigests).sort());
    expect(actual).toEqual(expectedAuthoredContentDigests);
  });

  it("detects isolated mutations across every authored content category", () => {
    const template = flagshipUnitRegistry.tracks[0]!.templates[0]!;
    const baseline = authoredContentTuple(template);
    const mutations: Array<{
      field: "objective" | "whyNow" | "buildTask" | "steps" | "rubric";
      mutate: (candidate: UnitTemplate) => void;
    }> = [
      { field: "buildTask", mutate: (candidate) => { candidate.buildTask = "Write a generic summary."; } },
      { field: "objective", mutate: (candidate) => { candidate.objective = "Complete the assigned work."; } },
      { field: "whyNow", mutate: (candidate) => { candidate.whyNow = "This matters now."; } },
      { field: "steps", mutate: (candidate) => { candidate.steps[0]!.label = "Summarize unrelated material."; } },
      {
        field: "rubric",
        mutate: (candidate) => {
          candidate.rubric = [
            "Level 1: The form work is incomplete.",
            "Level 2: The form work is complete.",
            "Level 3: The form work is polished.",
          ];
        },
      },
    ];

    let mismatches = 0;
    for (const mutation of mutations) {
      const candidate = structuredClone(template);
      mutation.mutate(candidate);
      const changedFields = ["objective", "whyNow", "buildTask", "proofRequirement", "steps", "completionCriteria", "rubric"]
        .filter((_, index) => JSON.stringify(authoredContentTuple(candidate)[index]) !== JSON.stringify(baseline[index]));
      expect(changedFields, mutation.field).toEqual([mutation.field]);
      expect(candidate.proofRequirement, mutation.field).toBe(template.proofRequirement);
      if (authoredContentDigest(candidate) !== expectedAuthoredContentDigests[template.id]) mismatches += 1;
    }
    expect(mismatches).toBe(5);
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
