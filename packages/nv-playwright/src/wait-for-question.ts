import type { Page } from "playwright";
import {
  classifyCurrentQuestion,
  extractNvQuestionLabel,
  type ClassifiedQuestion,
} from "./question-classifier.js";

export interface WaitForQuestionOptions {
  timeoutMs?: number;
  /** Extra settle after answer surface appears before classify (default 250). */
  settleMs?: number;
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
 * Multi/Grid screens wait until option/row counts stabilize — early classify can
 * miss piped brand rows and leave them unanswered at Next.
 */
export async function waitForNvQuestionReady(
  page: Page,
  options: WaitForQuestionOptions = {},
): Promise<ClassifiedQuestion | null> {
  const { timeoutMs = 45_000, log } = options;
  const settleMs = options.settleMs ?? 250;
  const start = Date.now();
  let lastHeartbeat = start;
  let previousFingerprint = "";
  let stableSince = 0;
  const stabilityMs = 450;

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
        const classified = await classifyCurrentQuestion(page);
        if (classified) {
          const fingerprint = questionFingerprint(classified);
          const now = Date.now();
          if (fingerprint !== previousFingerprint) {
            previousFingerprint = fingerprint;
            stableSince = now;
          } else if (
            classified.type !== "Multi" &&
            classified.type !== "Grid"
          ) {
            if (settleMs > 0) await page.waitForTimeout(settleMs);
            log?.(`Question ready: ${classified.name} (${classified.type})`);
            return classified;
          } else if (now - stableSince >= stabilityMs) {
            // Extra settle so NV can finish funky/label paint after DOM stabilizes.
            const extra = Math.max(settleMs, 350);
            if (extra > 0) await page.waitForTimeout(extra);
            log?.(`Question ready: ${classified.name} (${classified.type})`);
            return classified;
          }
        } else {
          log?.(`Question shell ready (${label}), finishing detection…`);
        }
      }
    }

    const elapsed = Date.now() - start;
    if (elapsed - lastHeartbeat >= 5000) {
      lastHeartbeat = Date.now();
      log?.(`Still waiting for question UI (${Math.round(elapsed / 1000)}s)…`);
    }

    await page.waitForTimeout(150);
  }

  log?.("Timed out waiting for question to load");
  return null;
}

function questionFingerprint(classified: ClassifiedQuestion): string {
  if (classified.type === "Grid") {
    const stmts = (classified.gridStatements ?? [])
      .map((s) => s.name)
      .join(",");
    return `grid:${classified.name}:${stmts}:${classified.codes.length}`;
  }
  if (classified.type === "Multi") {
    return `multi:${classified.name}:${classified.codes.join(",")}`;
  }
  return `${classified.type}:${classified.name}:${classified.codes.length}`;
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
        timeoutMs: Math.max(4000, timeoutMs - (Date.now() - start)),
        settleMs: options.settleMs ?? 200,
        log,
        shouldAbort: options.shouldAbort,
      });
    }

    await page.waitForTimeout(200);
  }

  const label = await extractNvQuestionLabel(page);
  if (label && label !== prev) {
    return waitForNvQuestionReady(page, {
      timeoutMs: 4000,
      settleMs: options.settleMs ?? 200,
      log,
      shouldAbort: options.shouldAbort,
    });
  }

  return null;
}
