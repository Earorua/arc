import { describe, expect, it } from "vitest";
import {
  learningResourceSchema,
  roleBlueprintSchema,
} from "../../app/contracts/intelligence";

const resource = {
  id: "typescript-official",
  title: "TypeScript documentation",
  url: "https://www.typescriptlang.org/docs/",
  provider: "typescriptlang.org",
  language: "en",
  cost: "free",
  format: "documentation",
  sourceTier: "primary",
  purpose: "primary",
  estimatedMinutes: null,
  lastVerifiedAt: "2026-07-26",
  skillIds: ["typescript"],
};

const skill = {
  id: "typescript",
  name: "TypeScript",
  category: "foundations",
  importance: "core",
  why: "Builds reliable and maintainable application code.",
  confidence: 0.9,
  masteryCriteria: [
    "Use TypeScript types to model application data.",
    "Configure compiler options for a production project.",
  ],
  prerequisiteIds: [],
  resourceIds: [resource.id],
};

const phase = {
  id: "typescript-foundations",
  name: "TypeScript foundations",
  weeks: 2,
  outcome: "Build typed application features with confidence.",
  skillIds: [skill.id],
};

const blueprint = {
  id: "typescript-engineer",
  name: "TypeScript engineer",
  summary: "A practical roadmap for building typed web applications.",
  version: "2026.08.1",
  status: "ready",
  updatedAt: "2026-08-10",
  languagePolicy: "english-first",
  skills: [skill],
  resources: [resource],
  phases: [phase],
};

describe("role intelligence contracts", () => {
  it("accepts a fully attributed learning resource", () => {
    expect(learningResourceSchema.parse(resource)).toEqual(resource);
  });

  it("rejects unknown fields", () => {
    expect(() => learningResourceSchema.parse({
      ...resource,
      secret: "must-not-pass",
    })).toThrow();
  });

  it("rejects non-HTTPS sources", () => {
    expect(() => learningResourceSchema.parse({
      ...resource,
      url: "http://example.com/docs",
    })).toThrow();
  });

  it.each(["skills", "resources", "phases"] as const)(
    "requires at least one %s entry",
    (collection) => {
      expect(() => roleBlueprintSchema.parse({
        ...blueprint,
        [collection]: [],
      })).toThrow();
    },
  );
});
