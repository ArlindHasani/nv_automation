"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ChevronRight,
  Compass,
  Database,
  Eye,
  FileStack,
  ListTree,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Settings2,
  Square,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import { LoadingButton } from "@/components/ui/loading-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PageHeader,
  StatCard,
} from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProject } from "@/contexts/project-context";
import { ExploreConsole, type ExploreConsoleLine } from "@/components/project/explore-console";
import { WorkerConsole } from "@/components/project/worker-console";
import { consumeExploreStream } from "@/lib/explore-stream";
import type { ProjectSection, WorkerProfileView } from "@/lib/types";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatStatusLabel } from "@/lib/format-labels";
import { WorkflowProgress } from "@/components/project/workflow-progress";
import { DefinitionQuestionTable } from "@/components/project/definition-question-table";
import { ExplorePreflightCard } from "@/components/project/explore-preflight-card";
import {
  ReviewItemsPanel,
  filterReviewIssues,
} from "@/components/project/review-items-panel";
import { ActionWithHelp, HelpTip, LabelWithHelp, TipItem, TipText } from "@/components/project/help-tip";
import { DatasetPreviewSheet } from "@/components/project/dataset-preview-sheet";
import { DeleteProjectDangerZone } from "@/components/project/delete-project-danger-zone";
import { ManualAssignmentSheet } from "@/components/project/manual-assignment-sheet";
import { InterviewQueueTable } from "@/components/project/interview-queue-table";
import { ExploreRunsTable } from "@/components/project/explore-runs-table";
import { ProjectWorkspaceSkeleton } from "@/components/project/project-workspace-skeleton";
import { FilterSegment } from "@/components/project/filter-group";
import { cn } from "@/lib/utils";

const fieldClass = "h-11 text-base";

type EditableWorkerProfile = WorkerProfileView & { clientKey: string };

function withClientKeys(profiles: WorkerProfileView[]): EditableWorkerProfile[] {
  return profiles.map((profile) => ({
    ...profile,
    clientKey: crypto.randomUUID(),
  }));
}

function stripClientKeys(profiles: EditableWorkerProfile[]): WorkerProfileView[] {
  return profiles.map(({ clientKey: _clientKey, ...profile }) => profile);
}

function RouteChevron() {
  return (
    <ChevronRight
      className="size-[0.7em] shrink-0 text-muted-foreground/75"
      strokeWidth={2.25}
      aria-hidden
    />
  );
}

function ExploreQuestionRoute({
  names,
  compact = false,
}: {
  names: string[];
  compact?: boolean;
}) {
  if (names.length === 0) return null;

  if (compact && names.length > 3) {
    const skipped = names.length - 2;
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs leading-none">
        <span className="truncate font-mono">{names[0]}</span>
        <RouteChevron />
        <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none tabular-nums text-muted-foreground">
          +{skipped}
        </span>
        <RouteChevron />
        <span className="truncate font-mono">{names[names.length - 1]}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-none">
      {names.map((name, index) => (
        <span key={`${name}-${index}`} className="inline-flex items-center gap-1.5">
          {index > 0 && <RouteChevron />}
          <span className="font-mono">{name}</span>
        </span>
      ))}
    </span>
  );
}

function SetupConfigSection({
  title,
  description,
  help,
  children,
}: {
  title: string;
  description?: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-muted/15 p-5 md:p-6">
      <div className="space-y-1 border-b border-border/60 pb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {help ? <HelpTip content={help} /> : null}
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-6 md:grid-cols-2">{children}</div>
    </section>
  );
}

const SECTION_META: Record<
  ProjectSection,
  { title: string; description: string; icon: LucideIcon }
> = {
  setup: {
    title: "Setup",
    description: "Configure links, LOI timing, and worker limits",
    icon: Settings2,
  },
  datasets: {
    title: "Datasets",
    description: "Import SAV files and choose the active dataset",
    icon: Database,
  },
  definition: {
    title: "Definition",
    description: "Questionnaire structure and coverage",
    icon: ListTree,
  },
  explore: {
    title: "Explore",
    description: "Parse the test link and merge into definition",
    icon: Compass,
  },
  run: {
    title: "Run",
    description: "Start interview workers with realistic LOI timing",
    icon: Play,
  },
};

export function ProjectWorkspace() {
  const { section, bundle, loading, refreshing, refresh, projectId } =
    useProject();
  const router = useRouter();
  const meta = SECTION_META[section];

  if (loading || !bundle) {
    return <ProjectWorkspaceSkeleton />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={meta.title}
        projectName={bundle.project.name}
        description={meta.description}
        icon={meta.icon}
      >
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw
            className={`mr-2 size-5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </PageHeader>
      <div
        className={cn(
          "space-y-8 p-8",
          refreshing && "pointer-events-none opacity-60",
        )}
      >
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Questions"
            value={bundle.definition.Questions.length}
            icon={ListTree}
            action={{
              label: "View definition",
              href: `/projects/${projectId}/definition`,
            }}
          />
          <StatCard
            label="Active dataset"
            value={bundle.activeDataset?.name ?? "None"}
            valueVariant="text"
            subtitle={
              bundle.activeDataset
                ? `${bundle.activeDataset.rowCount.toLocaleString()} interview rows`
                : "Import and activate a SAV"
            }
            icon={Database}
            action={{
              label: "Manage datasets",
              href: `/projects/${projectId}/datasets`,
            }}
          />
          <StatCard
            label="Interview rows"
            value={bundle.activeDataset?.rowCount ?? 0}
            subtitle={
              bundle.activeDataset
                ? "Available from active dataset"
                : undefined
            }
            icon={FileStack}
            action={{
              label: "Open run panel",
              href: `/projects/${projectId}/run`,
            }}
          />
          <StatCard
            label="Coverage gaps"
            value={bundle.coverage.questionsInDataNotInDefinition.length}
            icon={AlertTriangle}
            variant={
              bundle.coverage.questionsInDataNotInDefinition.length > 0
                ? "warning"
                : "default"
            }
            action={{
              label: "Review in definition",
              href: `/projects/${projectId}/definition`,
            }}
          />
        </div>

        {bundle.workflow && (
          <Card className="border-none shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Freestyle workflow</CardTitle>
                <HelpTip
                  content={
                    <>
                      Follow these steps in order: import a SAV, configure links
                      and answer policy, explore the test questionnaire, review
                      the definition, then run live interviews. Click any step
                      to jump to that section.
                    </>
                  }
                />
              </div>
              <CardDescription>
                SAV row → explore questionnaire → Maintain from dataset per
                interview. Use <strong>Split</strong> only when a question
                appears in explore but has no SAV column.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WorkflowProgress
                steps={bundle.workflow.steps}
                currentStep={bundle.workflow.currentStep}
                onNavigate={(s) => router.push(`/projects/${projectId}/${s}`)}
              />
            </CardContent>
          </Card>
        )}

        {section === "setup" && <SetupPanel />}
        {section === "datasets" && <DatasetsPanel />}
        {section === "definition" && <DefinitionPanel />}
        {section === "explore" && <ExplorePanel />}
        {section === "run" && <RunPanel />}
      </div>
    </div>
  );
}

function SetupPanel() {
  const { bundle, projectId, refresh } = useProject();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    name: bundle!.project.name,
    liveLink: bundle!.project.liveLink,
    testLink: bundle!.project.testLink,
    nvProjectId: bundle!.project.nvProjectId ?? "",
    questField: bundle!.project.questField ?? "quest",
    workerProfiles: withClientKeys(bundle!.project.workerProfiles ?? []),
    loiTargetMinutes: bundle!.project.loiTargetMinutes,
    loiJitterPercent: bundle!.project.loiJitterPercent,
    exploreSeedRowIndex: bundle!.project.exploreSeedRowIndex ?? 0,
    exploreRowCount: bundle!.project.exploreRowCount ?? 1,
    exploreEndQuestionsText: (bundle!.project.exploreEndQuestions ?? ["ANMER"]).join(
      ", ",
    ),
  });

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const id = toast.loading("Saving settings...");
    const exploreEndQuestions = settings.exploreEndQuestionsText
      .split(/[,+\n]/)
      .map((q) => q.trim())
      .filter(Boolean);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settings.name,
        liveLink: settings.liveLink,
        testLink: settings.testLink,
        loiTargetMinutes: settings.loiTargetMinutes,
        loiJitterPercent: settings.loiJitterPercent,
        exploreSeedRowIndex: settings.exploreSeedRowIndex,
        exploreRowCount: Math.max(1, settings.exploreRowCount),
        exploreEndQuestions:
          exploreEndQuestions.length > 0 ? exploreEndQuestions : ["ANMER"],
        nvProjectId: settings.nvProjectId,
        questField: settings.questField || "quest",
        workerProfiles: stripClientKeys(settings.workerProfiles).filter(
          (p) => p.id && p.label && p.station && p.password && p.callerId,
        ),
        mode: "Freestyle",
      }),
    });
    if (res.ok) {
      toast.success("Settings saved", { id });
    } else {
      toast.error((await res.json()).error, { id });
    }
    setSaving(false);
    await refresh();
  }

  const savColumns =
    bundle!.activeDataset && bundle!.data[0]
      ? Object.keys(bundle!.data[0]).sort()
      : [];

  return (
    <>
    <Card className="border-none shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Project configuration</CardTitle>
        <CardDescription className="text-base">
          Links, guided explore, and live interview run settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={saveSettings} className="flex flex-col gap-8">
          <SetupConfigSection title="General">
            <div className="space-y-2 md:col-span-2">
              <Label className="text-base">Project name</Label>
              <Input
                className="h-12 text-base font-medium md:text-lg"
                value={settings.name}
                onChange={(e) =>
                  setSettings({ ...settings, name: e.target.value })
                }
              />
              <p className="text-sm text-muted-foreground">
                Shown at the top of this page and in the project list.
              </p>
            </div>
          </SetupConfigSection>

          <SetupConfigSection
            title="Survey links"
            description="Live login for interview workers; test preview for guided explore only."
            help="Live link is where caller workers sign in. Test link opens the questionnaire preview without login — Explore uses it to discover question structure."
          >
            <div className="space-y-2 md:col-span-2">
              <LabelWithHelp
                help="NV Rev2 live login URL. Workers authenticate with caller profiles below, not SAV login columns."
              >
                Live link
              </LabelWithHelp>
              <Input
                className={fieldClass}
                value={settings.liveLink}
                onChange={(e) =>
                  setSettings({ ...settings, liveLink: e.target.value })
                }
                placeholder="https://nv25.ffind.com/nv_rev2/login.php"
              />
            </div>
            <div className="space-y-2">
              <LabelWithHelp
                help="NOMP project code shown on the NV login screen (e.g. V1DB2606.AR261071). Backslashes in SAV are normalized to dots."
              >
                NV project (NOMP)
              </LabelWithHelp>
              <Input
                className={fieldClass}
                value={settings.nvProjectId}
                onChange={(e) =>
                  setSettings({ ...settings, nvProjectId: e.target.value })
                }
                placeholder="V1DB2606.AR261071"
              />
            </div>
            <div className="space-y-2">
              <LabelWithHelp
                help="SAV column whose value becomes the 10-digit quest ID when a worker starts each interview on the NV home screen."
              >
                Quest field (SAV column)
              </LabelWithHelp>
              {savColumns.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Import and activate a SAV in Datasets to choose the quest column.
                </p>
              ) : (
                <select
                  className={`${fieldClass} w-full rounded-md border border-input bg-background px-3`}
                  value={
                    savColumns.includes(settings.questField)
                      ? settings.questField
                      : savColumns[0]
                  }
                  onChange={(e) =>
                    setSettings({ ...settings, questField: e.target.value })
                  }
                >
                  {savColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <LabelWithHelp
                help="Test-link URL with token — opens questionnaire preview without live login. Guided Explore walks this link using dataset rows."
              >
                Test link
              </LabelWithHelp>
              <Input
                className={fieldClass}
                value={settings.testLink}
                onChange={(e) =>
                  setSettings({ ...settings, testLink: e.target.value })
                }
                placeholder="https://nv25.ffind.com/nv_rev2/test.php?token=..."
              />
            </div>
          </SetupConfigSection>

          <SetupConfigSection
            title="Guided explore"
            description="Guided explore walks the test link using dataset seed rows. Questions not in the dataset need a fixed answer or split weights in Definition."
            help="Explore discovers question order and types from the live test UI, then merges them into your definition. Configure seed row and end questions here before running Explore."
          >
            <div className="space-y-2">
              <LabelWithHelp help="Zero-based index into the active dataset — the first row used when Explore opens the test link.">
                Explore seed row
              </LabelWithHelp>
              <Input
                className={fieldClass}
                type="number"
                min={0}
                value={settings.exploreSeedRowIndex}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    exploreSeedRowIndex: Math.max(0, Number(e.target.value)),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <LabelWithHelp help="How many consecutive dataset rows to walk in one explore run, starting at the seed row.">
                Explore row count
              </LabelWithHelp>
              <Input
                className={fieldClass}
                type="number"
                min={1}
                value={settings.exploreRowCount}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    exploreRowCount: Math.max(1, Number(e.target.value)),
                  })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <LabelWithHelp help="QLABELs where Explore stops walking the questionnaire — typically ANMER (interview end). Comma-separated.">
                Explore end questions
              </LabelWithHelp>
              <Input
                className={fieldClass}
                value={settings.exploreEndQuestionsText}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    exploreEndQuestionsText: e.target.value,
                  })
                }
                placeholder="ANMER"
              />
              <p className="text-sm text-muted-foreground">
                Comma-separated QLABELs where explore stops — usually{" "}
                <strong>ANMER</strong> (interview end).
              </p>
            </div>
            <div className="md:col-span-2">
              <ExplorePreflightCard
                preflight={
                  bundle!.workflow?.explorePreflight ?? {
                    ready: false,
                    checks: [],
                  }
                }
              />
            </div>
          </SetupConfigSection>

          <SetupConfigSection
            title="Caller worker profiles"
            description="Each profile simulates one interviewer login. Assign rows automatically or manually on the Run tab."
            help="One browser worker per profile logs into NV once, then claims and runs interviews. Add station, password, and caller ID matching your NV credentials."
          >
            <div className="md:col-span-2 space-y-3">
              {settings.workerProfiles.map((profile, index) => (
                <details
                  key={profile.clientKey}
                  className="group rounded-xl border"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-center gap-2">
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                      <span className="truncate font-medium">
                        {profile.label || profile.id || `Profile ${index + 1}`}
                      </span>
                      {profile.station ? (
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {profile.station}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        setSettings({
                          ...settings,
                          workerProfiles: settings.workerProfiles.filter(
                            (_, i) => i !== index,
                          ),
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </summary>
                  <div className="grid gap-3 border-t p-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Profile ID</Label>
                    <Input
                      className={fieldClass}
                      value={profile.id}
                      onChange={(e) => {
                        const workerProfiles = [...settings.workerProfiles];
                        workerProfiles[index] = { ...profile, id: e.target.value };
                        setSettings({ ...settings, workerProfiles });
                      }}
                      placeholder="caller-1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Input
                      className={fieldClass}
                      value={profile.label}
                      onChange={(e) => {
                        const workerProfiles = [...settings.workerProfiles];
                        workerProfiles[index] = { ...profile, label: e.target.value };
                        setSettings({ ...settings, workerProfiles });
                      }}
                      placeholder="Caller 1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Station</Label>
                    <Input
                      className={fieldClass}
                      value={profile.station}
                      onChange={(e) => {
                        const workerProfiles = [...settings.workerProfiles];
                        workerProfiles[index] = { ...profile, station: e.target.value };
                        setSettings({ ...settings, workerProfiles });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      className={fieldClass}
                      type="password"
                      value={profile.password}
                      onChange={(e) => {
                        const workerProfiles = [...settings.workerProfiles];
                        workerProfiles[index] = { ...profile, password: e.target.value };
                        setSettings({ ...settings, workerProfiles });
                      }}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Caller ID</Label>
                    <Input
                      className={fieldClass}
                      value={profile.callerId}
                      onChange={(e) => {
                        const workerProfiles = [...settings.workerProfiles];
                        workerProfiles[index] = { ...profile, callerId: e.target.value };
                        setSettings({ ...settings, workerProfiles });
                      }}
                    />
                  </div>
                  </div>
                </details>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const n = settings.workerProfiles.length + 1;
                  setSettings({
                    ...settings,
                    workerProfiles: [
                      ...settings.workerProfiles,
                      {
                        clientKey: crypto.randomUUID(),
                        id: `caller-${n}`,
                        label: `Caller ${n}`,
                        station: "",
                        password: "",
                        callerId: "",
                      },
                    ],
                  });
                }}
              >
                Add worker profile
              </Button>
            </div>
          </SetupConfigSection>

          <SetupConfigSection
            title="Interview runs"
            description="Timing and concurrency when cloning live interviews from SAV rows."
            help="LOI target spreads answer delays across the interview. Jitter adds randomness. Max workers limits how many caller profiles can run at once."
          >
            <div className="grid gap-6 md:col-span-2 md:grid-cols-3">
            <div className="space-y-2">
              <LabelWithHelp help="Target length of interview in minutes — used to schedule delays between questions.">
                Target LOI (minutes)
              </LabelWithHelp>
              <Input
                className={fieldClass}
                type="number"
                value={settings.loiTargetMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    loiTargetMinutes: Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <LabelWithHelp help="Random variation applied to LOI timing so interviews don't all finish at exactly the same pace.">
                LOI jitter %
              </LabelWithHelp>
              <Input
                className={fieldClass}
                type="number"
                value={settings.loiJitterPercent}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    loiJitterPercent: Number(e.target.value),
                  })
                }
              />
            </div>
            </div>
          </SetupConfigSection>

          <div className="flex justify-start border-t pt-6">
            <LoadingButton type="submit" size="lg" loading={saving} loadingText="Saving…">
              <Save className="mr-2 size-5" />
              Save settings
            </LoadingButton>
          </div>
        </form>
      </CardContent>
    </Card>

    <DeleteProjectDangerZone
      projectId={projectId}
      projectName={bundle!.project.name}
    />
    </>
  );
}

function DatasetsPanel() {
  const { bundle, projectId, refresh } = useProject();
  const [datasetName, setDatasetName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<{
    id: string;
    name: string;
    rowCount: number;
    isActive: boolean;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    isActive: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function uploadSav(file: File) {
    if (uploading) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("name", datasetName || file.name.replace(/\.sav$/i, ""));
    const id = toast.loading("Importing SAV...");
    try {
      const res = await fetch(`/api/projects/${projectId}/import-sav`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Imported ${data.dataset.rowCount} rows`, { id });
      } else {
        toast.error(data.error, { id });
      }
      setDatasetName("");
      await refresh();
    } finally {
      setUploading(false);
    }
  }

  async function activateDataset(datasetId: string) {
    const res = await fetch(
      `/api/projects/${projectId}/datasets/${datasetId}/activate`,
      { method: "POST" },
    );
    if (res.ok) toast.success("Active dataset updated");
    else toast.error((await res.json()).error);
    await refresh();
  }

  async function handleDeleteDataset() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(
      `/api/projects/${projectId}/datasets/${deleteTarget.id}`,
      { method: "DELETE" },
    );
    setDeleting(false);
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Failed to delete dataset");
      return;
    }
    toast.success(`Deleted dataset "${deleteTarget.name}"`);
    setDeleteTarget(null);
    await refresh();
  }

  return (
    <>
    <Card className="border-none shadow-md">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">Dataset library</CardTitle>
            <CardDescription className="text-base">
              Each SAV upload becomes one dataset. Activate one to drive Explore,
              definition coverage, and live interview rows.
            </CardDescription>
          </div>
          <HelpTip
            content={
              <>
                Import SPSS .sav files — each row is one interview. The active
                dataset supplies answer values for Maintain mode and populates the
                interview queue on Run. Preview any dataset before activating.
              </>
            }
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-dashed bg-muted/30 p-6">
          <div className="space-y-2">
            <LabelWithHelp help="Friendly name for this upload — defaults to the .sav filename if left blank.">
              Dataset name
            </LabelWithHelp>
            <Input
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="wave-1-profiles"
              className={`w-64 bg-background ${fieldClass}`}
            />
          </div>
          <label
            className={`inline-flex h-11 items-center gap-2 rounded-lg border px-5 text-base font-medium shadow-sm transition-colors ${
              uploading
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Upload className="size-5" />
            )}
            {uploading ? "Importing…" : "Upload .sav"}
            <input
              type="file"
              accept=".sav"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadSav(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Imported</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bundle!.datasets.map((ds) => (
              <TableRow key={ds.id}>
                <TableCell className="max-w-[min(100%,280px)]">
                  <span
                    className="block truncate text-sm font-medium"
                    title={ds.name}
                  >
                    {ds.name}
                  </span>
                </TableCell>
                <TableCell>{ds.rowCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(ds.importedAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  {ds.isActive ? (
                    <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="default"
                      variant="outline"
                      onClick={() =>
                        setPreviewTarget({
                          id: ds.id,
                          name: ds.name,
                          rowCount: ds.rowCount,
                          isActive: ds.isActive,
                        })
                      }
                    >
                      <Eye className="mr-1.5 size-4" />
                      Preview
                    </Button>
                    {!ds.isActive && (
                      <Button
                        size="default"
                        variant="outline"
                        onClick={() => activateDataset(ds.id)}
                      >
                        Activate
                      </Button>
                    )}
                    <Button
                      size="default"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setDeleteTarget({
                          id: ds.id,
                          name: ds.name,
                          isActive: ds.isActive,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {bundle!.datasets.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No datasets yet — upload a .sav file to get started
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Dialog
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete dataset?</DialogTitle>
          <DialogDescription>
            This will permanently remove <strong>{deleteTarget?.name}</strong>{" "}
            and its SAV/JSON files from this project.
            {deleteTarget?.isActive && bundle!.datasets.length > 1 && (
              <>
                {" "}
                The next most recent dataset will become active.
              </>
            )}
            {deleteTarget?.isActive && bundle!.datasets.length === 1 && (
              <>
                {" "}
                This is the only dataset — interview rows will be cleared until
                you upload another SAV.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleDeleteDataset()}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete dataset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <DatasetPreviewSheet
      open={previewTarget !== null}
      onOpenChange={(open) => {
        if (!open) setPreviewTarget(null);
      }}
      projectId={projectId}
      dataset={previewTarget}
      cachedRows={
        previewTarget?.isActive ? bundle!.data : undefined
      }
    />
    </>
  );
}

function DefinitionPanel() {
  const { bundle, projectId, refresh } = useProject();
  const lastRun = bundle!.exploreRuns[0];
  const reviewIssues = filterReviewIssues(lastRun?.mergeIssues ?? []);
  const coverageGaps = bundle!.coverage.questionsInDataNotInDefinition.map(
    (name) => ({
      severity: "warn" as const,
      question: name,
      message: "In dataset but missing from definition — run Fix gaps",
    }),
  );
  const notInSav = new Set(
    bundle!.coverage.questionsInDefinitionNotInData.map((n) =>
      n.toUpperCase(),
    ),
  );
  const questionsInDataset = new Set(
    bundle!.definition.Questions.filter(
      (q) => !notInSav.has(q.Name.toUpperCase()),
    ).map((q) => q.Name.toUpperCase()),
  );
  const exploreAnswerGaps =
    bundle!.workflow?.explorePreflight?.answerGaps ?? [];
  const postExploreConfigGaps = (lastRun?.configurationGaps ?? []).map((g) => ({
    severity: "warn" as const,
    question: g.question,
    message: g.reason,
  }));
  const notInSavIssues = exploreAnswerGaps.map((g) => ({
    severity: "warn" as const,
    question: g.question,
    message: g.reason,
  }));

  async function fixGaps() {
    const id = toast.loading("Filling definition gaps...");
    const res = await fetch(`/api/projects/${projectId}/fix-gaps`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.ok) {
      const updated = (data.updated as string[] | undefined)?.length ?? 0;
      toast.success(
        `Added ${data.added?.length ?? 0}, updated ${updated} question(s)`,
        { id },
      );
    } else {
      toast.error(data.error, { id });
    }
    await refresh();
  }

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <CardTitle>Question definition</CardTitle>
            <HelpTip
              content={
                <div className="space-y-2">
                  <TipText>
                    The questionnaire blueprint used by Explore and live workers.
                  </TipText>
                  <TipItem title="Maintain">
                    Answers come from active dataset rows (SAV columns).
                  </TipItem>
                  <TipItem title="Fixed / Split">
                    For questions only found in Explore — set a fixed code or
                    weighted split.
                  </TipItem>
                </div>
              }
            />
          </div>
          <CardDescription>
            {bundle!.definition.Questions.length} questions ·{" "}
            <strong>Maintain</strong> uses dataset rows ·{" "}
            <strong>Fixed</strong> or <strong>Split</strong> for questions not in
            the active dataset
          </CardDescription>
          {bundle!.activeDataset && (
            <p className="line-clamp-2 text-xs leading-snug break-all text-muted-foreground">
              Active dataset:{" "}
              <span
                className="font-medium text-foreground"
                title={bundle!.activeDataset.name}
              >
                {bundle!.activeDataset.name}
              </span>
              <span>
                {" "}
                · {bundle!.activeDataset.rowCount.toLocaleString()} rows
              </span>
            </p>
          )}
        </div>
        <ActionWithHelp
          help={
            <>
              Scans the active SAV for columns that are not yet in
              Definition.json and adds them automatically with types inferred
              from the data. Run this after importing a dataset — it does not
              change questions already in the definition.
            </>
          }
        >
          <Button variant="outline" size="lg" onClick={fixGaps}>
            <Wrench className="mr-2 size-5" />
            Fix gaps
          </Button>
        </ActionWithHelp>
      </CardHeader>
      <CardContent className="space-y-3">
        <ReviewItemsPanel
          title="Missing from definition (SAV)"
          issues={coverageGaps}
          variant="destructive"
        />
        <ReviewItemsPanel
          title="Not in dataset — configure answer policy"
          issues={notInSavIssues}
          variant="destructive"
        />
        <ReviewItemsPanel
          title="Discovered — needs configuration"
          issues={postExploreConfigGaps}
          variant="destructive"
        />
        <ReviewItemsPanel
          title="Review from last explore"
          issues={reviewIssues}
        />
        <ScrollArea className="h-[520px] rounded-lg border">
          <DefinitionQuestionTable
            questions={bundle!.definition.Questions}
            projectId={projectId}
            questionsInDataset={questionsInDataset}
            onUpdated={refresh}
          />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ExplorePanel() {
  const { bundle, projectId, refresh } = useProject();
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [consoleLines, setConsoleLines] = useState<ExploreConsoleLine[]>([]);
  const lineId = useRef(0);
  const exploreAbortRef = useRef<AbortController | null>(null);

  function appendLine(
    level: ExploreConsoleLine["level"],
    message: string,
    ts?: string,
  ) {
    lineId.current += 1;
    setConsoleLines((prev) => [
      ...prev,
      {
        id: String(lineId.current),
        level,
        message,
        ts: ts ?? new Date().toISOString(),
      },
    ]);
  }

  async function runExplore() {
    if (running) return;
    setRunning(true);
    setStopping(false);
    setConsoleLines([]);
    lineId.current = 0;
    const abortController = new AbortController();
    exploreAbortRef.current = abortController;

    try {
      const res = await fetch(`/api/projects/${projectId}/explore`, {
        method: "POST",
        signal: abortController.signal,
      });

      if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json();
        appendLine("error", data.error ?? "Explore failed");
        toast.error(data.error ?? "Explore failed");
        return;
      }

      await consumeExploreStream(
        res,
        (event) => {
          if (event.type === "log") {
            appendLine(event.level, event.message, event.ts);
          } else if (event.type === "error") {
            appendLine("error", event.error);
            toast.error(event.error);
          } else if (event.type === "done") {
            if (event.status === "partial" && event.blockers?.length) {
              const blocker = event.blockers[0];
              if (blocker.type === "stopped") {
                toast.info(
                  `Stopped at ${blocker.question} — ${blocker.reason}`,
                  { duration: 8000 },
                );
              } else {
                toast.warning(
                  `Partial explore: ${event.discovered} questions, blocked at ${blocker.question}`,
                );
              }
            } else {
              toast.success(
                `Found ${event.discovered} questions · +${event.added?.length ?? 0} new`,
              );
            }
          }
        },
        { signal: abortController.signal },
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        appendLine("warn", "Explore stopped");
      } else {
        const message = e instanceof Error ? e.message : "Explore failed";
        appendLine("error", message);
        toast.error(message);
      }
    } finally {
      exploreAbortRef.current = null;
      setRunning(false);
      setStopping(false);
      await refresh();
    }
  }

  async function stopExplore() {
    if (!running || stopping) return;
    setStopping(true);
    appendLine("warn", "Stopping explore…");
    try {
      await fetch(`/api/projects/${projectId}/explore`, { method: "DELETE" });
    } catch {
      // server may still be shutting down the browser
    }
    exploreAbortRef.current?.abort();
  }

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>Explore</CardTitle>
            <HelpTip
              content={
                <>
                  Opens the test link in a browser using dataset rows from Setup.
                  Each question encountered is classified and merged into
                  Definition.json. Saves a trail CSV per run. Stop anytime —
                  partial runs still add discovered questions.
                </>
              }
            />
          </div>
          <CardDescription>
            Opens the test link using dataset row(s) from Setup, detects each
            question, and merges structure into Definition.json. Each explore run
            saves a CSV with one row per interview pass and question answers as
            columns.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {running && (
            <Button
              size="lg"
              variant="outline"
              onClick={() => void stopExplore()}
              disabled={stopping}
            >
              <Square className="mr-2 size-5 fill-current" />
              {stopping ? "Stopping…" : "Stop"}
            </Button>
          )}
          <LoadingButton
            size="lg"
            onClick={() => void runExplore()}
            loading={running}
            loadingText="Exploring…"
            disabled={
              !bundle!.project.testLink ||
              !bundle!.activeDataset ||
              bundle!.activeDataset.rowCount === 0 ||
              !bundle!.workflow?.explorePreflight?.ready ||
              stopping
            }
          >
            <Compass className="mr-2 size-5" />
            Run explore
          </LoadingButton>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {bundle!.workflow?.explorePreflight && (
          <ExplorePreflightCard preflight={bundle!.workflow.explorePreflight} />
        )}
        {!bundle!.activeDataset && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Import and activate a SAV dataset before exploring — guided explore
            requires dataset rows for answers.
          </p>
        )}
        {!bundle!.workflow?.explorePreflight?.ready &&
          bundle!.activeDataset && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Complete pre-flight checks in Setup before exploring — questions
              not in the dataset need a fixed answer or Split weights in
              Definition.
            </p>
          )}
        <ExploreConsole lines={consoleLines} running={running || stopping} />

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Past runs ({bundle!.exploreRuns.length})
          </h3>
          {bundle!.exploreRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center text-muted-foreground">
              <Compass className="mx-auto mb-3 size-8 opacity-40" />
              <p className="text-sm">No explore runs yet</p>
              <p className="mt-1 text-xs">Set a test link in Setup first</p>
            </div>
          ) : (
            <ExploreRunsTable
              runs={bundle!.exploreRuns}
              projectId={projectId}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function buildProfileAssignments(
  rowAssignments: Record<number, string>,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [rowKey, profileId] of Object.entries(rowAssignments)) {
    if (!profileId) continue;
    if (!out[profileId]) out[profileId] = [];
    out[profileId].push(Number(rowKey));
  }
  return out;
}

function RunPanel() {
  const { bundle, projectId, workers, refresh } = useProject();
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [assignmentMode, setAssignmentMode] = useState<"auto" | "manual">("auto");
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const [rowAssignments, setRowAssignments] = useState<Record<number, string>>({});
  const [starting, setStarting] = useState(false);
  const [resettingQueue, setResettingQueue] = useState(false);
  const preflight = bundle!.workflow?.liveRunPreflight;
  const profiles = bundle!.project.workerProfiles ?? [];
  const queue = bundle!.queueSummary;

  const projectWorkers = workers.filter((w) => w.projectId === projectId);
  const liveConsoleWorkers = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return projectWorkers.filter(
      (w) =>
        w.status === "running" ||
        (w.finishedAt && new Date(w.finishedAt).getTime() >= cutoff),
    );
  }, [projectWorkers]);
  const profileLabelById = Object.fromEntries(
    profiles.map((p) => [p.id, p.label || p.id]),
  );

  const assignableRows =
    queue?.rows.filter((row) => row.status !== "completed") ?? [];

  function toggleProfile(id: string) {
    setSelectedProfiles((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function openManualAssignmentSheet() {
    const initial: Record<number, string> = {};
    for (const row of assignableRows) {
      initial[row.index] = row.assignedProfileId ?? "";
    }
    setRowAssignments(initial);
    setAssignSheetOpen(true);
  }

  function distributeRowsEvenly() {
    if (selectedProfiles.length === 0) return;
    const pending = assignableRows
      .filter((row) => row.status === "pending" || row.status === "failed")
      .map((row) => row.index);
    const next: Record<number, string> = { ...rowAssignments };
    pending.forEach((rowIndex, i) => {
      next[rowIndex] = selectedProfiles[i % selectedProfiles.length];
    });
    setRowAssignments(next);
  }

  function handleStartClick() {
    if (selectedProfiles.length === 0) {
      toast.error("Select at least one worker profile");
      return;
    }
    if (assignmentMode === "manual") {
      openManualAssignmentSheet();
      return;
    }
    void startWorkers();
  }

  async function startWorkers(assignments?: Record<string, number[]>) {
    setStarting(true);
    const id = toast.loading("Starting workers...");
    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          workerProfileIds: selectedProfiles,
          assignmentMode,
          assignments,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Started ${data.workers?.length ?? 0} workers`, { id });
        setAssignSheetOpen(false);
      } else {
        toast.error(data.error, { id });
      }
      await refresh();
    } finally {
      setStarting(false);
    }
  }

  function confirmManualStart() {
    const assignments = buildProfileAssignments(rowAssignments);
    const assignedCount = Object.values(assignments).reduce(
      (sum, rows) => sum + rows.length,
      0,
    );
    if (assignedCount === 0) {
      toast.error("Assign at least one row to a caller");
      return;
    }
    void startWorkers(assignments);
  }

  async function stopWorker(workerId: string) {
    const res = await fetch(`/api/workers/${workerId}`, { method: "DELETE" });
    if (res.ok) toast.success("Stop signal sent");
    else toast.error("Failed to stop worker");
    await refresh();
  }

  async function resetFailedRows() {
    if (resettingQueue) return;
    setResettingQueue(true);
    const id = toast.loading("Resetting failed rows...");
    try {
      const res = await fetch(`/api/projects/${projectId}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statuses: ["failed", "in_progress"] }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Reset ${data.resetCount ?? 0} row(s)`, { id });
      } else {
        toast.error(data.error, { id });
      }
      await refresh();
    } finally {
      setResettingQueue(false);
    }
  }

  const canStart =
    Boolean(bundle!.activeDataset) &&
    Boolean(bundle!.project.liveLink) &&
    Boolean(preflight?.ready) &&
    selectedProfiles.length > 0 &&
    !starting;

  return (
    <>
    <Card className="border-none shadow-md">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Interview workers</CardTitle>
          <HelpTip
            content={
              <>
                Each selected caller profile starts a Playwright worker that logs
                into NV live, claims rows from the queue, and replays interviews
                using SAV answers with realistic LOI timing.
              </>
            }
          />
        </div>
        <CardDescription>
          Live workers login once, claim rows from the queue, and run interviews
          with LOI timing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {preflight && (
          <ExplorePreflightCard preflight={preflight} title="Live run pre-flight" />
        )}

        <section className="space-y-4 rounded-xl border p-4">
          <div>
            <LabelWithHelp help="Choose which caller credentials to start. Each runs in its own browser until the queue is empty or you stop it.">
              <span className="text-base font-semibold">Start workers</span>
            </LabelWithHelp>
            <p className="mt-1 text-sm text-muted-foreground">
              Select profiles, choose how rows are assigned, then start.
            </p>
          </div>

          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add caller profiles in Setup before starting workers.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {profiles.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={selectedProfiles.includes(p.id)}
                    onChange={() => toggleProfile(p.id)}
                  />
                  <span className="font-medium">{p.label}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {p.id}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <LabelWithHelp
              help={
                <div className="space-y-2">
                  <TipItem title="Auto">
                    Workers share one queue and claim the next pending row.
                  </TipItem>
                  <TipItem title="Manual">
                    You assign specific rows to each caller before starting;
                    unassigned rows are skipped for that run.
                  </TipItem>
                </div>
              }
            >
              Row assignment
            </LabelWithHelp>
            <FilterSegment
              value={assignmentMode}
              onChange={(value) =>
                setAssignmentMode(value as "auto" | "manual")
              }
              options={[
                { value: "auto", label: "Auto queue" },
                { value: "manual", label: "Manual assign" },
              ]}
            />
          </div>

          <LoadingButton
            size="lg"
            onClick={handleStartClick}
            loading={starting}
            loadingText="Starting…"
            disabled={!canStart}
          >
            <Play className="mr-2 size-5" />
            {assignmentMode === "manual" ? "Assign rows & start" : "Start selected workers"}
          </LoadingButton>
        </section>

        <section className="space-y-3">
          <LabelWithHelp help="Live stdout from each caller worker. Logs refresh every few seconds while workers are running.">
            <span className="text-base font-semibold">Caller console</span>
          </LabelWithHelp>
          <WorkerConsole
            workers={liveConsoleWorkers}
            onStop={(id) => void stopWorker(id)}
          />
        </section>

        {queue && queue.rows.length > 0 && (
          <section className="space-y-3">
            <LabelWithHelp help="One row per SAV case. Sort columns and filter by status in the toolbar above the table.">
              <span className="text-base font-semibold">Interview queue</span>
            </LabelWithHelp>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {queue.pending} {formatStatusLabel("pending")}
              </Badge>
              <Badge variant="default">
                {queue.in_progress} {formatStatusLabel("in_progress")}
              </Badge>
              <Badge variant="outline">
                {queue.completed} {formatStatusLabel("completed")}
              </Badge>
              <Badge variant="destructive">
                {queue.failed} {formatStatusLabel("failed")}
              </Badge>
              {queue.skipped > 0 && (
                <Badge variant="secondary" className="opacity-70">
                  {queue.skipped} {formatStatusLabel("skipped")}
                </Badge>
              )}
              {(queue.failed > 0 || queue.in_progress > 0) && (
                <LoadingButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  loading={resettingQueue}
                  loadingText="Resetting…"
                  onClick={() => void resetFailedRows()}
                >
                  Reset failed / stuck
                </LoadingButton>
              )}
            </div>

            <InterviewQueueTable
              rows={queue.rows}
              profileLabelById={profileLabelById}
              projectId={projectId}
              onUpdated={refresh}
            />
          </section>
        )}

        {liveConsoleWorkers.length === 0 && (!queue || queue.rows.length === 0) && (
          <div className="rounded-xl border border-dashed py-10 text-center text-muted-foreground">
            <Play className="mx-auto mb-3 size-8 opacity-40" />
            <p className="text-sm">No active workers</p>
          </div>
        )}
      </CardContent>
    </Card>

    <ManualAssignmentSheet
      open={assignSheetOpen}
      onOpenChange={setAssignSheetOpen}
      rows={queue?.rows ?? []}
      selectedProfileIds={selectedProfiles}
      profileLabelById={profileLabelById}
      rowAssignments={rowAssignments}
      onRowAssignmentsChange={setRowAssignments}
      onDistributeEvenly={distributeRowsEvenly}
      onClear={() => setRowAssignments({})}
      onConfirm={confirmManualStart}
      starting={starting}
    />
    </>
  );
}
