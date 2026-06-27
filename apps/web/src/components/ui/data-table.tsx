"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Table as DataTableInstance,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { useState, type ReactNode } from "react";
import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchInput, TableResultCount } from "@/components/project/table-toolbar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  searchColumnId?: string;
  globalFilterFn?: (
    row: import("@tanstack/react-table").Row<TData>,
    columnId: string,
    filterValue: string,
  ) => boolean;
  toolbarExtra?: (table: DataTableInstance<TData>) => ReactNode;
  footerExtra?: (table: DataTableInstance<TData>) => ReactNode;
  className?: string;
  emptyMessage?: string;
  getRowId?: (row: TData) => string;
  pagination?: boolean;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  enableRowSelection?: boolean;
  enableColumnVisibility?: boolean;
  columnVisibilityLabel?: string;
}

function ColumnVisibilityMenu<TData>({
  table,
  label = "Columns",
}: {
  table: DataTableInstance<TData>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Columns3 className="mr-2 size-4" />
        {label}
      </Button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close column menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 z-50 mt-2 w-48 rounded-lg border bg-popover p-2 shadow-md">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <label
                  key={col.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={col.getIsVisible()}
                    onCheckedChange={(checked) =>
                      col.toggleVisibility(Boolean(checked))
                    }
                  />
                  <span className="capitalize">{col.id}</span>
                </label>
              ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search…",
  searchColumnId,
  globalFilterFn,
  toolbarExtra,
  footerExtra,
  className,
  emptyMessage = "No results.",
  getRowId,
  pagination = false,
  defaultPageSize = 25,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  enableRowSelection = false,
  enableColumnVisibility = false,
  columnVisibilityLabel,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [paginationState, setPaginationState] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: defaultPageSize,
  });

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
      columnVisibility,
      ...(pagination ? { pagination: paginationState } : {}),
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    ...(pagination ? { onPaginationChange: setPaginationState } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    globalFilterFn: globalFilterFn ?? "includesString",
    enableRowSelection,
    getRowId,
  });

  const searchValue = searchColumnId
    ? ((table.getColumn(searchColumnId)?.getFilterValue() as string) ?? "")
    : globalFilter;

  function setSearchValue(value: string) {
    if (searchColumnId) {
      table.getColumn(searchColumnId)?.setFilterValue(value);
    } else {
      setGlobalFilter(value);
    }
    if (pagination) {
      table.setPageIndex(0);
    }
  }

  const filteredCount = table.getFilteredRowModel().rows.length;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination?.pageIndex ?? 0;
  const pageSize = table.getState().pagination?.pageSize ?? data.length;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchInput
          value={searchValue}
          onChange={setSearchValue}
          placeholder={searchPlaceholder}
          className="flex-1 sm:max-w-xs"
        />
        {toolbarExtra?.(table)}
        {enableColumnVisibility ? (
          <ColumnVisibilityMenu
            table={table}
            label={columnVisibilityLabel ?? "Columns"}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <TableResultCount filtered={filteredCount} total={data.length} />
      {enableRowSelection && selectedCount > 0 ? (
        <span className="font-medium text-foreground">
          {selectedCount} selected
        </span>
      ) : null}
      </div>

      {footerExtra && selectedCount > 0 ? footerExtra(table) : null}

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={row.getIsSelected() ? "bg-muted/40" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && filteredCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <Label htmlFor="table-page-size" className="text-sm text-muted-foreground">
              Rows per page
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
                table.setPageIndex(0);
              }}
            >
              <SelectTrigger id="table-page-size" className="h-8 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {pageIndex + 1} of {Math.max(pageCount, 1)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SelectAllCheckbox<TData>({ table }: { table: DataTableInstance<TData> }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const some = table.getIsSomePageRowsSelected();
  const all = table.getIsAllPageRowsSelected();

  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = some && !all;
    }
  }, [some, all]);

  return (
    <Checkbox
      ref={ref}
      checked={all}
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
      aria-label="Select all on page"
    />
  );
}

export function DataTableSelectColumn<TData>(): ColumnDef<TData> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => <SelectAllCheckbox table={table} />,
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        aria-label="Select row"
      />
    ),
  };
}
