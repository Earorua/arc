import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const routes = [
  "app/api/planning/workspace/route.ts",
  "app/api/planning/generate/route.ts",
  "app/api/planning/events/route.ts",
  "app/api/planning/replans/accept/route.ts",
  "app/api/planning/replans/discard/route.ts",
];

describe("planning production routes", () => {
  it.each(routes)("wires %s as a dynamic route without network/model imports", async (path) => {
    const source = await readFile(path, "utf8");
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toMatch(/productionPlanningRouteDependencies/u);
    expect(source).not.toMatch(/OpenRouter|fetch\s*\(/u);
  });
});
