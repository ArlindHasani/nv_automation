import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo root (packages/core/src -> ../../..) */
export function getRepoRoot(): string {
  return path.resolve(__dirname, "..", "..", "..");
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
    exploreCache: path.join(dir, "explore-cache"),
  };
}
