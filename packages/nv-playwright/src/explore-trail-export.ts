import fs from "node:fs/promises";
import type { ExploreTrailStep } from "./NvExploreRunner.js";

/** ASCII-safe grid answers for CSV/Excel (e.g. BE2_2=5, BE153=1+3). */
export function formatStatementAnswersForTrail(
  statementAnswers: Record<string, string[]>,
): string {
  return Object.entries(statementAnswers)
    .map(([name, codes]) => `${name}=${codes.join("+")}`)
    .join(", ");
}

function normalizeAnswerForCsv(answer: string): string {
  return answer.replace(/\u2192/g, "=");
}

function csvEscape(value: string): string {
  const normalized = normalizeAnswerForCsv(value);
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

/** One CSV row per interview pass; question names as columns, answers as values. */
export function exploreTrailToCsv(trail: ExploreTrailStep[]): string {
  if (trail.length === 0) {
    return "row_pass\n";
  }

  const sorted = [...trail].sort((a, b) => {
    if (a.rowPass !== b.rowPass) return a.rowPass - b.rowPass;
    return a.step - b.step;
  });

  const questionOrder: string[] = [];
  const seenQuestions = new Set<string>();
  for (const entry of sorted) {
    if (!seenQuestions.has(entry.question)) {
      seenQuestions.add(entry.question);
      questionOrder.push(entry.question);
    }
  }

  const byPass = new Map<number, Map<string, string>>();
  for (const entry of sorted) {
    let answers = byPass.get(entry.rowPass);
    if (!answers) {
      answers = new Map();
      byPass.set(entry.rowPass, answers);
    }
    answers.set(entry.question, entry.answer);
  }

  const headers = ["row_pass", ...questionOrder];
  const lines = [headers.map(csvEscape).join(",")];

  for (const pass of [...byPass.keys()].sort((a, b) => a - b)) {
    const answers = byPass.get(pass)!;
    lines.push(
      [String(pass), ...questionOrder.map((q) => answers.get(q) ?? "")]
        .map(csvEscape)
        .join(","),
    );
  }

  return `\uFEFF${lines.join("\n")}\n`;
}

export async function writeExploreTrailArtifacts(
  outputDir: string,
  runId: string,
  trail: ExploreTrailStep[],
): Promise<{ trailJson: string; trailCsv: string }> {
  const trailJson = `explore-trail-${runId}.json`;
  const trailCsv = `explore-trail-${runId}.csv`;
  await fs.writeFile(
    `${outputDir}/${trailJson}`,
    JSON.stringify(trail, null, 2),
  );
  await fs.writeFile(`${outputDir}/${trailCsv}`, exploreTrailToCsv(trail));
  return { trailJson, trailCsv };
}
