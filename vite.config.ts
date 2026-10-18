import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import { createCloudflareConfig, loadCloudflareTarget } from "./build/cloudflare-target";

const clientSafeAuthEnvironment: Plugin = {
  name: "arc-client-safe-auth-environment",
  enforce: "pre",
  applyToEnvironment: (environment) => environment.name === "client",
  resolveId(source) {
    return source === "@better-auth/core/env" ? "\0arc-client-safe-auth-environment" : null;
  },
  load(id) {
    if (id !== "\0arc-client-safe-auth-environment") return null;
    return "export const env = new Proxy(Object.create(null), { get: () => undefined });";
  },
};

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const target = await loadCloudflareTarget({ targetPath: process.env.ARC_CLOUDFLARE_TARGET });

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      clientSafeAuthEnvironment,
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        remoteBindings: false,
        config: createCloudflareConfig(target),
      }),
    ],
  };
});
