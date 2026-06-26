import type { Page } from "playwright";
import {
  classifyCurrentQuestion,
  extractNvQuestionLabel,
  type ClassifiedQuestion,
} from "./question-classifier.js";

export interface WaitForQuestionOptions {
  timeoutMs?: number;
  log?: (message: string) => void;
  shouldAbort?: () => boolean;
}

/** True when NV has rendered the question form (not just the nav chrome). */
async function hasNvAnswerSurface(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const qlabel = document.querySelector(
      'input[name="QLABEL"]',
    ) as HTMLInputElement | null;
    if (!qlabel?.value?.trim()) return false;

    const surfaces = [
      'input[name="IDINT"]',
      'table#example input',
      'table#example select',
      'table#example textarea',
      'form#form input[type="radio"]',
      'form#form input[type="RADIO"]',
      'form#form input[type="checkbox"]',
      'form#form select',
      'form#form textarea',
      '[id^="livespell__input"]',
      ".funkyradio input",
      "#answers input",
      "#answers select",
      "form#form div[data-value].tile",
      "form#form div.thumbnail[data-value]",
    ];

    return surfaces.some((sel) => document.querySelector(sel));
  });
}

/**
 * Poll until NV finishes rendering the current question (QLABEL + answer UI).
 * NV test/live pages often paint Back/Next before the form body is ready.
 */
export async function waitForNvQuestionReady(
  page: Page,
  options: WaitForQuestionOptions = {},
): Promise<ClassifiedQuestion | null> {
  const { timeoutMs = 45_000, log } = options;
  const start = Date.now();
  let lastHeartbeat = start;

  log?.("Waiting for question to load…");

  while (Date.now() - start < timeoutMs) {
    if (options.shouldAbort?.()) {
      log?.("Explore stopped — aborting wait");
      return null;
    }

    const surfaceReady = await hasNvAnswerSurface(page);
    if (surfaceReady) {
      const label = await extractNvQuestionLabel(page);
      if (label) {
        await page.waitForTimeout(600);
        const classified = await classifyCurrentQuestion(page);
        if (classified) {
          log?.(`Question ready: ${classified.name} (${classified.type})`);
          return classified;
        }
        log?.(`Question shell ready (${label}), finishing detection…`);
      }
    }

    const elapsed = Date.now() - start;
    if (elapsed - lastHeartbeat >= 5000) {
      lastHeartbeat = Date.now();
      log?.(`Still waiting for question UI (${Math.round(elapsed / 1000)}s)…`);
    }

    await page.waitForTimeout(350);
  }

  log?.("Timed out waiting for question to load");
  return null;
}

/** After Next, wait until QLABEL / classified name changes from the previous question. */
export async function waitForNvQuestionChange(
  page: Page,
  previousName: string,
  options: WaitForQuestionOptions = {},
): Promise<ClassifiedQuestion | null> {
  const { timeoutMs = 30_000, log } = options;
  const start = Date.now();
  const prev = previousName.toUpperCase();

  log?.("Waiting for next question…");

  while (Date.now() - start < timeoutMs) {
    if (options.shouldAbort?.()) {
      log?.("Explore stopped — aborting wait");
      return null;
    }

    const label = await extractNvQuestionLabel(page);
    if (label && label !== prev) {
      return waitForNvQuestionReady(page, {
        timeoutMs: Math.max(5000, timeoutMs - (Date.now() - start)),
        log,
        shouldAbort: options.shouldAbort,
      });
    }

    await page.waitForTimeout(350);
  }

  const label = await extractNvQuestionLabel(page);
  if (label && label !== prev) {
    return waitForNvQuestionReady(page, {
      timeoutMs: 5000,
      log,
      shouldAbort: options.shouldAbort,
    });
  }

  return null;
}
