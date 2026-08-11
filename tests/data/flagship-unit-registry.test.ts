import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { unitRegistrySchema, type UnitTemplate } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { validateUnitRegistry } from "../../app/lib/planning/registry-validation";

type LockedTrack = {
  templates: [[string, number], [string, number], [string, number]];
  artifact: string;
  vocabulary: RegExp;
};

const lockedMatrix: Record<string, LockedTrack> = {
  "web-platform": {
    templates: [["Trace a browser interaction end to end", 75], ["Explain the browser-runtime boundary", 30], ["Rebuild semantic HTML and event flow", 30]],
    artifact: "accessible form with a documented request/event trace",
    vocabulary: /\b(?:browser|dom|form|event|request)\b/u,
  },
  typescript: {
    templates: [["Model one UI-to-API contract", 90], ["Repair an unsafe typed boundary", 35], ["Practice unions, narrowing and inference", 30]],
    artifact: "strict schema plus inferred request/result types",
    vocabulary: /\b(?:typescript|schema|types?|unions?|result|narrow\w*|infer\w*)\b/u,
  },
  react: {
    templates: [["Build an accessible async React flow", 90], ["Diagnose state ownership and rendering", 35], ["Rehearse state, events and effects", 30]],
    artifact: "tested form with loading, success, and recovery states",
    vocabulary: /\b(?:react|state|render|effect|event|form|loading|success|recovery)\b/u,
  },
  "design-systems": {
    templates: [["Author a keyboard-safe component state model", 75], ["Audit semantics, focus and contrast", 30], ["Rebuild focus and error relationships", 30]],
    artifact: "reusable component with visible focus and state text",
    vocabulary: /\b(?:component|keyboard|focus|contrast|semantics|error)\b/u,
  },
  "http-apis": {
    templates: [["Design a typed idempotent write endpoint", 75], ["Review an HTTP failure contract", 30], ["Rehearse methods, status and retry semantics", 30]],
    artifact: "request/response contract with safe error cases",
    vocabulary: /\b(?:http|endpoint|request|response|status|retry|success|failure|methods?)\b/u,
  },
  "edge-runtime": {
    templates: [["Ship a Worker-compatible route boundary", 90], ["Explain edge constraints and bindings", 35], ["Rebuild the isolate execution model", 30]],
    artifact: "edge handler with injected bindings and no node-only leak",
    vocabulary: /\b(?:edge|worker|isolate|binding|bindings|handler|route|runtime|isolation|node-only)\b/u,
  },
  sql: {
    templates: [["Model immutable versions and relations", 90], ["Review keys, cardinality and delete actions", 35], ["Rehearse joins and integrity constraints", 30]],
    artifact: "additive relational schema with ownership boundaries",
    vocabulary: /\b(?:sql|schema|relations?|relational|keys?|joins?|constraints?)\b/u,
  },
  "object-storage": {
    templates: [["Design private object metadata and compensation", 60], ["Threat-model an object access path", 30], ["Rehearse database-versus-object boundaries", 30]],
    artifact: "put/get/cleanup sequence with private object keys",
    vocabulary: /\b(?:object|storage|metadata|put|get|cleanup|keys)\b/u,
  },
  testing: {
    templates: [["Drive one behavior from RED to GREEN", 75], ["Strengthen a weak regression test", 30], ["Rehearse boundary and mutation tests", 30]],
    artifact: "focused test proving a meaningful failure before implementation",
    vocabulary: /\b(?:test|tests|red|green|failure|mutation|boundary)\b/u,
  },
  security: {
    templates: [["Enforce session, ownership and secret boundaries", 90], ["Audit one authorization path", 35], ["Separate authentication from authorization", 30]],
    artifact: "threat model plus owner-scoped negative tests",
    vocabulary: /\b(?:security|session|ownership|authorization|authentication|secret|owner-scoped|negative)\b/u,
  },
  "cloud-delivery": {
    templates: [["Build a reversible delivery runbook", 90], ["Diagnose a failed build or release", 35], ["Rehearse environment and rollback boundaries", 30]],
    artifact: "build, smoke-check, and rollback checklist",
    vocabulary: /\b(?:delivery|release|build|smoke|rollback|environment)\b/u,
  },
  observability: {
    templates: [["Emit useful telemetry without private data", 60], ["Audit signal quality and redaction", 30], ["Rehearse metrics, logs and traces", 30]],
    artifact: "structured event contract with allowed counters only",
    vocabulary: /\b(?:telemetry|event|signal|redaction|metrics|logs|traces)\b/u,
  },
  "llm-contracts": {
    templates: [["Validate a mocked structured-model boundary", 90], ["Reject malformed model output safely", 35], ["Separate prompt text from output contracts", 30]],
    artifact: "provider-independent schema gate with malformed fixtures",
    vocabulary: /\b(?:model|output|prompt|schema|provider|malformed)\b/u,
  },
  retrieval: {
    templates: [["Rank attributable evidence without fetching", 90], ["Audit provenance, recency and coverage", 35], ["Rehearse source attribution decisions", 30]],
    artifact: "evidence registry with explicit source-quality rationale",
    vocabulary: /\b(?:retrieval|evidence|sources?|provenance|recency|attribution|claims?|passages?)\b/u,
  },
  "product-thinking": {
    templates: [["Turn a user outcome into acceptance criteria", 60], ["Defend one scope trade-off", 30], ["Separate outcomes from feature output", 30]],
    artifact: "one-page product slice with goals, non-goals, and gates",
    vocabulary: /\b(?:product|user|outcome|scope|feature|criteria|gates)\b/u,
  },
  "proof-of-work": {
    templates: [["Package a reviewable implementation artifact", 60], ["Assess whether a claim is inspectable", 30], ["Rehearse claim-to-evidence mapping", 30]],
    artifact: "commit or note with reproduction and verification evidence",
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
  "cloud-delivery-calibrate-01": "c4f4d9815318e80a4dcbe7c8cf35625f3c26694cbe002cbefaf8b14d85423f18",
  "cloud-delivery-learn-01": "838c6b11faee8075b9a74b765b4c1722b58f22906ce47ba06ea7b986483e8920",
  "cloud-delivery-reinforce-01": "fd829e86e8b532cb5687772ad7720d3690f55e7bb44b99460995746e9b01994c",
  "design-systems-calibrate-01": "1e7f70a4285a08d37b6872170fd4d0177e47afe5573a489bc84eef697b4bbf63",
  "design-systems-learn-01": "068ba4158942c86e60f4864f849e09791b2cfe6d0e98b5789b697ae4a44c9cec",
  "design-systems-reinforce-01": "d1179db12151c7cfbc05ca37510be694ec4e25ffdd0b257f1a1627fa50caf28c",
  "edge-runtime-calibrate-01": "b43bbe34dd52e616c788717f8fcca2b5c2a039dbd29c57eaa6fc70171a90c64b",
  "edge-runtime-learn-01": "99f4ec44186daf96e4d5bfcd4aa21a4ecde2a3043a036a505ec708f6b5ad3d25",
  "edge-runtime-reinforce-01": "8a271e525c3308eadf36251912bc91ea69b17e93b9b70bb83251e83ce639e886",
  "http-apis-calibrate-01": "7f0085b8b19c57254c23f932c2d1c408e83a3bf5a2457efab0d127e6134a1005",
  "http-apis-learn-01": "acc974d7747558a4b66372eeca1710c6457acb38b26e93ede2ca3717428106a8",
  "http-apis-reinforce-01": "80fc234005bd67785e87b15f71304dbd094a33bbe852b941aefd56faf0705860",
  "llm-contracts-calibrate-01": "83a0dd01bb4a354b901a83ae1f2005cc40a0e7e9b344e3decbaf3ddab8983f7d",
  "llm-contracts-learn-01": "ecd1d530a9b401d962d34e3a7a6c3a9dd9dd9d49cd853917cb032e29af7266a6",
  "llm-contracts-reinforce-01": "51385b5e1c37e667f13c9aab2e426b963bca0826ac2520413b6bf4f5d2f9968b",
  "object-storage-calibrate-01": "ac8bba7bc0abc8c2899304eec51d917ab945dfe578237f91549de7edb356ab4c",
  "object-storage-learn-01": "5fee154fe89cb2643f60b82c12486a08984b7dd62140dfdec3ce54cfab72fb76",
  "object-storage-reinforce-01": "5c4532277d5bebafc1e7146b3e7d7f36d350f9114c422a4bf6aaa260fc2c0175",
  "observability-calibrate-01": "2697578bbc7fcf92f1aacfc609d7e7a61e613999181f02fedf933db8637203a7",
  "observability-learn-01": "88c218dc035bf2b3b14dc7e9b4c10e972355908120c2625b91b6683fb446e700",
  "observability-reinforce-01": "e52287ff29c1087900a2a9582cdb0a0dd807e27e55c7ccf05fb1690b5a0d6038",
  "product-thinking-calibrate-01": "a0ed298bc5a3e6714306717140b9dfdd74be714622b5634fbda1d961d1ed366a",
  "product-thinking-learn-01": "7af4dfe1817f7eac0af186673f7200862f88c77afcf8dfcf4f3229f16e28b533",
  "product-thinking-reinforce-01": "1b018186370ebe3294abba75eed86da9d9413d4b74a42f9a9df7d20c50a058db",
  "proof-of-work-calibrate-01": "dd52643f2f2822d71af4ed2afba290b06122941bbd03a0bf985711f53991c65b",
  "proof-of-work-learn-01": "cbbcd1d85a83f6e283ed4dda1af88b5ef4d9c8f1f982244666023ca4a30670de",
  "proof-of-work-reinforce-01": "efd24cddf70bc804557108c64e481ad892a4a55547845f346ee14e2d8efc33ad",
  "react-calibrate-01": "7b08b1923d64f363c7c33ce05b3b86933062a255b8a06877dd5318f9cd08fde3",
  "react-learn-01": "0eb9824b31f7daba77fb7d05979e1aa967eaa62298b0788b9db04a9dfd7d477c",
  "react-reinforce-01": "cc6ab9a6dfdce01f56c4ad5f9d19338081c832e6d66c71e8fec4c305b15084d6",
  "retrieval-calibrate-01": "58e54eb4778304664f8655a12b3c1894d9f40766df85a091e8163bc0187ce5f4",
  "retrieval-learn-01": "66b8b6d37b4c82839ad9fdc291f18b4267630b39738295f66e06b622c496a035",
  "retrieval-reinforce-01": "2018b4bd558bc6acab93cdf6ff32eecf77b91a6828cc4559b5f2292ad40ea309",
  "security-calibrate-01": "f1142b3e1a9a80d5d35dadd48a5e9bda607df223a2ba7f92b3abfdaadd73ee0d",
  "security-learn-01": "feb3c9e732cf59fbcad5a56b910e2414e9ccbb8de5402db01bedb3a79c7b23a1",
  "security-reinforce-01": "ce0a6bb41be3c2c6e227489fd4fe82259343ae53d1de31702edfe117ef185858",
  "sql-calibrate-01": "5a78f0d8fa2348fabf775b372a6cb2de58d8599b40509cd6f75b7e83eb4e9a98",
  "sql-learn-01": "dec28d8db63c42430bd087f8080611d5cf0c604010fcf36f285db6090ea1bb70",
  "sql-reinforce-01": "85cf8bb67ca9e545fed17565814e11695f826839f4bd7d7159f3eec45bba49b3",
  "testing-calibrate-01": "f40cd2f9f3ae3eb38c55202fe39af00f7004a16c2534738fafe8948be2bf913b",
  "testing-learn-01": "bfc1aaf1d5300e9fd3a3b216415f6058b144b9a21c6947fe14e5f840db0769e9",
  "testing-reinforce-01": "d44bc42cb79420d427d7d7d74cee22939bc756a94a27ce53afd08151b34df4aa",
  "typescript-calibrate-01": "9b4a2eef89f1720dfa5f881109578be487eeea96571e3a5ad26913cf898c084f",
  "typescript-learn-01": "596b0c0f326f7c8e7e48d9d028d8776c27d1c3631fe5b9f8369010fedbe88ea9",
  "typescript-reinforce-01": "f6e41d14aa10bc9a8021b1956a5a4439789d10e39357b475fdfc115b0010a190",
  "web-platform-calibrate-01": "c4370953b82df41c0498887796607f85f3b1c9c5fc1f33767acb9c90e5090ca4",
  "web-platform-learn-01": "ac006e39bf572f8f372c8b4016be35ae71c94eab2077a8303d55bdc1a8b7d82e",
  "web-platform-reinforce-01": "c54fd802a17c39e9c8fdfb8d1f80e1b7dcb5bf9bfc4c9bfde6e29210f80ecf0a",
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
        expect(normalize(template.buildTask), template.id).toContain(normalize(locked.artifact));
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

  it("rejects weaker React, Security, and Cloud Delivery build tasks even when proof remains intact", () => {
    const cases = [
      { skillId: "react", templateId: "react-calibrate-01", weak: "Review a component tree, remove one derived-state effect, and record the event-to-render path." },
      { skillId: "security", templateId: "security-calibrate-01", weak: "Audit an authorization path and repair its highest-risk gap." },
      { skillId: "cloud-delivery", templateId: "cloud-delivery-calibrate-01", weak: "Analyze a failed release record and produce an evidence-backed recovery decision." },
    ];
    for (const fixture of cases) {
      const template = flagshipUnitRegistry.tracks
        .find((track) => track.skillId === fixture.skillId)!.templates
        .find((candidate) => candidate.id === fixture.templateId)!;
      const candidate = structuredClone(template);
      candidate.buildTask = fixture.weak;
      expect(candidate.proofRequirement).toBe(template.proofRequirement);
      expect(normalize(candidate.buildTask)).not.toContain(normalize(lockedMatrix[fixture.skillId]!.artifact));
      expect(authoredContentDigest(candidate)).not.toBe(expectedAuthoredContentDigests[fixture.templateId]);
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
