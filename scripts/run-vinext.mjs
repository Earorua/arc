import { spawnSync } from "node:child_process";
import { join } from "node:path";

const action = process.argv[2];
const supportedActions = new Set(["dev", "build", "start"]);

if (!supportedActions.has(action)) {
  console.error("Expected one of: dev, build, start.");
  process.exit(1);
}

const executable = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vinext.cmd" : "vinext",
);

const result = spawnSync(executable, [action], {
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
