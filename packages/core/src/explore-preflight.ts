import type { Definition, ProjectConfig } from "./schemas.js";
import { findAnswerConfigurationGaps } from "./answer-policy.js";

export interface PreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ExplorePreflightResult {
  ready: boolean;
  checks: PreflightCheck[];
  answerGaps: ReturnType<typeof findAnswerConfigurationGaps>;
}

export function buildExplorePreflight(input: {
  config: Pick<ProjectConfig, "testLink" | "exploreSeedRowIndex">;
  definition: Definition;
  activeDataset: { name: string; rowCount: number } | null;
  dataRowCount: number;
  questionsInDefinitionNotInData: string[];
}): ExplorePreflightResult {
  const checks: PreflightCheck[] = [];
  const seedIndex = input.config.exploreSeedRowIndex ?? 0;
  const answerGaps = findAnswerConfigurationGaps(
    input.definition,
    input.questionsInDefinitionNotInData,
  );

  checks.push({
    id: "test-link",
    label: "Test link configured",
    ok: Boolean(input.config.testLink?.trim()),
    detail: input.config.testLink || "Set test link in Setup",
  });

  checks.push({
    id: "dataset",
    label: "Active dataset imported",
    ok: Boolean(input.activeDataset && input.dataRowCount > 0),
    detail: input.activeDataset
      ? `${input.activeDataset.name} (${input.dataRowCount} rows)`
      : "Import and activate a SAV in Datasets",
  });

  checks.push({
    id: "seed-row",
    label: "Seed row in range",
    ok: input.dataRowCount > 0 && seedIndex < input.dataRowCount,
    detail:
      input.dataRowCount > 0
        ? `Row ${seedIndex} of ${input.dataRowCount}`
        : "No dataset rows",
  });

  checks.push({
    id: "explore-answer-gaps",
    label: "Answer policy configured for all known non-SAV questions",
    ok: answerGaps.length === 0,
    detail:
      answerGaps.length === 0
        ? "Dataset-backed questions use the seed row; others have fixed answers or split weights"
        : `${answerGaps.map((g) => g.question).join(", ")} — not in dataset, configure fixed answer or Split weights in Definition`,
  });

  return {
    ready: checks.every((c) => c.ok),
    checks,
    answerGaps,
  };
}
