import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isRepoRoot(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
    fs.existsSync(path.join(dir, "projects"))
  );
}

/** Monorepo root — walks up from cwd so Next.js (apps/web) resolves correctly. */
export function getRepoRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (isRepoRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const fromModule = path.resolve(__dirname, "..", "..", "..");
  if (isRepoRoot(fromModule)) return fromModule;

  return fromModule;
}

export function getProjectsRoot(): string {
  return path.join(getRepoRoot(), "projects");
}

/** Local Playwright browser cache (repo-relative, survives npm updates). */
export function getPlaywrightBrowsersPath(): string {
  return path.join(getRepoRoot(), ".playwright-browsers");
}

export function ensurePlaywrightBrowsersEnv(): void {
  process.env.PLAYWRIGHT_BROWSERS_PATH = getPlaywrightBrowsersPath();
}

export function getProjectDir(projectId: string): string {
  return path.join(getProjectsRoot(), projectId);
}

export function getProjectPaths(projectId: string) {
  const dir = getProjectDir(projectId);
  return {
    dir,
    metaJson: path.join(dir, "meta.json"),
    projectJson: path.join(dir, "project.json"),
    definitionJson: path.join(dir, "Definition.json"),
    dataJson: path.join(dir, "Data.json"),
    datasetsDir: path.join(dir, "datasets"),
    exploreRunsJson: path.join(dir, "explore-runs.json"),
    interviewQueueJson: path.join(dir, "interview-queue.json"),
    runCache: path.join(dir, "run-cache"),
    exploreCache: path.join(dir, "explore-cache"),
  };
}
