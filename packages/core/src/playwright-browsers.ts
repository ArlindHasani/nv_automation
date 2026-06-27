import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  ensurePlaywrightBrowsersEnv,
  getPlaywrightBrowsersPath,
  getRepoRoot,
} from "./paths.js";

const EXECUTABLE_NAMES = new Set([
  "chrome-headless-shell.exe",
  "chrome-headless-shell",
  "chrome.exe",
  "chrome",
]);

function findExecutableInDir(dir: string): string | undefined {
  if (!fs.existsSync(dir)) return undefined;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && EXECUTABLE_NAMES.has(entry.name)) {
      return full;
    }
    if (entry.isDirectory()) {
      const nested = findExecutableInDir(full);
      if (nested) return nested;
    }
  }

  return undefined;
}

function findBrowserDir(browsersPath: string, headless: boolean): string | undefined {
  if (!fs.existsSync(browsersPath)) return undefined;

  const entries = fs
    .readdirSync(browsersPath)
    .filter((name) => name.startsWith("chromium"));

  const preferred = headless
    ? entries.find((name) => name.startsWith("chromium_headless_shell"))
    : entries.find((name) => name.startsWith("chromium-"));

  if (preferred) return path.join(browsersPath, preferred);

  const fallback = entries[0];
  return fallback ? path.join(browsersPath, fallback) : undefined;
}

export function findChromiumExecutable(headless = true): string | undefined {
  const browsersPath = getPlaywrightBrowsersPath();
  const browserDir = findBrowserDir(browsersPath, headless);
  if (!browserDir) return undefined;
  return findExecutableInDir(browserDir);
}

export function isPlaywrightChromiumInstalled(): boolean {
  ensurePlaywrightBrowsersEnv();
  return Boolean(findChromiumExecutable(true));
}

/** Launch options that always target the repo-local `.playwright-browsers` cache. */
export function getChromiumLaunchOptions(headless = true): {
  headless: boolean;
  executablePath: string;
} {
  ensurePlaywrightBrowsersEnv();
  const executablePath = findChromiumExecutable(headless);
  if (!executablePath) {
    throw new Error(
      "Playwright Chromium is not installed. Run `npm run dev` or `npm run playwright:install`, then retry explore.",
    );
  }
  return { headless, executablePath };
}

/** Download Chromium into `.playwright-browsers` when missing. */
export async function ensurePlaywrightChromiumInstalled(
  log: (message: string) => void = console.log,
): Promise<void> {
  ensurePlaywrightBrowsersEnv();
  if (isPlaywrightChromiumInstalled()) return;

  log("Playwright Chromium not found — installing to .playwright-browsers …");
  const root = getRepoRoot();
  const browsersPath = getPlaywrightBrowsersPath();

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("npx", ["playwright", "install", "chromium"], {
      cwd: path.join(root, "packages", "nv-playwright"),
      shell: true,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
      stdio: "inherit",
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`playwright install exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}
