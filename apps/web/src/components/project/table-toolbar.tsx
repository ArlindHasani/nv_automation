"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative h-9 min-w-0", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 bg-background pl-9 pr-9"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute top-1/2 right-1 size-7 -translate-y-1/2 p-0"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

export function TableResultCount({
  filtered,
  total,
  noun = "rows",
}: {
  filtered: number;
  total: number;
  noun?: string;
}) {
  return (
    <p className="text-xs text-muted-foreground tabular-nums">
      {filtered === total
        ? `${total.toLocaleString()} ${noun}`
        : `${filtered.toLocaleString()} of ${total.toLocaleString()} ${noun}`}
    </p>
  );
}

/** @deprecated Use SearchInput + TableResultCount in a FilterBar instead. */
export function TableToolbar({
  search,
  onSearchChange,
  placeholder = "Search…",
  children,
  className,
  resultCount,
  totalCount,
  noun = "rows",
}: {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
  className?: string;
  resultCount?: number;
  totalCount?: number;
  noun?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder={placeholder}
          className="flex-1 sm:max-w-xs"
        />
        {children}
      </div>
      {resultCount !== undefined && totalCount !== undefined ? (
        <TableResultCount filtered={resultCount} total={totalCount} noun={noun} />
      ) : null}
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
