import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot() {
  let dir = process.cwd();
  while (true) {
    if (
      fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
      fs.existsSync(path.join(dir, "projects"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function chromiumInstalled(browsersPath) {
  if (!fs.existsSync(browsersPath)) return false;
  return fs
    .readdirSync(browsersPath)
    .some((name) => name.startsWith("chromium"));
}

const root = findRepoRoot();
const browsersPath = path.join(root, ".playwright-browsers");

if (chromiumInstalled(browsersPath)) {
  process.exit(0);
}

console.log("Playwright Chromium not found — installing to .playwright-browsers …");
process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

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
