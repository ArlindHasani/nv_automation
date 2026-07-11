"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { FilterGroup, FilterSegment } from "@/components/project/filter-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ProjectBundle } from "@/lib/types";

type LiveRun = ProjectBundle["liveRuns"][number];

type LiveRunRow = LiveRun & {
  searchText: string;
  dateMs: number;
};

interface LiveRunsTableProps {
  runs: LiveRun[];
  projectId: string;
}

export function LiveRunsTable({ runs, projectId }: LiveRunsTableProps) {
  const [detailRun, setDetailRun] = useState<LiveRun | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [callerFilter, setCallerFilter] = useState("all");

  const callers = useMemo(() => {
    const map = new Map<string, string>();
    for (const run of runs) {
      map.set(run.workerProfileId, run.workerProfileLabel || run.workerProfileId);
    }
    return [...map.entries()];
  }, [runs]);

  const tableData = useMemo<LiveRunRow[]>(
    () =>
      runs.map((run) => ({
        ...run,
        dateMs: new Date(run.createdAt).getTime(),
        searchText: [
          run.id,
          run.workerProfileLabel,
          run.workerProfileId,
          run.status,
          run.lastQuestion ?? "",
          run.lastQuest ?? "",
          run.error ?? "",
        ].join(" "),
      })),
    [runs],
  );

  const filtered = useMemo(
    () =>
      callerFilter === "all"
        ? tableData
        : tableData.filter((r) => r.workerProfileId === callerFilter),
    [tableData, callerFilter],
  );

  const columns = useMemo<ColumnDef<LiveRunRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {new Date(row.getValue("createdAt")).toLocaleString()}
          </span>
        ),
        sortingFn: (a, b) => a.original.dateMs - b.original.dateMs,
      },
      {
        accessorKey: "workerProfileLabel",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Caller" />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.workerProfileLabel}</span>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const status = row.original.status;
          const variant =
            status === "failed"
              ? "destructive"
              : status === "partial" || status === "stopped"
                ? "secondary"
                : "default";
          return (
            <Badge variant={variant} className="capitalize">
              {status}
            </Badge>
          );
        },
      },
      {
        id: "counts",
        header: "IVs",
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.interviewsCompleted} ok / {row.original.interviewsFailed}{" "}
            fail
          </span>
        ),
      },
      {
        accessorKey: "lastQuestion",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Last Q" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.lastQuestion ?? "—"}
          </span>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDetailRun(row.original);
              setDetailOpen(true);
            }}
          >
            <Eye className="size-4" />
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      {callers.length > 1 && (
        <FilterGroup label="Caller">
          <FilterSegment
            value={callerFilter}
            onChange={setCallerFilter}
            options={[
              { value: "all", label: "All callers" },
              ...callers.map(([id, label]) => ({ value: id, label })),
            ]}
          />
        </FilterGroup>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="No live runs yet. Start a worker to record history."
      />

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          {detailRun && (
            <>
              <SheetHeader className="shrink-0 space-y-2 border-b px-6 py-5">
                <SheetTitle>{detailRun.workerProfileLabel}</SheetTitle>
                <SheetDescription>
                  {new Date(detailRun.createdAt).toLocaleString()} ·{" "}
                  <span className="capitalize">{detailRun.status}</span>
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-muted-foreground">Completed</p>
                    <p className="font-mono">{detailRun.interviewsCompleted}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Failed</p>
                    <p className="font-mono">{detailRun.interviewsFailed}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Steps</p>
                    <p className="font-mono">{detailRun.steps ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last question</p>
                    <p className="font-mono">{detailRun.lastQuestion ?? "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Quest</p>
                    <p className="font-mono">{detailRun.lastQuest ?? "—"}</p>
                  </div>
                </div>
                {detailRun.error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                    {detailRun.error}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {detailRun.trailCsv ? (
                    <a
                      className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                      href={`/api/projects/${projectId}/live-runs/${detailRun.id}/trail?kind=csv`}
                    >
                      <Download className="mr-1.5 size-3.5" />
                      Timed CSV
                    </a>
                  ) : null}
                  {detailRun.trailWideCsv ? (
                    <a
                      className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                      href={`/api/projects/${projectId}/live-runs/${detailRun.id}/trail?kind=wide`}
                    >
                      <Download className="mr-1.5 size-3.5" />
                      Wide CSV
                    </a>
                  ) : null}
                  {detailRun.logFile ? (
                    <a
                      className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                      href={`/api/projects/${projectId}/live-runs/${detailRun.id}/trail?kind=log`}
                    >
                      <Download className="mr-1.5 size-3.5" />
                      Worker log
                    </a>
                  ) : null}
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {detailRun.id}
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
