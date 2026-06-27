"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef, Table } from "@tanstack/react-table";
import { Play, Shuffle, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { FilterGroup, FilterSegment } from "@/components/project/filter-group";
import { HelpTip, LabelWithHelp } from "@/components/project/help-tip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LoadingButton } from "@/components/ui/loading-button";
import type { InterviewQueueRowView } from "@/lib/types";
import { formatStatusLabel } from "@/lib/format-labels";

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

function isAssignableStatus(status: string): boolean {
  return status === "pending" || status === "failed";
}

function AssignPageCheckbox({
  table,
  activeCallerId,
  activeCallerLabel,
  rowAssignments,
  onRowAssignmentsChange,
}: {
  table: Table<AssignmentRow>;
  activeCallerId: string;
  activeCallerLabel: string;
  rowAssignments: Record<number, string>;
  onRowAssignmentsChange: (next: Record<number, string>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const pageRows = table
    .getRowModel()
    .rows.filter((r) => isAssignableStatus(r.original.status));
  const assignedOnPage = pageRows.filter(
    (r) => rowAssignments[r.original.index] === activeCallerId,
  ).length;
  const allOnPage = pageRows.length > 0 && assignedOnPage === pageRows.length;
  const someOnPage = assignedOnPage > 0 && assignedOnPage < pageRows.length;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someOnPage;
  }, [someOnPage]);

  return (
    <Checkbox
      ref={ref}
      checked={allOnPage}
      disabled={!activeCallerId || pageRows.length === 0}
      onCheckedChange={(checked) => {
        const next = { ...rowAssignments };
        for (const row of pageRows) {
          const index = row.original.index;
          if (checked) {
            next[index] = activeCallerId;
          } else if (next[index] === activeCallerId) {
            next[index] = "";
          }
        }
        onRowAssignmentsChange(next);
      }}
      aria-label={`Assign page to ${activeCallerLabel}`}
    />
  );
}

type AssignmentRow = InterviewQueueRowView & {
  callerLabel: string;
  searchText: string;
};

interface ManualAssignmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: InterviewQueueRowView[];
  selectedProfileIds: string[];
  profileLabelById: Record<string, string>;
  rowAssignments: Record<number, string>;
  onRowAssignmentsChange: (next: Record<number, string>) => void;
  onDistributeEvenly: () => void;
  onClear: () => void;
  onConfirm: () => void;
  starting?: boolean;
}

export function ManualAssignmentSheet({
  open,
  onOpenChange,
  rows,
  selectedProfileIds,
  profileLabelById,
  rowAssignments,
  onRowAssignmentsChange,
  onDistributeEvenly,
  onClear,
  onConfirm,
  starting = false,
}: ManualAssignmentSheetProps) {
  const [activeCallerId, setActiveCallerId] = useState(
    () => selectedProfileIds[0] ?? "",
  );

  useEffect(() => {
    if (!open || selectedProfileIds.length === 0) return;
    setActiveCallerId((current) =>
      selectedProfileIds.includes(current) ? current : selectedProfileIds[0],
    );
  }, [open, selectedProfileIds]);

  const assignableRows = useMemo(
    () => rows.filter((row) => row.status !== "completed"),
    [rows],
  );

  const tableData = useMemo<AssignmentRow[]>(
    () =>
      assignableRows.map((row) => {
        const assignedId =
          rowAssignments[row.index] ?? row.assignedProfileId ?? "";
        const callerLabel = assignedId
          ? profileLabelById[assignedId] ?? assignedId
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
    [assignableRows, rowAssignments, profileLabelById],
  );

  const stats = useMemo(() => {
    let assigned = 0;
    let skipped = 0;
    const perProfile = Object.fromEntries(
      selectedProfileIds.map((id) => [id, 0]),
    );
    for (const row of assignableRows) {
      const profileId = rowAssignments[row.index];
      if (profileId) {
        assigned++;
        if (perProfile[profileId] !== undefined) perProfile[profileId]++;
      } else {
        skipped++;
      }
    }
    return { assigned, skipped, perProfile };
  }, [assignableRows, rowAssignments, selectedProfileIds]);

  const activeCallerLabel =
    profileLabelById[activeCallerId] ?? activeCallerId;

  function setAssignment(rowIndex: number, profileId: string) {
    onRowAssignmentsChange({
      ...rowAssignments,
      [rowIndex]: profileId,
    });
  }

  function toggleRowForActiveCaller(rowIndex: number, checked: boolean) {
    setAssignment(rowIndex, checked ? activeCallerId : "");
  }

  const columns = useMemo<ColumnDef<AssignmentRow>[]>(
    () => [
      {
        id: "assign",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <AssignPageCheckbox
            table={table}
            activeCallerId={activeCallerId}
            activeCallerLabel={activeCallerLabel}
            rowAssignments={rowAssignments}
            onRowAssignmentsChange={onRowAssignmentsChange}
          />
        ),
        cell: ({ row }) => {
          const canAssign = isAssignableStatus(row.original.status);
          const isAssignedToActive =
            rowAssignments[row.original.index] === activeCallerId;

          return (
            <Checkbox
              checked={isAssignedToActive}
              disabled={!activeCallerId || !canAssign}
              onCheckedChange={(checked) =>
                toggleRowForActiveCaller(row.original.index, Boolean(checked))
              }
              aria-label={`Assign row ${row.original.index} to ${activeCallerLabel}`}
            />
          );
        },
      },
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
          <DataTableColumnHeader column={column} title="Assigned to" />
        ),
        cell: ({ row }) => {
          const assignedId = rowAssignments[row.original.index];
          if (!assignedId) {
            return (
              <span className="text-xs text-muted-foreground">Skip</span>
            );
          }
          return (
            <Badge
              variant={
                assignedId === activeCallerId ? "default" : "secondary"
              }
              className="text-xs"
            >
              {profileLabelById[assignedId] ?? assignedId}
            </Badge>
          );
        },
      },
    ],
    [
      activeCallerId,
      activeCallerLabel,
      onRowAssignmentsChange,
      profileLabelById,
      rowAssignments,
    ],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of assignableRows) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  }, [assignableRows]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-screen flex-col gap-0 overflow-hidden p-0 data-[side=right]:w-[min(94vw,80rem)] data-[side=right]:max-w-[min(94vw,80rem)] data-[side=right]:sm:max-w-[min(94vw,80rem)]">
        <SheetHeader className="shrink-0 space-y-4 border-b px-6 py-5 pr-14">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserRound className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-xl">Assign interviews</SheetTitle>
                <HelpTip
                  content={
                    <>
                      Choose a caller, then check rows to assign them. Each row
                      goes to one caller only. Unassigned rows are skipped for
                      this run.
                    </>
                  }
                />
              </div>
              <SheetDescription>
                Assign pending rows to callers before starting workers.
              </SheetDescription>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border bg-emerald-500/5 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">Assigned</p>
              <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {stats.assigned}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">Skipped</p>
              <p className="text-2xl font-semibold tabular-nums">{stats.skipped}</p>
            </div>
            <div className="rounded-xl border bg-primary/5 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">Callers</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedProfileIds.map((id) => (
                  <Badge key={id} variant="secondary" className="text-xs">
                    {profileLabelById[id] ?? id}: {stats.perProfile[id] ?? 0}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-4">
            <div className="space-y-3">
              <LabelWithHelp help="Rows you check are assigned to this caller. Switch callers to build each profile's queue.">
                Assigning as
              </LabelWithHelp>
              <FilterSegment
                value={activeCallerId}
                onChange={setActiveCallerId}
                options={selectedProfileIds.map((id) => ({
                  value: id,
                  label: profileLabelById[id] ?? id,
                  count: stats.perProfile[id] ?? 0,
                }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onDistributeEvenly}
              >
                <Shuffle className="mr-1.5 size-3.5" />
                Distribute pending evenly
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onClear}>
                Clear all
              </Button>
            </div>

          <DataTable
            columns={columns}
            data={tableData}
            searchPlaceholder="Search rows…"
            emptyMessage="No rows to assign."
            pagination
            defaultPageSize={25}
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
                { value: "all", label: "All", count: assignableRows.length },
                ...(["pending", "failed", "in_progress", "skipped"] as const)
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
                      statusCol?.setFilterValue(
                        value === "all" ? undefined : value,
                      );
                      table.setPageIndex(0);
                    }}
                    options={statusOptions}
                  />
                </FilterGroup>
              );
            }}
          />
          </div>
        </div>

        <SheetFooter className="mt-0 shrink-0 flex-row justify-end gap-2 border-t bg-muted/30 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={starting}
          >
            Cancel
          </Button>
          <LoadingButton
            type="button"
            onClick={onConfirm}
            loading={starting}
            loadingText="Starting…"
            disabled={stats.assigned === 0}
          >
            <Play className="mr-2 size-4" />
            Start {selectedProfileIds.length} worker
            {selectedProfileIds.length === 1 ? "" : "s"}
          </LoadingButton>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
