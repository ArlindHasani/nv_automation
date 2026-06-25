import type { Question, QuestionType } from "./schemas.js";

const TYPE_WEIGHTS: Record<QuestionType, number> = {
  Open: 4,
  Scale: 3,
  Multi: 2.5,
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

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
