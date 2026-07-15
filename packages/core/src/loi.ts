import type { Question, QuestionType } from "./schemas.js";

const TYPE_WEIGHTS: Record<QuestionType, number> = {
  Open: 4,
  Scale: 3,
  Multi: 2.5,
  Grid: 2,
  Single: 1,
};

/**
 * Cap mid-interview pauses so a bad path-length estimate cannot stall forever
 * on one screen.
 */
const MAX_STEP_DELAY_MS = 180_000;

export interface LoiSchedule {
  questionName: string;
  delayMs: number;
}

export interface LoiOptions {
  targetMinutes: number;
  jitterPercent: number;
  remainingQuestions: Question[];
}

export interface LoiStepDelayOptions {
  targetMinutes: number;
  jitterPercent: number;
  /** Wall time since this interview started (including prior pauses). */
  elapsedMs: number;
  /** 1-based index of the question about to be paused. */
  stepIndex: number;
  /**
   * Expected questions in a typical live path (e.g. last explore `steps`).
   * Must NOT be the full Definition length when routing skips most questions.
   * Exclude end questions (ANMER) — callers should not pause on those.
   */
  expectedTotalSteps: number;
}

function jitter(baseMs: number, jitterPercent: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * (jitterPercent / 100);
  return Math.round(baseMs * factor);
}

export function buildLoiSchedule(options: LoiOptions): LoiSchedule[] {
  const { targetMinutes, jitterPercent, remainingQuestions } = options;
  const totalMs = targetMinutes * 60 * 1000;

  const weights = remainingQuestions.map(
    (q) => TYPE_WEIGHTS[q.Type] ?? 1,
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  return remainingQuestions.map((q, i) => ({
    questionName: q.Name,
    delayMs: jitter((totalMs * weights[i]) / totalWeight, jitterPercent),
  }));
}

/**
 * Pick an expected path length for live LOI pacing.
 * Prefer recent explore step counts; never fall back to raw Definition size
 * (that under-paces badly when routing only shows a fraction of questions).
 */
export function estimateLoiPathSteps(options: {
  exploreStepCounts?: number[];
  definitionQuestionCount?: number;
  fallback?: number;
}): number {
  const fromExplore = (options.exploreStepCounts ?? []).filter((n) => n > 0);
  if (fromExplore.length > 0) {
    const sorted = [...fromExplore].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  }
  const defCount = options.definitionQuestionCount ?? 0;
  // Definition is usually far larger than a live path — clamp to a survey-sized range.
  if (defCount > 0) {
    return Math.min(45, Math.max(20, Math.round(defCount * 0.12)));
  }
  return options.fallback ?? 30;
}

/**
 * Remaining-budget delay so wall-clock interview length approaches targetMinutes.
 * Recomputes each step from elapsed time so skipped routing does not leave unused budget.
 * Equal per remaining step (no type weights) so shares stay sum-preserving.
 */
export function computeLoiStepDelayMs(options: LoiStepDelayOptions): number {
  const targetMs = Math.max(0, options.targetMinutes * 60_000);
  const remainingMs = Math.max(0, targetMs - options.elapsedMs);
  if (remainingMs <= 0) return 200;

  let remainingSteps =
    options.expectedTotalSteps - options.stepIndex + 1;
  if (remainingSteps < 1) {
    // Past estimate with budget left — assume a few more screens so we
    // keep spending time instead of dumping everything on one click.
    remainingSteps = 3;
  }

  const base = remainingMs / remainingSteps;
  return Math.min(
    MAX_STEP_DELAY_MS,
    Math.max(250, jitter(base, options.jitterPercent)),
  );
}

/** Interruptible sleep — returns early when shouldAbort() is true. */
export async function delay(
  ms: number,
  shouldAbort?: () => boolean,
): Promise<void> {
  if (ms <= 0) return;
  const chunk = 200;
  let left = ms;
  while (left > 0) {
    if (shouldAbort?.()) return;
    const wait = Math.min(chunk, left);
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
    left -= wait;
  }
}
