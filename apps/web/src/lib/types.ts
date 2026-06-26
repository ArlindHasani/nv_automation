export interface ProjectSummary {
  id: string;
  name: string;
  questionCount: number;
  dataRowCount: number;
  datasetCount: number;
  updatedAt: string;
}

export interface WorkflowStepView {
  id: string;
  label: string;
  description: string;
  status: "pending" | "ready" | "complete" | "warning" | "blocked";
  detail?: string;
  section: ProjectSection;
}

export interface ProjectWorkflowView {
  steps: WorkflowStepView[];
  currentStep: string;
  explorePreflight: {
    ready: boolean;
    checks: Array<{
      id: string;
      label: string;
      ok: boolean;
      detail?: string;
    }>;
    answerGaps?: Array<{
      question: string;
      type: string;
      reason: string;
    }>;
  };
}

export interface ProjectBundle {
  project: {
    slug: string;
    name: string;
    liveLink: string;
    testLink: string;
    mode: string;
    loiTargetMinutes: number;
    loiJitterPercent: number;
    maxWorkers: number;
    exploreSeedRowIndex?: number;
    exploreRowCount?: number;
    exploreEndQuestions?: string[];
  };
  definition: {
    Questions: Array<{
      Name: string;
      Type: string;
      Method: string;
      Split: Record<string, number>;
      Labels?: Record<string, string>;
      Source?: "sav" | "explore" | "manual";
      GridMulti?: boolean;
      GridScreen?: string;
      Statements?: Array<{ name: string; rowLabel: string }>;
      ExploreOverride?: string | null;
    }>;
  };
  datasets: Array<{
    id: string;
    name: string;
    rowCount: number;
    isActive: boolean;
    importedAt: string;
  }>;
  activeDataset: { id: string; name: string; rowCount: number } | null;
  data: Array<Record<string, unknown>>;
  coverage: {
    questionsInDataNotInDefinition: string[];
    questionsInDefinitionNotInData: string[];
    nvSessionFieldsPresent: Record<string, boolean>;
  };
  exploreRuns: Array<{
    id: string;
    status?: string;
    discovered: number;
    added: string[];
    updated: string[];
    conflicts?: unknown[];
    mergeIssues?: Array<{
      severity: string;
      question: string;
      message: string;
    }>;
    blockers?: Array<{
      question: string;
      type: string;
      reason: string;
      screenshot?: string;
    }>;
    rowsWalked?: number;
    discoveredNames?: string[];
    trailCsv?: string;
    trailJson?: string;
    createdAt: string;
  }>;
  workflow: ProjectWorkflowView;
}

export type ProjectSection =
  | "setup"
  | "datasets"
  | "definition"
  | "explore"
  | "run";

export const PROJECT_SECTIONS: Array<{
  id: ProjectSection;
  label: string;
}> = [
  { id: "setup", label: "Setup" },
  { id: "datasets", label: "Datasets" },
  { id: "definition", label: "Definition" },
  { id: "explore", label: "Explore" },
  { id: "run", label: "Run" },
];
