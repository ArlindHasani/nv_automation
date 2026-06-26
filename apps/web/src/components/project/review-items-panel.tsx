"use client";

import { AlertTriangle, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface ReviewIssue {
  severity: string;
  question: string;
  message: string;
}

interface ReviewItemsPanelProps {
  title: string;
  issues: ReviewIssue[];
  variant?: "default" | "destructive";
  defaultOpen?: boolean;
}

export function ReviewItemsPanel({
  title,
  issues,
  variant = "default",
  defaultOpen = false,
}: ReviewItemsPanelProps) {
  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.length - errors;

  return (
    <details
      className={cn(
        "group rounded-lg border text-sm",
        variant === "destructive"
          ? "border-destructive/30 bg-destructive/5"
          : "border-amber-500/30 bg-amber-500/5",
      )}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <AlertTriangle
          className={cn(
            "size-4 shrink-0",
            variant === "destructive" ? "text-destructive" : "text-amber-600",
          )}
        />
        <span className="flex-1 font-medium">{title}</span>
        <Badge variant="secondary" className="font-mono text-xs">
          {issues.length}
        </Badge>
        {errors > 0 && (
          <Badge variant="destructive" className="text-xs">
            {errors} error{errors !== 1 ? "s" : ""}
          </Badge>
        )}
        {warns > 0 && variant !== "destructive" && (
          <Badge
            variant="outline"
            className="border-amber-500/40 text-amber-700 text-xs dark:text-amber-400"
          >
            {warns} warn
          </Badge>
        )}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ul className="max-h-48 space-y-1 overflow-y-auto border-t px-3 py-2 text-xs">
        {issues.map((issue, i) => (
          <li
            key={`${issue.question}-${i}`}
            className="flex gap-2 rounded-md px-1 py-0.5 hover:bg-background/60"
          >
            <span className="shrink-0 font-mono font-medium text-foreground">
              {issue.question}
            </span>
            <span className="text-muted-foreground">{issue.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Grid screen vs statement type pairs are expected in Freestyle — hide from review. */
export function filterReviewIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return issues.filter((issue) => {
    if (!issue.message.includes("Type conflict")) return true;
    if (/Grid vs (Single|Multi)/.test(issue.message)) return false;
    return true;
  });
}
