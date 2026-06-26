import type { Definition, ProjectConfig } from "./schemas.js";
import type { ExplorePreflightResult } from "./explore-preflight.js";
import { buildExplorePreflight } from "./explore-preflight.js";

export type WorkflowStepId =
  | "import"
  | "preflight"
  | "explore"
  | "review"
  | "run";

export type WorkflowStepStatus =
  | "pending"
  | "ready"
  | "complete"
  | "warning"
  | "blocked";

export interface WorkflowStep {
  id: WorkflowStepId;
  label: string;
  description: string;
  status: WorkflowStepStatus;
  detail?: string;
  section: "datasets" | "setup" | "explore" | "definition" | "run";
}

export interface ProjectWorkflow {
  steps: WorkflowStep[];
  currentStep: WorkflowStepId;
  explorePreflight: ExplorePreflightResult;
}

export function buildProjectWorkflow(input: {
  config: ProjectConfig;
  definition: Definition;
  activeDataset: { name: string; rowCount: number } | null;
  dataRowCount: number;
  coverage: {
    questionsInDataNotInDefinition: string[];
    questionsInDefinitionNotInData: string[];
  };
  exploreRuns: Array<{
    status?: string;
    conflicts?: unknown[];
    mergeIssues?: unknown[];
    blockers?: unknown[];
    discovered?: number;
  }>;
}): ProjectWorkflow {
  const explorePreflight = buildExplorePreflight({
    config: input.config,
    definition: input.definition,
    activeDataset: input.activeDataset,
    dataRowCount: input.dataRowCount,
    questionsInDefinitionNotInData:
      input.coverage.questionsInDefinitionNotInData,
  });

  const lastExplore = input.exploreRuns[0];
  const exploreComplete = lastExplore?.status === "completed";
  const explorePartial = lastExplore?.status === "partial";
  const hasDataset =
    Boolean(input.activeDataset) && input.dataRowCount > 0;
  const hasDefinition = input.definition.Questions.length > 0;
  const gapCount = input.coverage.questionsInDataNotInDefinition.length;
  const hasConflicts =
    Array.isArray(lastExplore?.conflicts) && lastExplore.conflicts.length > 0;
  const hasMergeIssues =
    Array.isArray(lastExplore?.mergeIssues) && lastExplore.mergeIssues.length > 0;

  const steps: WorkflowStep[] = [
    {
      id: "import",
      label: "Import SAV",
      description: "Each row = one interview — infers question types from columns",
      section: "datasets",
      status: hasDataset ? "complete" : "blocked",
      detail: hasDataset
        ? `${input.activeDataset!.name} · ${input.dataRowCount} rows`
        : "Upload a .sav file",
    },
    {
      id: "preflight",
      label: "Pre-flight",
      description: "Test link, seed row, and answer policy for non-SAV questions",
      section: "setup",
      status: !hasDataset
        ? "pending"
        : explorePreflight.ready
          ? "complete"
          : "warning",
      detail: explorePreflight.checks
        .filter((c) => !c.ok)
        .map((c) => c.label)
        .join(", ") || "Ready to explore",
    },
    {
      id: "explore",
      label: "Guided explore",
      description: "Walk test link with one dataset row",
      section: "explore",
      status: !hasDataset
        ? "pending"
        : exploreComplete
          ? "complete"
          : explorePartial
            ? "warning"
            : explorePreflight.ready
              ? "ready"
              : "blocked",
      detail: exploreComplete
        ? `${lastExplore?.discovered ?? 0} questions discovered`
        : explorePartial
          ? "Last run blocked — check explore log"
          : "Run explore on test link",
    },
    {
      id: "review",
      label: "Review definition",
      description: "Review answer policy; Split or fixed values for questions not in dataset",
      section: "definition",
      status: !hasDefinition
        ? "pending"
        : gapCount > 0 || hasConflicts || hasMergeIssues
          ? "warning"
          : exploreComplete
            ? "complete"
            : "ready",
      detail:
        gapCount > 0
          ? `${gapCount} SAV gap(s) — Fix gaps`
          : hasConflicts || hasMergeIssues
            ? "Conflicts or review items from explore — see table"
            : `${input.definition.Questions.length} questions`,
    },
    {
      id: "run",
      label: "Run interviews",
      description: "One worker per dataset row — Maintain uses row values",
      section: "run",
      status:
        exploreComplete && gapCount === 0 && hasDefinition
          ? "ready"
          : "pending",
      detail: "Use live link and workers",
    },
  ];

  const currentStep =
    steps.find(
      (s) =>
        s.status === "blocked" ||
        s.status === "warning" ||
        s.status === "ready",
    )?.id ?? "run";

  return { steps, currentStep, explorePreflight };
}
