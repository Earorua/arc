import { describe, expect, it } from "vitest";
import {
  calendarDateSchema,
  learningResourceSchema,
  publicHttpsUrlSchema,
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
  it("exports the shared calendar-date and public-HTTPS primitives", () => {
    expect(calendarDateSchema.parse("2028-02-29")).toBe("2028-02-29");
    expect(calendarDateSchema.parse("0001-01-01")).toBe("0001-01-01");
    expect(calendarDateSchema.parse("2000-02-29")).toBe("2000-02-29");
    expect(() => calendarDateSchema.parse("0000-01-01")).toThrow();
    expect(publicHttpsUrlSchema.parse(resource.url)).toBe(resource.url);
  });

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

  it.each([
    "2026-02-30",
    "2026-99-99",
    "2025-02-29",
  ])("rejects the impossible calendar date %s", (date) => {
    expect(() => learningResourceSchema.parse({
      ...resource,
      lastVerifiedAt: date,
    })).toThrow();
    expect(() => roleBlueprintSchema.parse({
      ...blueprint,
      updatedAt: date,
    })).toThrow();
  });

  it.each([
    "https://user:password@example.com/docs",
    "https://localhost/docs",
    "https://api.localhost/docs",
    "https://local/docs",
    "https://service.local/docs",
    "https://127.0.0.1/docs",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/docs",
    "https://10.0.0.1/docs",
    "https://intranet/docs",
    "https://metadata/latest",
    "https://metadata.google.internal/",
    "https://example.test/docs",
    "https://example.invalid/docs",
    "https://service.example/docs",
    "https://router.home.arpa/",
  ])("rejects the non-public learning resource URL %s", (url) => {
    expect(() => learningResourceSchema.parse({ ...resource, url })).toThrow();
  });

  it.each([
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    "https://developer.mozilla.org/zh-CN/docs/Web/JavaScript",
    "https://learn.microsoft.com/en-us/training/",
  ])("accepts the public international learning resource URL %s", (url) => {
    expect(learningResourceSchema.parse({ ...resource, url }).url).toBe(url);
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
