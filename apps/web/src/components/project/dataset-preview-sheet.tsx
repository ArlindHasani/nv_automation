"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableToolbar } from "@/components/project/table-toolbar";

interface DatasetPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  dataset: { id: string; name: string; rowCount: number; isActive: boolean } | null;
  /** When previewing the active dataset, pass cached rows to avoid an extra fetch. */
  cachedRows?: Array<Record<string, unknown>>;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DatasetPreviewSheet({
  open,
  onOpenChange,
  projectId,
  dataset,
  cachedRows,
}: DatasetPreviewSheetProps) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !dataset) return;
    setSearch("");

    if (cachedRows && cachedRows.length > 0) {
      setRows(cachedRows.slice(0, 100));
      setTotalRows(cachedRows.length);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetch(`/api/projects/${projectId}/datasets/${dataset.id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load preview");
        if (cancelled) return;
        setRows(data.rows ?? []);
        setTotalRows(data.totalRows ?? data.rows?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setTotalRows(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, dataset, projectId, cachedRows]);

  const columns = useMemo(
    () => (rows[0] ? Object.keys(rows[0]).slice(0, 12) : []),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row, index) => {
      const haystack = [
        String(index),
        ...columns.map((col) => formatCell(row[col])),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, columns]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Database className="size-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="truncate">{dataset?.name ?? "Dataset"}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <span>{totalRows.toLocaleString()} interview rows</span>
                {dataset?.isActive ? (
                  <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                    Active
                  </Badge>
                ) : null}
                <span className="text-xs">
                  Showing up to {rows.length} rows for preview
                </span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search preview rows…"
            resultCount={filteredRows.length}
            totalCount={rows.length}
          />

          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading preview…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              No rows to preview
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1 rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-10 bg-background w-12">
                      #
                    </TableHead>
                    {columns.map((col) => (
                      <TableHead
                        key={col}
                        className="sticky top-0 z-10 bg-background font-mono text-xs"
                      >
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {index}
                      </TableCell>
                      {columns.map((col) => (
                        <TableCell
                          key={col}
                          className="max-w-[140px] truncate font-mono text-xs"
                          title={formatCell(row[col])}
                        >
                          {formatCell(row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
