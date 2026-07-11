import type { Question, QuestionType } from "./schemas.js";

const TYPE_WEIGHTS: Record<QuestionType, number> = {
  Open: 4,
  Scale: 3,
  Multi: 2.5,
  Grid: 2,
  Single: 1,
};

export interface LoiSchedule {
  questionName: string;
  delayMs: number;
}

export interface LoiOptions {
  targetMinutes: number;
  jitterPercent: number;
  remainingQuestions: Question[];
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
