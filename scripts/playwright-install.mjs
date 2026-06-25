import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, ".playwright-browsers");

const result = spawnSync(
  "npx",
  ["playwright", "install", "chromium"],
  {
    cwd: path.join(root, "packages", "nv-playwright"),
    shell: true,
    stdio: "inherit",
    env: process.env,
  },
);

process.exit(result.status ?? 1);
