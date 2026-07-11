"use client";

import { useMemo, useState } from "react";
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
  FilterBar,
  FilterGroup,
  FilterSegment,
} from "@/components/project/filter-group";
import { HelpTip, TipItem, TipText } from "@/components/project/help-tip";
import { SearchInput, TableResultCount } from "@/components/project/table-toolbar";
import {
  QuestionAnsweringCell,
  isNotInSavAnswerConfigured,
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
  Min?: number;
  Max?: number;
  AVG?: number | null;
}

type CoverageFilter = "all" | "in-sav" | "soft-pass" | "configured";
type CoverageStatus = "in-sav" | "soft-pass" | "configured";

function displayTypeLabel(q: DefinitionQuestion): string {
  if (q.Type === "Grid") {
    return q.GridMulti ? "Grid multi" : "Grid single";
  }
  if (q.GridScreen) {
    return q.Type === "Multi" ? "Row multi" : "Row single";
  }
  return q.Type;
}

function sourceLabel(source: DefinitionQuestion["Source"] | "unknown"): string {
  if (source === "sav") return "SAV";
  if (source === "explore") return "Explore";
  if (source === "manual") return "Manual";
  if (source === "unknown") return "Unknown";
  return source ?? "";
}

function resolveCoverage(
  question: DefinitionQuestion,
  inSav: boolean,
): CoverageStatus {
  if (inSav) return "in-sav";
  return isNotInSavAnswerConfigured(question) ? "configured" : "soft-pass";
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

function CoverageBadge({ status }: { status: CoverageStatus }) {
  if (status === "in-sav") return null;
  if (status === "configured") {
    return (
      <Badge
        variant="outline"
        className="h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] font-normal text-emerald-700 dark:text-emerald-300"
      >
        Configured
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="h-5 border-sky-500/25 bg-sky-500/10 px-1.5 text-[10px] font-normal text-sky-700 dark:text-sky-300"
    >
      Soft-pass
    </Badge>
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
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");

  const indexed = useMemo(() => {
    const coverageCounts: Record<CoverageStatus, number> = {
      "in-sav": 0,
      "soft-pass": 0,
      configured: 0,
    };
    const sourceCounts: Record<string, number> = {};
    const rows = questions.map((question) => {
      const inSav = questionsInDataset
        ? questionsInDataset.has(question.Name.toUpperCase())
        : true;
      const coverage = resolveCoverage(question, inSav);
      coverageCounts[coverage] += 1;
      const sourceKey = question.Source ?? "unknown";
      sourceCounts[sourceKey] = (sourceCounts[sourceKey] ?? 0) + 1;
      return { question, inSav, coverage, sourceKey };
    });
    return { rows, coverageCounts, sourceCounts };
  }, [questions, questionsInDataset]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return indexed.rows.filter(({ question, coverage, sourceKey }) => {
      if (coverageFilter !== "all" && coverage !== coverageFilter) return false;
      if (sourceFilter !== "all" && sourceKey !== sourceFilter) return false;
      if (!q) return true;
      const haystack = [
        question.Name,
        question.Type,
        question.Method,
        question.Source ?? "",
        question.GridScreen ?? "",
        coverage,
        ...Object.keys(question.Split),
        ...Object.values(question.Labels ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [indexed.rows, search, sourceFilter, coverageFilter]);

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

  const { coverageCounts, sourceCounts } = indexed;
  const sourceOrder = ["sav", "explore", "manual", "unknown"] as const;

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
        <FilterBar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search questions, codes, labels…"
            className="flex-1 sm:max-w-xs"
          />
          <FilterGroup
            label="Coverage"
            layout="inline"
            help={
              <div className="space-y-2">
                <TipText>
                  Compared to the active SAV file — Definition keeps a union of
                  all questions seen so far.
                </TipText>
                <TipItem title="In SAV">
                  Column exists in the active dataset; Maintain can use row
                  values.
                </TipItem>
                <TipItem title="Soft-pass">
                  Not in this SAV and no Fixed/Split set. Explore/live leave it
                  unanswered (routing / other countries).
                </TipItem>
                <TipItem title="Configured">
                  Not in this SAV, but you set a Fixed answer or Split weights
                  for when the screen does appear.
                </TipItem>
              </div>
            }
          >
            <FilterSegment
              value={coverageFilter}
              onChange={(value) => setCoverageFilter(value as CoverageFilter)}
              options={[
                { value: "all", label: "All", count: questions.length },
                {
                  value: "in-sav",
                  label: "In SAV",
                  count: coverageCounts["in-sav"],
                },
                {
                  value: "soft-pass",
                  label: "Soft-pass",
                  count: coverageCounts["soft-pass"],
                },
                {
                  value: "configured",
                  label: "Configured",
                  count: coverageCounts.configured,
                },
              ]}
            />
          </FilterGroup>
          <FilterGroup
            label="Source"
            layout="inline"
            help={
              <div className="space-y-2">
                <TipText>
                  Where this question entry was last populated from. Definition
                  merges everything — nothing is deleted when you switch SAVs.
                </TipText>
                <TipItem title="SAV">
                  Added or updated from an imported dataset.
                </TipItem>
                <TipItem title="Explore">
                  Discovered while walking the test link.
                </TipItem>
                <TipItem title="Manual">
                  You edited Fixed, Split, Method, or related fields.
                </TipItem>
              </div>
            }
          >
            <FilterSegment
              value={sourceFilter}
              onChange={setSourceFilter}
              options={[
                { value: "all", label: "All", count: questions.length },
                ...sourceOrder
                  .filter((source) => (sourceCounts[source] ?? 0) > 0)
                  .map((source) => ({
                    value: source,
                    label: sourceLabel(source),
                    count: sourceCounts[source] ?? 0,
                  })),
              ]}
            />
          </FilterGroup>
        </FilterBar>
        <TableResultCount
          filtered={filteredRows.length}
          total={questions.length}
          noun="questions"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 w-[148px] text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              <span className="inline-flex items-center gap-1">
                Question
                <HelpTip
                  side="bottom"
                  content={
                    <div className="space-y-2">
                      <TipText>
                        Question name as it appears in NV (QLABEL). Badges show
                        type, source, and coverage.
                      </TipText>
                      <TipItem title="Grid rows">
                        Indent under a screen name means this is a statement row
                        on a grid.
                      </TipItem>
                    </div>
                  }
                />
              </span>
            </TableHead>
            <TableHead className="h-8 min-w-[220px] text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              <span className="inline-flex items-center gap-1">
                Options
                <HelpTip
                  side="bottom"
                  content={
                    <TipText>
                      Answer codes and labels known for this question (from SAV
                      value labels or explore). Split weights show % when Method
                      is Split.
                    </TipText>
                  }
                />
              </span>
            </TableHead>
            <TableHead className="h-8 w-[248px] text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              <span className="inline-flex items-center gap-1">
                Answering
                <HelpTip
                  side="bottom"
                  content={
                    <div className="space-y-2">
                      <TipItem title="In SAV · Maintain">
                        Use each interview row&apos;s value from the dataset
                        (explore uses the seed row).
                      </TipItem>
                      <TipItem title="In SAV · Split">
                        Ignore the row value and sample from weighted codes.
                      </TipItem>
                      <TipItem title="Not in SAV · Soft-pass">
                        Default — leave unanswered if routing skips this screen.
                      </TipItem>
                      <TipItem title="Not in SAV · Fixed / Split">
                        Opt in when this question will appear and needs an
                        answer.
                      </TipItem>
                    </div>
                  }
                />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={3}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                No questions match these filters
              </TableCell>
            </TableRow>
          ) : (
            filteredRows.map(({ question: q, inSav, coverage }, index) => (
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
                            q.Source === "explore" &&
                              "bg-primary/10 text-primary",
                          )}
                        >
                          {sourceLabel(q.Source)}
                        </Badge>
                      )}
                      <CoverageBadge status={coverage} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <OptionsCell question={q} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <QuestionAnsweringCell
                    question={q}
                    inDataset={inSav}
                    disabled={saving === q.Name}
                    onSave={(patch) => saveField(q.Name, patch)}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
