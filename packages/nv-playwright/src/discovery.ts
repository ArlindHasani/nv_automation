import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Page, type Request } from "playwright";
import { NV_API_PATTERNS, NV_SELECTORS } from "./selectors.js";
import { classifyCurrentQuestion } from "./question-classifier.js";
import { findFirstVisible } from "./question-classifier.js";

export interface DiscoveryResult {
  url: string;
  timestamp: string;
  loginFields: Record<string, boolean>;
  networkEndpoints: string[];
  sampleQuestions: Array<{
    name: string;
    type: string;
    codes: string[];
  }>;
  screenshots: string[];
}

export interface DiscoveryOptions {
  url: string;
  outputDir: string;
  headless?: boolean;
  maxQuestions?: number;
}

export async function runDiscovery(
  options: DiscoveryOptions,
): Promise<DiscoveryResult> {
  const { url, outputDir, headless = false, maxQuestions = 5 } = options;
  await fs.mkdir(outputDir, { recursive: true });

  const networkEndpoints = new Set<string>();
  const screenshots: string[] = [];
  const sampleQuestions: DiscoveryResult["sampleQuestions"] = [];

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("request", (req: Request) => {
    const u = req.url();
    if (NV_API_PATTERNS.some((p) => p.test(u))) {
      networkEndpoints.add(u.split("?")[0]);
    }
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  const loginShot = path.join(outputDir, "01-login.png");
  await page.screenshot({ path: loginShot, fullPage: true });
  screenshots.push(loginShot);

  const loginFields: Record<string, boolean> = {};
  for (const [field, selectors] of Object.entries(NV_SELECTORS.login)) {
    if (field === "submit") continue;
    const loc = await findFirstVisible(page, selectors);
    loginFields[field] = loc !== null;
  }

  let questionsFound = 0;
  while (questionsFound < maxQuestions) {
    const classified = await classifyCurrentQuestion(page);
    if (!classified || classified.name === "UNKNOWN") break;

    sampleQuestions.push({
      name: classified.name,
      type: classified.type,
      codes: classified.codes,
    });

    const qShot = path.join(
      outputDir,
      `question-${questionsFound + 1}-${classified.name}.png`,
    );
    await page.screenshot({ path: qShot, fullPage: true });
    screenshots.push(qShot);
    questionsFound++;

    const next = await findFirstVisible(page, NV_SELECTORS.interview.nextButton);
    if (!next) break;

    const prevName = classified.name;
    await next.click();
    await page.waitForTimeout(1500);

    const after = await classifyCurrentQuestion(page);
    if (after?.name === prevName) break;
  }

  const result: DiscoveryResult = {
    url,
    timestamp: new Date().toISOString(),
    loginFields,
    networkEndpoints: [...networkEndpoints],
    sampleQuestions,
    screenshots,
  };

  await fs.writeFile(
    path.join(outputDir, "discovery.json"),
    JSON.stringify(result, null, 2),
  );

  await browser.close();
  return result;
}
