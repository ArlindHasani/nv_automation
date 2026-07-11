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
  liveRunPreflight: {
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

export interface WorkerProfileView {
  id: string;
  label: string;
  station: string;
  password: string;
  callerId: string;
  group?: string;
  rowStart?: number;
  rowEnd?: number;
}

export interface InterviewQueueRowView {
  index: number;
  status: string;
  quest?: string;
  workerProfileId?: string;
  assignedProfileId?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  lastQuestion?: string;
  error?: string | null;
}

export interface InterviewQueueSummaryView {
  rowCount: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
  skipped: number;
  rows: InterviewQueueRowView[];
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
    exploreSeedRowIndex?: number;
    exploreRowCount?: number;
    exploreEndQuestions?: string[];
    nvProjectId?: string;
    nvGroup?: string;
    questField?: string;
    workerProfiles?: WorkerProfileView[];
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
      FixedAnswer?: string | null;
      ExploreOverride?: string | null;
      Min?: number;
      Max?: number;
      AVG?: number | null;
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
  /** Full column catalog (variables.json ∪ all row keys) — not sparse row[0]. */
  dataColumns?: string[];
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
    configurationGaps?: Array<{
      question: string;
      type: string;
      reason: string;
    }>;
    rowsWalked?: number;
    discoveredNames?: string[];
    trailCsv?: string;
    trailJson?: string;
    createdAt: string;
  }>;
  liveRuns: Array<{
    id: string;
    status: "completed" | "partial" | "failed" | "stopped";
    workerProfileId: string;
    workerProfileLabel: string;
    interviewsCompleted: number;
    interviewsFailed: number;
    steps?: number;
    lastRowIndex?: number | null;
    lastQuest?: string;
    lastQuestion?: string;
    error?: string;
    trailCsv?: string;
    trailJson?: string;
    trailWideCsv?: string;
    logFile?: string;
    startedAt: string;
    finishedAt: string;
    createdAt: string;
  }>;
  workflow: ProjectWorkflowView;
  queueSummary?: InterviewQueueSummaryView | null;
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
