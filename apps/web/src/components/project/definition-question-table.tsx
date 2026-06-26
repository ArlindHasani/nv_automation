"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  QuestionAnsweringCell,
  type QuestionAnsweringPatch,
} from "./question-answering-cell";

interface DefinitionQuestion {
  Name: string;
  Type: string;
  Method: string;
  Split: Record<string, number>;
  Labels?: Record<string, string>;
  Source?: "sav" | "explore" | "manual";
  GridMulti?: boolean;
  GridScreen?: string;
  Statements?: Array<{ name: string; rowLabel: string }>;
  FixedAnswer?: string | null;
  ExploreOverride?: string | null;
}

function displayTypeLabel(q: DefinitionQuestion): string {
  if (q.Type === "Grid") {
    return q.GridMulti ? "Grid multi" : "Grid single";
  }
  if (q.GridScreen) {
    return q.Type === "Multi" ? "Row multi" : "Row single";
  }
  return q.Type;
}

function sourceLabel(source: DefinitionQuestion["Source"]): string {
  if (source === "sav") return "SAV";
  if (source === "explore") return "Explore";
  if (source === "manual") return "Manual";
  return source ?? "";
}

function formatCodeEntries(
  q: DefinitionQuestion,
): Array<{ code: string; label: string | null }> {
  const codes = Object.keys(q.Split).filter((k) => k !== "");
  if (codes.length === 0) return [];
  const labels = q.Labels ?? {};
  return codes.map((code) => {
    const raw = labels[code];
    const label =
      raw && raw.trim() !== "" && raw !== code ? raw.trim() : null;
    return { code, label };
  });
}

function OptionsCell({ question }: { question: DefinitionQuestion }) {
  const entries = formatCodeEntries(question);
  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const isSplit = question.Method === "Split";

  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
      {entries.map(({ code, label }) => {
        const weight = question.Split[code] ?? 0;
        return (
          <li
            key={code}
            className="flex items-start gap-2 text-[11px] leading-snug"
          >
            <span className="shrink-0 font-mono font-medium text-foreground">
              {code}
            </span>
            <span className="min-w-0 flex-1 text-muted-foreground">
              {label ?? (
                <span className="text-muted-foreground/60 italic">No label</span>
              )}
            </span>
            {isSplit && weight > 0 && (
              <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                {weight}%
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface DefinitionQuestionTableProps {
  questions: DefinitionQuestion[];
  projectId: string;
  questionsInDataset?: Set<string>;
  onUpdated?: () => void;
}

export function DefinitionQuestionTable({
  questions,
  projectId,
  questionsInDataset,
  onUpdated,
}: DefinitionQuestionTableProps) {
  const [saving, setSaving] = useState<string | null>(null);

  async function saveField(
    name: string,
    patch: QuestionAnsweringPatch,
  ): Promise<boolean> {
    setSaving(name);
    try {
      const res = await fetch(`/api/projects/${projectId}/definition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: [{ Name: name, ...patch }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save");
        return false;
      }
      toast.success(`Saved ${name}`);
      await onUpdated?.();
      return true;
    } finally {
      setSaving(null);
    }
  }

  return (
    <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 w-[148px] text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Question
            </TableHead>
            <TableHead className="h-8 min-w-[220px] text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Options
            </TableHead>
            <TableHead className="h-8 w-[248px] text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Answering
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q, index) => (
            <TableRow
              key={`${q.Name}-${index}`}
              className={cn(
                "align-top [&>td]:py-3",
                saving === q.Name && "opacity-70",
              )}
            >
              <TableCell className="whitespace-normal">
                <div className="space-y-1.5">
                  <div>
                    <div
                      className="font-mono text-xs font-semibold"
                      title={q.Name}
                    >
                      {q.Name}
                    </div>
                    {q.GridScreen && (
                      <div
                        className="mt-0.5 text-[10px] text-muted-foreground"
                        title={`Screen ${q.GridScreen}`}
                      >
                        ↳ {q.GridScreen}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant="outline"
                      className="h-5 text-[10px] font-normal"
                    >
                      {displayTypeLabel(q)}
                    </Badge>
                    {q.Source && (
                      <Badge
                        variant={
                          q.Source === "explore"
                            ? "default"
                            : q.Source === "manual"
                              ? "outline"
                              : "secondary"
                        }
                        className={cn(
                          "h-5 text-[10px] font-normal",
                          q.Source === "explore" && "bg-primary/10 text-primary",
                        )}
                      >
                        {sourceLabel(q.Source)}
                      </Badge>
                    )}
                    {questionsInDataset &&
                      !questionsInDataset.has(q.Name.toUpperCase()) && (
                        <Badge
                          variant="secondary"
                          className="h-5 gap-1 border border-amber-500/20 bg-amber-500/10 px-1.5 text-[10px] font-normal text-amber-800 dark:text-amber-300"
                        >
                          <AlertTriangle className="size-2.5 opacity-80" aria-hidden />
                          Not in dataset
                        </Badge>
                      )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="whitespace-normal">
                <OptionsCell question={q} />
              </TableCell>
              <TableCell className="whitespace-normal">
                <QuestionAnsweringCell
                  question={q}
                  inDataset={
                    questionsInDataset
                      ? questionsInDataset.has(q.Name.toUpperCase())
                      : true
                  }
                  disabled={saving === q.Name}
                  onSave={(patch) => saveField(q.Name, patch)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
  );
}
