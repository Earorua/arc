import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Deliberately independent of the ordinary test configuration and its includes.
export default defineConfig({
  resolve: { alias: { "cloudflare:workers": fileURLToPath(new URL("./tests/mocks/cloudflare-workers.ts", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/qualification/document-model.qualification.ts"],
    fileParallelism: false, maxWorkers: 1, retry: 0,
    testTimeout: 240_000, hookTimeout: 30_000,
  },
});
