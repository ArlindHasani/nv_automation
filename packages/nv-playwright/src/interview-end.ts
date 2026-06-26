import type { Page } from "playwright";

/** NV questions that mark the end of a guided explore walk (one dataset row). */
const DEFAULT_END_QUESTIONS = new Set(["ANMER", "ANM", "END"]);

export function isInterviewEndQuestion(
  name: string,
  extra: string[] = [],
): boolean {
  const upper = name.toUpperCase();
  if (DEFAULT_END_QUESTIONS.has(upper)) return true;
  return extra.some((q) => q.toUpperCase() === upper);
}

/** True when NV has left the question form (thank-you / completion screen). */
export async function isInterviewCompletePage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const qlabel = (
      document.querySelector('input[name="QLABEL"]') as HTMLInputElement | null
    )?.value?.trim();

    const body = document.body.innerText.toLowerCase();
    const completionText =
      body.includes("thank") ||
      body.includes("gracias") ||
      body.includes("fin de la entrevista") ||
      body.includes("interview complete") ||
      body.includes("entrevista finalizada");

    if (completionText) return true;

    if (!qlabel) {
      const hasAnswers = document.querySelector(
        'form#form input[type="radio"], form#form input[type="RADIO"], table#example input, form#form select',
      );
      return !hasAnswers;
    }

    return false;
  });
}
