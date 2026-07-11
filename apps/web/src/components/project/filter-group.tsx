"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/project/help-tip";

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      {children}
    </div>
  );
}

export function FilterGroup({
  label,
  help,
  children,
  className,
  layout = "stacked",
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Inline: label beside control on one row (toolbars). Stacked: label above. */
  layout?: "stacked" | "inline";
}) {
  const labelNode = (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span
        className={
          layout === "inline"
            ? "text-xs font-medium text-muted-foreground"
            : "text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
        }
      >
        {label}
      </span>
      {help ? <HelpTip content={help} side="bottom" /> : null}
    </span>
  );

  if (layout === "inline") {
    return (
      <div className={cn("flex h-9 shrink-0 items-center gap-2", className)}>
        {labelNode}
        {children}
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {labelNode}
      {children}
    </div>
  );
}

/** Mutually exclusive options — only one active at a time. */
export function FilterSegment({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; count?: number }>;
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-lg border bg-background p-0.5">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={cn("ml-1 tabular-nums", active ? "opacity-90" : "opacity-70")}>
                ({option.count})
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function FilterToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
