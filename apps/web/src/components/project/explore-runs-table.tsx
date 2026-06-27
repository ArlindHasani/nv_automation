"use client";

import { useMemo, useState } from "react";
import type { ColumnDef, Table } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { FilterGroup, FilterSegment } from "@/components/project/filter-group";
import { ExploreRunDetailSheet } from "@/components/project/explore-run-detail-sheet";
import type { ProjectBundle } from "@/lib/types";

type ExploreRun = ProjectBundle["exploreRuns"][number];

type ExploreRunRow = ExploreRun & {
  searchText: string;
  statusLabel: string;
  dateMs: number;
};

function runStatusLabel(run: ExploreRun): string {
  if (run.status === "partial") return "partial";
  if (run.blockers?.[0]?.type === "stopped") return "stopped";
  return "complete";
}

interface ExploreRunsTableProps {
  runs: ExploreRun[];
  projectId: string;
}

export function ExploreRunsTable({ runs, projectId }: ExploreRunsTableProps) {
  const [detailRun, setDetailRun] = useState<ExploreRun | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const tableData = useMemo<ExploreRunRow[]>(
    () =>
      runs.map((run) => ({
        ...run,
        statusLabel: runStatusLabel(run),
        dateMs: new Date(run.createdAt).getTime(),
        searchText: [
          run.id,
          run.createdAt,
          runStatusLabel(run),
          run.discovered,
          ...(run.discoveredNames ?? []),
          ...(run.added ?? []),
          run.blockers?.[0]?.question ?? "",
        ].join(" "),
      })),
    [runs],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const run of tableData) {
      counts[run.statusLabel] = (counts[run.statusLabel] ?? 0) + 1;
    }
    return counts;
  }, [tableData]);

  const columns = useMemo<ColumnDef<ExploreRunRow>[]>(
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
        filterFn: (row, _id, value) => {
          if (!value || value === "all") return true;
          const now = Date.now();
          const age = now - row.original.dateMs;
          if (value === "7d") return age <= 7 * 24 * 60 * 60 * 1000;
          if (value === "30d") return age <= 30 * 24 * 60 * 60 * 1000;
          return true;
        },
      },
      {
        accessorKey: "statusLabel",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
          const status = row.getValue("statusLabel") as string;
          const variant =
            status === "partial"
              ? "outline"
              : status === "stopped"
                ? "secondary"
                : "default";
          return (
            <Badge variant={variant} className="capitalize">
              {status}
            </Badge>
          );
        },
        filterFn: (row, id, value) => {
          if (!value || value === "all") return true;
          return row.getValue(id) === value;
        },
      },
      {
        accessorKey: "discovered",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Discovered" />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.getValue("discovered")}</span>
        ),
      },
      {
        id: "changes",
        header: "Changes",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            +{row.original.added.length} / ~{row.original.updated.length}
          </span>
        ),
      },
      {
        id: "blocker",
        header: "Blocker",
        enableSorting: false,
        cell: ({ row }) => {
          const blocker = row.original.blockers?.[0];
          if (!blocker) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="font-mono text-xs">{blocker.question}</span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
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
            <Eye className="mr-1 size-4" />
            Details
          </Button>
        ),
      },
    ],
    [],
  );

  function DateFilter({ table }: { table: Table<ExploreRunRow> }) {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    const dateCol = table.getColumn("createdAt");
    const current = (dateCol?.getFilterValue() as string | undefined) ?? "all";

    const options = [
      { value: "all", label: "All time", count: runs.length },
      {
        value: "7d",
        label: "Last 7 days",
        count: tableData.filter((r) => now - r.dateMs <= sevenDays).length,
      },
      {
        value: "30d",
        label: "Last 30 days",
        count: tableData.filter((r) => now - r.dateMs <= thirtyDays).length,
      },
    ];

    return (
      <FilterGroup label="Date" layout="inline">
        <FilterSegment
          value={current}
          onChange={(value) => {
            dateCol?.setFilterValue(value === "all" ? undefined : value);
            table.setPageIndex(0);
          }}
          options={options}
        />
      </FilterGroup>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={tableData}
        searchPlaceholder="Search runs…"
        emptyMessage="No explore runs match your filters."
        pagination
        defaultPageSize={10}
        enableColumnVisibility
        columnVisibilityLabel="Columns"
        getRowId={(row) => row.id}
        globalFilterFn={(row, _columnId, filterValue) => {
          const q = String(filterValue).toLowerCase();
          if (!q) return true;
          return row.original.searchText.toLowerCase().includes(q);
        }}
        toolbarExtra={(table) => {
          const statusCol = table.getColumn("statusLabel");
          const statusValue =
            (statusCol?.getFilterValue() as string | undefined) ?? "all";

          const statusOptions = [
            { value: "all", label: "All", count: runs.length },
            ...(["complete", "partial", "stopped"] as const)
              .filter((s) => statusCounts[s])
              .map((status) => ({
                value: status,
                label: status.charAt(0).toUpperCase() + status.slice(1),
                count: statusCounts[status],
              })),
          ];

          return (
            <>
              <DateFilter table={table} />
              <FilterGroup label="Status" layout="inline">
                <FilterSegment
                  value={statusValue}
                  onChange={(value) => {
                    statusCol?.setFilterValue(
                      value === "all" ? undefined : value,
                    );
                    table.setPageIndex(0);
                  }}
                  options={statusOptions}
                />
              </FilterGroup>
            </>
          );
        }}
      />

      <ExploreRunDetailSheet
        run={detailRun}
        projectId={projectId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
