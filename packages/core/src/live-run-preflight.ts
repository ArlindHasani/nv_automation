import type { Definition, ProjectConfig } from "./schemas.js";
import { findAnswerConfigurationGaps } from "./answer-policy.js";
import type { PreflightCheck } from "./explore-preflight.js";
import { isPlaywrightChromiumInstalled } from "./playwright-browsers.js";

export interface LiveRunPreflightResult {
  ready: boolean;
  checks: PreflightCheck[];
  answerGaps: ReturnType<typeof findAnswerConfigurationGaps>;
}

export function buildLiveRunPreflight(input: {
  config: Pick<
    ProjectConfig,
    "liveLink" | "nvProjectId" | "questField" | "workerProfiles"
  >;
  definition: Definition;
  activeDataset: { name: string; rowCount: number } | null;
  questionsInDefinitionNotInData: string[];
  dataColumns?: string[];
  playwrightInstalled?: boolean;
}): LiveRunPreflightResult {
  const checks: PreflightCheck[] = [];
  const answerGaps = findAnswerConfigurationGaps(
    input.definition,
    input.questionsInDefinitionNotInData,
  );

  checks.push({
    id: "live-link",
    label: "Live link configured",
    ok: Boolean(input.config.liveLink?.trim()),
    detail: input.config.liveLink || "Set live link in Setup",
  });

  checks.push({
    id: "nv-project",
    label: "NV project (NOMP) configured",
    ok: Boolean(input.config.nvProjectId?.trim()),
    detail: input.config.nvProjectId || "Set NV project ID in Setup",
  });

  checks.push({
    id: "worker-profiles",
    label: "At least one worker profile defined",
    ok: (input.config.workerProfiles?.length ?? 0) > 0,
    detail:
      (input.config.workerProfiles?.length ?? 0) > 0
        ? `${input.config.workerProfiles.length} profile(s)`
        : "Add caller credentials in Setup",
  });

  checks.push({
    id: "dataset",
    label: "Active dataset imported",
    ok: Boolean(input.activeDataset && input.activeDataset.rowCount > 0),
    detail: input.activeDataset
      ? `${input.activeDataset.name} (${input.activeDataset.rowCount} rows)`
      : "Import and activate a SAV in Datasets",
  });

  const questField = input.config.questField?.trim() || "quest";
  const questColumnOk =
    Boolean(input.activeDataset) &&
    (input.dataColumns?.includes(questField) ?? false);
  checks.push({
    id: "quest-field",
    label: "Quest field configured in active dataset",
    ok: questColumnOk,
    detail: questColumnOk
      ? `Column "${questField}"`
      : input.activeDataset
        ? `Choose a column in Setup — "${questField}" not found`
        : "Import a SAV first, then pick the quest column in Setup",
  });

  checks.push({
    id: "answer-gaps",
    label: "Answer policy configured for all known non-SAV questions",
    ok: answerGaps.length === 0,
    detail:
      answerGaps.length === 0
        ? "All questions have Maintain, fixed, or split policy"
        : `${answerGaps.map((g) => g.question).join(", ")}`,
  });

  const playwrightOk =
    input.playwrightInstalled ?? isPlaywrightChromiumInstalled();
  checks.push({
    id: "playwright",
    label: "Playwright Chromium installed",
    ok: playwrightOk,
    detail: playwrightOk
      ? "Ready in .playwright-browsers"
      : "Run npm run dev or npm run playwright:install",
  });

  return {
    ready: checks.every((c) => c.ok),
    checks,
    answerGaps,
  };
}
