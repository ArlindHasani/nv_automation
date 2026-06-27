"use client";

import { useMemo, useState } from "react";
import type { ColumnDef, Table } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableSelectColumn } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { FilterGroup, FilterSegment } from "@/components/project/filter-group";
import { LoadingButton } from "@/components/ui/loading-button";
import type { InterviewQueueRowView } from "@/lib/types";
import { formatStatusLabel } from "@/lib/format-labels";
import { toast } from "sonner";

function RowStatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed"
      ? "outline"
      : status === "failed"
        ? "destructive"
        : status === "in_progress"
          ? "default"
          : "secondary";

  return (
    <Badge variant={variant} className={status === "skipped" ? "opacity-60" : ""}>
      {formatStatusLabel(status)}
    </Badge>
  );
}

type QueueRow = InterviewQueueRowView & {
  callerLabel: string;
  searchText: string;
};

interface InterviewQueueTableProps {
  rows: InterviewQueueRowView[];
  profileLabelById: Record<string, string>;
  projectId: string;
  onUpdated?: () => void | Promise<void>;
}

export function InterviewQueueTable({
  rows,
  profileLabelById,
  projectId,
  onUpdated,
}: InterviewQueueTableProps) {
  const [bulkLoading, setBulkLoading] = useState<"skip" | "unskip" | null>(null);

  const tableData = useMemo<QueueRow[]>(
    () =>
      rows.map((row) => {
        const callerId = row.workerProfileId ?? row.assignedProfileId;
        const callerLabel = callerId
          ? profileLabelById[callerId] ?? callerId
          : "—";
        return {
          ...row,
          callerLabel,
          searchText: [
            row.index,
            row.quest ?? "",
            row.status,
            callerLabel,
          ].join(" "),
        };
      }),
    [rows, profileLabelById],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const statusOrder = [
    "pending",
    "in_progress",
    "completed",
    "failed",
    "skipped",
  ] as const;

  const columns = useMemo<ColumnDef<QueueRow>[]>(
    () => [
      DataTableSelectColumn<QueueRow>(),
      {
        accessorKey: "index",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Row" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.getValue("index")}</span>
        ),
      },
      {
        accessorKey: "quest",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Quest" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.getValue("quest") ?? "—"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => <RowStatusBadge status={row.getValue("status")} />,
        filterFn: (row, id, value) => {
          if (!value || value === "all") return true;
          return row.getValue(id) === value;
        },
      },
      {
        accessorKey: "callerLabel",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Caller" />
        ),
        cell: ({ row }) => (
          <span className="text-xs">{row.getValue("callerLabel")}</span>
        ),
      },
    ],
    [],
  );

  async function bulkUpdate(
    table: Table<QueueRow>,
    action: "skip" | "unskip",
  ) {
    const indices = table
      .getFilteredSelectedRowModel()
      .rows.map((row) => row.original.index);

    if (indices.length === 0) return;

    setBulkLoading(action);
    try {
      const res = await fetch(`/api/projects/${projectId}/queue`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, indices }),
      });
      const data = await res.json();
      if (res.ok) {
        const count = data.updatedCount ?? 0;
        if (count === 0) {
          toast.warning(
            action === "skip"
              ? "No rows updated — only pending or failed rows can be skipped"
              : "No rows updated — only skipped rows can be restored",
          );
        } else {
          toast.success(
            `${action === "skip" ? "Skipped" : "Restored"} ${count} row(s)`,
          );
        }
        table.resetRowSelection();
        await onUpdated?.();
      } else {
        toast.error(data.error ?? "Failed to update queue");
      }
    } finally {
      setBulkLoading(null);
    }
  }

  return (
    <DataTable
      columns={columns}
      data={tableData}
      searchPlaceholder="Search rows…"
      emptyMessage="No rows match your filters."
      pagination
      defaultPageSize={25}
      enableRowSelection
      enableColumnVisibility
      getRowId={(row) => String(row.index)}
      globalFilterFn={(row, _columnId, filterValue) => {
        const q = String(filterValue).toLowerCase();
        if (!q) return true;
        return row.original.searchText.toLowerCase().includes(q);
      }}
      toolbarExtra={(table) => {
        const statusCol = table.getColumn("status");
        const statusValue =
          (statusCol?.getFilterValue() as string | undefined) ?? "all";

        const statusOptions = [
          { value: "all", label: "All", count: rows.length },
          ...statusOrder
            .filter((s) => statusCounts[s])
            .map((status) => ({
              value: status,
              label: formatStatusLabel(status),
              count: statusCounts[status],
            })),
        ];

        return (
          <FilterGroup label="Status" layout="inline">
            <FilterSegment
              value={statusValue}
              onChange={(value) => {
                statusCol?.setFilterValue(value === "all" ? undefined : value);
                table.setPageIndex(0);
              }}
              options={statusOptions}
            />
          </FilterGroup>
        );
      }}
      footerExtra={(table) => (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
          <LoadingButton
            type="button"
            variant="outline"
            size="sm"
            loading={bulkLoading === "skip"}
            loadingText="Skipping…"
            onClick={() => void bulkUpdate(table, "skip")}
          >
            Skip selected
          </LoadingButton>
          <LoadingButton
            type="button"
            variant="outline"
            size="sm"
            loading={bulkLoading === "unskip"}
            loadingText="Restoring…"
            onClick={() => void bulkUpdate(table, "unskip")}
          >
            Restore selected
          </LoadingButton>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => table.resetRowSelection()}
          >
            Clear selection
          </Button>
        </div>
      )}
    />
  );
}
