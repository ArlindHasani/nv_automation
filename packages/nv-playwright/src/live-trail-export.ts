import fs from "node:fs/promises";
import type { ExploreTrailStep } from "./NvExploreRunner.js";
import {
  exploreTrailToCsv,
  formatStatementAnswersForTrail,
} from "./explore-trail-export.js";

export interface LiveTrailStep extends ExploreTrailStep {
  /** Milliseconds since worker start. */
  elapsedMs: number;
  quest?: string;
  workerProfileId?: string;
  outcome?: "answered" | "soft-pass" | "failed" | "home-return";
  error?: string;
}

export function liveTrailToCsv(trail: LiveTrailStep[]): string {
  if (trail.length === 0) {
    return "elapsed_ms,quest,row_pass,question,type,answer,source,policy,outcome,error\n";
  }

  const lines = [
    "elapsed_ms,quest,row_pass,dataset_row,question,type,answer,source,policy,outcome,error",
  ];

  const esc = (value: string) => {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };

  for (const step of trail) {
    lines.push(
      [
        String(step.elapsedMs),
        step.quest ?? "",
        String(step.rowPass),
        String(step.datasetRowIndex),
        step.question,
        step.type,
        step.answer,
        step.answerSource,
        step.answerPolicy ?? "",
        step.outcome ?? "",
        step.error ?? "",
      ]
        .map((v) => esc(String(v)))
        .join(","),
    );
  }

  return `\uFEFF${lines.join("\n")}\n`;
}

/** Wide CSV (one row per interview) — same shape as explore for spreadsheet review. */
export function liveTrailToWideCsv(trail: LiveTrailStep[]): string {
  const asExplore: ExploreTrailStep[] = trail.map((s) => ({
    step: s.step,
    rowPass: s.rowPass,
    datasetRowIndex: s.datasetRowIndex,
    question: s.question,
    type: s.type,
    options: s.options,
    answer: s.answer,
    answerSource: s.answerSource,
    answerPolicy: s.answerPolicy,
    configured: s.configured,
    warnings: s.warnings,
    screenshot: s.screenshot,
  }));
  return exploreTrailToCsv(asExplore);
}

export async function writeLiveTrailArtifacts(
  outputDir: string,
  runId: string,
  trail: LiveTrailStep[],
): Promise<{ trailJson: string; trailCsv: string; trailWideCsv: string }> {
  const trailJson = `live-trail-${runId}.json`;
  const trailCsv = `live-trail-${runId}.csv`;
  const trailWideCsv = `live-trail-wide-${runId}.csv`;
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    `${outputDir}/${trailJson}`,
    JSON.stringify(trail, null, 2),
  );
  await fs.writeFile(`${outputDir}/${trailCsv}`, liveTrailToCsv(trail));
  await fs.writeFile(`${outputDir}/${trailWideCsv}`, liveTrailToWideCsv(trail));
  return { trailJson, trailCsv, trailWideCsv };
}

export { formatStatementAnswersForTrail };
