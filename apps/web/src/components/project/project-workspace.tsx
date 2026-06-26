"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ChevronRight,
  Compass,
  Database,
  FileStack,
  ListTree,
  Play,
  RefreshCw,
  Save,
  Settings2,
  Square,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
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
import { consumeExploreStream } from "@/lib/explore-stream";
import type { ProjectSection } from "@/lib/types";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WorkflowProgress } from "@/components/project/workflow-progress";
import { DefinitionQuestionTable } from "@/components/project/definition-question-table";
import { ExplorePreflightCard } from "@/components/project/explore-preflight-card";
import {
  ReviewItemsPanel,
  filterReviewIssues,
} from "@/components/project/review-items-panel";

const fieldClass = "h-11 text-base";

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
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-muted/15 p-5 md:p-6">
      <div className="space-y-1 border-b border-border/60 pb-4">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
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
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="size-8 animate-pulse rounded-full bg-muted" />
          <p className="text-base">Loading project...</p>
        </div>
      </div>
    );
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
      <div className="space-y-8 p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Questions"
            value={bundle.definition.Questions.length}
            icon={ListTree}
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
          />
        </div>

        {bundle.workflow && (
          <Card className="border-none shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Freestyle workflow</CardTitle>
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
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settings, setSettings] = useState({
    name: bundle!.project.name,
    liveLink: bundle!.project.liveLink,
    testLink: bundle!.project.testLink,
    loiTargetMinutes: bundle!.project.loiTargetMinutes,
    loiJitterPercent: bundle!.project.loiJitterPercent,
    maxWorkers: bundle!.project.maxWorkers,
    exploreSeedRowIndex: bundle!.project.exploreSeedRowIndex ?? 0,
    exploreRowCount: bundle!.project.exploreRowCount ?? 1,
    exploreEndQuestionsText: (bundle!.project.exploreEndQuestions ?? ["ANMER"]).join(
      ", ",
    ),
  });

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    toast.loading("Saving settings...");
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
        maxWorkers: settings.maxWorkers,
        exploreSeedRowIndex: settings.exploreSeedRowIndex,
        exploreRowCount: Math.max(1, settings.exploreRowCount),
        exploreEndQuestions:
          exploreEndQuestions.length > 0 ? exploreEndQuestions : ["ANMER"],
        mode: "Freestyle",
      }),
    });
    if (res.ok) {
      toast.success("Settings saved");
    } else {
      toast.error((await res.json()).error);
    }
    await refresh();
  }

  async function handleDeleteProject() {
    setDeleting(true);
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      toast.error((await res.json()).error ?? "Failed to delete project");
      return;
    }
    toast.success("Project deleted");
    setDeleteOpen(false);
    router.push("/");
    router.refresh();
  }

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
          >
            <div className="space-y-2 md:col-span-2">
              <Label>Live link</Label>
              <Input
                className={fieldClass}
                value={settings.liveLink}
                onChange={(e) =>
                  setSettings({ ...settings, liveLink: e.target.value })
                }
                placeholder="https://nv25.ffind.com/nv_rev2/login.php"
              />
              <p className="text-sm text-muted-foreground">
                Station, password, ID, and project are filled from each SAV row
                (see <code className="text-xs">savFieldMap</code> in project.json).
                Group and mode use the page default.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Test link</Label>
              <Input
                className={fieldClass}
                value={settings.testLink}
                onChange={(e) =>
                  setSettings({ ...settings, testLink: e.target.value })
                }
                placeholder="https://nv25.ffind.com/nv_rev2/test.php?token=..."
              />
              <p className="text-sm text-muted-foreground">
                Opens the questionnaire preview without a live login — used by
                Explore only.
              </p>
            </div>
          </SetupConfigSection>

          <SetupConfigSection
            title="Guided explore"
            description="Guided explore walks the test link using dataset seed rows. Questions not in the dataset need a fixed answer or split weights in Definition."
          >
            <div className="space-y-2">
              <Label>Explore seed row</Label>
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
              <p className="text-sm text-muted-foreground">
                Row index in the active dataset (0 = first row).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Explore row count</Label>
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
              <p className="text-sm text-muted-foreground">
                Consecutive dataset rows to walk per explore run, starting at
                the seed row. Each row opens a fresh test-link pass until an end
                question (e.g. ANMER).
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Explore end questions</Label>
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
            title="Interview runs"
            description="Timing and concurrency when cloning live interviews from SAV rows."
          >
            <div className="space-y-2">
              <Label>Target LOI (minutes)</Label>
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
              <Label>LOI jitter %</Label>
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
            <div className="space-y-2 md:col-span-2">
              <Label>Max concurrent workers</Label>
              <Input
                type="number"
                min={1}
                className={`max-w-xs ${fieldClass}`}
                value={settings.maxWorkers}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxWorkers: Number(e.target.value),
                  })
                }
              />
            </div>
          </SetupConfigSection>

          <div className="flex justify-start border-t pt-6">
            <Button type="submit" size="lg">
              <Save className="mr-2 size-5" />
              Save settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>

    <Card className="border-destructive/30 shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl text-destructive">Danger zone</CardTitle>
        <CardDescription className="text-base">
          Permanently delete this project and all datasets, definitions, and
          explore history on disk.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="mr-2 size-5" />
          Delete project
        </Button>
      </CardContent>
    </Card>

    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project?</DialogTitle>
          <DialogDescription>
            This will permanently remove <strong>{bundle!.project.name}</strong>{" "}
            and everything under <code>projects/{projectId}</code>. This cannot
            be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleDeleteProject()}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function DatasetsPanel() {
  const { bundle, projectId, refresh } = useProject();
  const [datasetName, setDatasetName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    isActive: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function uploadSav(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("name", datasetName || file.name.replace(/\.sav$/i, ""));
    const id = toast.loading("Importing SAV...");
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
        <CardTitle className="text-xl">Dataset library</CardTitle>
        <CardDescription className="text-base">
          Each upload is stored in <code className="text-sm">projects/{projectId}/datasets/</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-dashed bg-muted/30 p-6">
          <div className="space-y-2">
            <Label className="text-base">Dataset name</Label>
            <Input
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="wave-1-profiles"
              className={`w-64 bg-background ${fieldClass}`}
            />
          </div>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border bg-primary px-5 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
            <Upload className="size-5" />
            Upload .sav
            <input
              type="file"
              accept=".sav"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadSav(f);
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
          <CardTitle>Question definition</CardTitle>
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
        <Button variant="outline" size="lg" onClick={fixGaps}>
          <Wrench className="mr-2 size-5" />
          Fix gaps
        </Button>
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
          <CardTitle>Explore</CardTitle>
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
          <Button
            size="lg"
            onClick={() => void runExplore()}
            disabled={
              !bundle!.project.testLink ||
              !bundle!.activeDataset ||
              bundle!.activeDataset.rowCount === 0 ||
              !bundle!.workflow?.explorePreflight?.ready ||
              running
            }
          >
            <Compass className="mr-2 size-5" />
            {running ? "Exploring…" : "Run explore"}
          </Button>
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

        <div className="space-y-2">
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
          bundle!.exploreRuns.map((run, index) => (
            <details
              key={run.id}
              open={index === 0}
              className="group rounded-xl border bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {new Date(run.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-0.5 min-w-0 text-xs text-muted-foreground">
                    {run.discoveredNames?.length ? (
                      <ExploreQuestionRoute
                        names={run.discoveredNames}
                        compact
                      />
                    ) : (
                      `${run.discovered} question(s)`
                    )}
                    {run.blockers?.[0]
                      ? run.blockers[0].type === "stopped"
                        ? ` · stopped at ${run.blockers[0].question}`
                        : ` · blocked at ${run.blockers[0].question}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {run.status === "partial" ? (
                    <Badge variant="outline">Partial</Badge>
                  ) : (
                    <Badge variant="secondary">Complete</Badge>
                  )}
                  <Badge variant="secondary">{run.discovered} found</Badge>
                  <span className="text-muted-foreground transition-transform group-open:rotate-180">
                    ▾
                  </span>
                </div>
              </summary>
              <div className="space-y-2 border-t px-4 pb-4 pt-3 text-sm">
                {run.discoveredNames && run.discoveredNames.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      Question route
                    </p>
                    <ExploreQuestionRoute names={run.discoveredNames} />
                  </div>
                )}
                <p className="text-muted-foreground">
                  Added {run.added.length} · Updated {run.updated.length}
                  {run.rowsWalked != null && run.rowsWalked > 0
                    ? ` · ${run.rowsWalked} row pass(es)`
                    : ""}
                </p>
                {run.trailCsv && (
                  <p>
                    <a
                      href={`/api/projects/${projectId}/explore-runs/${run.id}/trail`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      download
                    >
                      Download answer trail (CSV)
                    </a>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      explore-cache/{run.trailCsv}
                    </span>
                  </p>
                )}
                {run.added.length > 0 && (
                  <p className="font-mono text-xs text-muted-foreground">
                    + {run.added.join(", ")}
                  </p>
                )}
                {run.updated.length > 0 && (
                  <p className="font-mono text-xs text-muted-foreground">
                    ~ {run.updated.join(", ")}
                  </p>
                )}
                {run.blockers && run.blockers.length > 0 && (
                  <Alert variant="default">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>
                      {run.blockers[0].type === "stopped"
                        ? `Stopped at ${run.blockers[0].question}`
                        : `Blocked at ${run.blockers[0].question}`}
                    </AlertTitle>
                    <AlertDescription className="text-sm">
                      {run.blockers[0].reason}
                      {run.blockers[0].screenshot && (
                        <span className="mt-1 block font-mono text-xs">
                          Screenshot: explore-cache/{run.blockers[0].screenshot}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </details>
          ))
        )}
        </div>
      </CardContent>
    </Card>
  );
}

function RunPanel() {
  const { bundle, projectId, workers, refresh } = useProject();
  const [rowIndex, setRowIndex] = useState(0);
  const [workerCount, setWorkerCount] = useState(1);

  const projectWorkers = workers.filter((w) => w.projectId === projectId);

  async function startWorkers() {
    const indices = Array.from({ length: workerCount }, (_, i) => rowIndex + i);
    const id = toast.loading("Starting workers...");
    const res = await fetch("/api/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, rowIndices: indices }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Started ${data.workers?.length ?? 0} workers`, { id });
    } else {
      toast.error(data.error, { id });
    }
    await refresh();
  }

  return (
    <Card className="border-none shadow-md">
      <CardHeader>
        <CardTitle>Interview workers</CardTitle>
        <CardDescription>
          Playwright runs with LOI timing · cache synced automatically
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-4 rounded-xl bg-muted/40 p-4">
          <div className="space-y-2">
            <Label className="text-base">Start row</Label>
            <Input
              type="number"
              min={0}
              value={rowIndex}
              onChange={(e) => setRowIndex(Number(e.target.value))}
              className={`w-28 bg-background ${fieldClass}`}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-base">Workers</Label>
            <Input
              type="number"
              min={1}
              max={bundle!.project.maxWorkers}
              value={workerCount}
              onChange={(e) => setWorkerCount(Number(e.target.value))}
              className={`w-28 bg-background ${fieldClass}`}
            />
          </div>
          <Button
            size="lg"
            onClick={startWorkers}
            disabled={!bundle!.activeDataset || !bundle!.project.liveLink}
          >
            <Play className="mr-2 size-5" />
            Start workers
          </Button>
        </div>

        {projectWorkers.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-muted-foreground">
            <Play className="mx-auto mb-3 size-8 opacity-40" />
            <p className="text-sm">No active workers</p>
          </div>
        ) : (
          projectWorkers.map((w) => (
            <div key={w.id} className="overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
                <span className="font-mono text-xs">{w.id}</span>
                <Badge
                  variant={
                    w.status === "running"
                      ? "default"
                      : w.status === "completed"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {w.status}
                </Badge>
              </div>
              <pre className="max-h-52 overflow-auto bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
                {w.logs.slice(-40).join("\n") || "Waiting for logs..."}
              </pre>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
