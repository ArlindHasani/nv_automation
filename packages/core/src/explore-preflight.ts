import type { Definition, ProjectConfig } from "./schemas.js";
import { findExploreAnswerGaps } from "./explore-overrides.js";

export interface PreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ExplorePreflightResult {
  ready: boolean;
  checks: PreflightCheck[];
  answerGaps: ReturnType<typeof findExploreAnswerGaps>;
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
  const answerGaps = findExploreAnswerGaps(
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
    label: "Explore answers for non-SAV questions",
    ok: answerGaps.length === 0,
    detail:
      answerGaps.length === 0
        ? "Dataset-backed questions use the seed row; others have overrides or split"
        : `${answerGaps.map((g) => g.question).join(", ")} — not in dataset, need Explore override in Definition (or Split weights for coded questions)`,
  });

  return {
    ready: checks.every((c) => c.ok),
    checks,
    answerGaps,
  };
}
