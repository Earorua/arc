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

describe("role intelligence contracts", () => {
  it("accepts a fully attributed learning resource", () => {
    expect(learningResourceSchema.parse(resource)).toEqual(resource);
  });

  it("rejects unknown fields and non-HTTPS sources", () => {
    expect(() => learningResourceSchema.parse({
      ...resource,
      url: "http://example.com/docs",
      secret: "must-not-pass",
    })).toThrow();
  });

  it("requires skills, resources, phases and an explicit version", () => {
    expect(() => roleBlueprintSchema.parse({
      id: "empty-role",
      name: "Empty role",
      summary: "Not publishable",
      version: "2026.08.1",
      status: "ready",
      updatedAt: "2026-08-10",
      languagePolicy: "english-first",
      skills: [],
      resources: [],
      phases: [],
    })).toThrow();
  });
});
