"use client";

import { AlertTriangle, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ProjectBundle } from "@/lib/types";

type ExploreRun = ProjectBundle["exploreRuns"][number];

function ExploreQuestionRoute({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-xs">
      {names.map((name, index) => (
        <span key={`${name}-${index}`}>
          {index > 0 ? " → " : ""}
          {name}
        </span>
      ))}
    </span>
  );
}

interface ExploreRunDetailSheetProps {
  run: ExploreRun | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExploreRunDetailSheet({
  run,
  projectId,
  open,
  onOpenChange,
}: ExploreRunDetailSheetProps) {
  if (!run) return null;

  const statusLabel =
    run.status === "partial"
      ? "Partial"
      : run.blockers?.[0]?.type === "stopped"
        ? "Stopped"
        : "Complete";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 space-y-2 border-b px-6 py-5">
          <SheetTitle>Explore run</SheetTitle>
          <SheetDescription>
            {new Date(run.createdAt).toLocaleString()}
          </SheetDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant={run.status === "partial" ? "outline" : "secondary"}>
              {statusLabel}
            </Badge>
            <Badge variant="secondary">{run.discovered} discovered</Badge>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm">
          {run.discoveredNames && run.discoveredNames.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium">Question route</p>
              <ExploreQuestionRoute names={run.discoveredNames} />
            </div>
          ) : null}

          <p className="text-muted-foreground">
            Added {run.added.length} · Updated {run.updated.length}
            {run.rowsWalked != null && run.rowsWalked > 0
              ? ` · ${run.rowsWalked} row pass(es)`
              : ""}
          </p>

          {run.trailCsv ? (
            <a
              href={`/api/projects/${projectId}/explore-runs/${run.id}/trail`}
              download
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            >
              <Download className="size-4" />
              Download answer trail (CSV)
            </a>
          ) : null}

          {run.added.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium">Added questions</p>
              <p className="font-mono text-xs leading-relaxed text-muted-foreground">
                {run.added.join(", ")}
              </p>
            </div>
          ) : null}

          {run.updated.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium">Updated questions</p>
              <p className="font-mono text-xs leading-relaxed text-muted-foreground">
                {run.updated.join(", ")}
              </p>
            </div>
          ) : null}

          {run.blockers && run.blockers.length > 0 ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>
                {run.blockers[0].type === "stopped"
                  ? `Stopped at ${run.blockers[0].question}`
                  : `Blocked at ${run.blockers[0].question}`}
              </AlertTitle>
              <AlertDescription className="text-sm">
                {run.blockers[0].reason}
                {run.blockers[0].screenshot ? (
                  <span className="mt-1 block font-mono text-xs">
                    Screenshot: explore-cache/{run.blockers[0].screenshot}
                  </span>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
