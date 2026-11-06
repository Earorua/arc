import { defineConfig } from "vitest/config";
import qualification from "./vitest.materials-qualification.config";

// Explicit entry only. Both the normal test glob and the full B2 config exclude this file.
export default defineConfig({
  resolve: qualification.resolve,
  test: { environment: "node", include: ["tests/qualification/document-model.diagnostic-pilot.ts"],
    fileParallelism: false, maxWorkers: 1, retry: 0, hookTimeout: 30_000 },
});
