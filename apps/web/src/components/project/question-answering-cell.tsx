"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, SlidersHorizontalIcon } from "lucide-react";
import {
  SplitWeightsDialog,
  splitSummary,
} from "./split-weights-dialog";

function equalSplitWeights(codes: string[]): Record<string, number> {
  if (codes.length === 0) return {};
  const each = Math.round((100 / codes.length) * 100) / 100;
  const weights = Object.fromEntries(codes.map((c) => [c, each]));
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const last = codes[codes.length - 1];
  if (last) {
    weights[last] = Math.round((weights[last] + (100 - sum)) * 100) / 100;
  }
  return weights;
}

function getFixedAnswer(question: DefinitionQuestion): string {
  return (question.FixedAnswer ?? question.ExploreOverride ?? "").trim();
}

function fixedCodeSelectLabel(
  value: string,
  labels?: Record<string, string>,
): string {
  const label = labels?.[value];
  if (label && label !== value) return `${value} — ${label}`;
  return value;
}

function isCodedPolicyConfigured(
  question: DefinitionQuestion,
  codes: string[],
): boolean {
  const fixed = getFixedAnswer(question);
  if (usesSplitDistribution(question, codes)) {
    const splitOk = codes.some((c) => (question.Split[c] ?? 0) > 0);
    if (needsMentionSplitBounds(question)) {
      return splitOk && hasMentionBoundsConfigured(question);
    }
    return splitOk;
  }
  return fixed.length > 0;
}

/** Whether a not-in-SAV question has Fixed/Split set (vs soft-pass). */
export function isNotInSavAnswerConfigured(
  question: DefinitionQuestion,
): boolean {
  const fixed = getFixedAnswer(question);
  if (question.Type === "Open") return fixed.length > 0;
  const codes = Object.keys(question.Split).filter((k) => k !== "");
  return isCodedPolicyConfigured(question, codes);
}

function initialPolicyMode(
  question: DefinitionQuestion,
  codes: string[],
): "fixed" | "split" {
  if (usesSplitDistribution(question, codes)) return "split";
  if (getFixedAnswer(question)) return "fixed";
  return "fixed";
}

function usesSplitDistribution(
  question: DefinitionQuestion,
  codes: string[],
): boolean {
  const fixed = getFixedAnswer(question);
  if (question.Method !== "Split") return false;
  const positive = codes.filter((c) => (question.Split[c] ?? 0) > 0);
  if (positive.length === 0) return false;
  if (positive.length === 1 && fixed && positive[0] === fixed) return false;
  if (fixed) {
    const fixedCodes = new Set(
      fixed
        .split(/[,+]/)
        .map((code) => code.trim())
        .filter(Boolean),
    );
    if (
      positive.length === fixedCodes.size &&
      positive.every((code) => fixedCodes.has(code))
    ) {
      return false;
    }
  }
  return true;
}

interface DefinitionQuestion {
  Name: string;
  Type: string;
  Method: string;
  Split: Record<string, number>;
  Labels?: Record<string, string>;
  FixedAnswer?: string | null;
  ExploreOverride?: string | null;
  Min?: number;
  Max?: number;
  AVG?: number | null;
  GridScreen?: string;
}

function needsMentionSplitBounds(question: DefinitionQuestion): boolean {
  return question.Type === "Multi" && question.Method === "Split";
}

function hasMentionBoundsConfigured(question: DefinitionQuestion): boolean {
  const min = question.Min ?? 0;
  const max = question.Max ?? 0;
  const avg = question.AVG ?? 0;
  return min > 0 && max > 0 && avg > 0 && min <= avg && avg <= max;
}

function MentionBoundsFields({
  question,
  disabled,
  onSave,
}: {
  question: DefinitionQuestion;
  disabled?: boolean;
  onSave: (patch: QuestionAnsweringPatch) => Promise<boolean>;
}) {
  const configured = hasMentionBoundsConfigured(question);

  async function saveField(
    field: "Min" | "Max" | "AVG",
    raw: string,
    current: number,
  ) {
    const parsed = Number.parseInt(raw, 10);
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    if (next === current) return;
    await onSave({ [field]: next > 0 ? next : 0 });
  }

  return (
    <div className="space-y-1.5 rounded-md border border-border/70 bg-background/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground/90">
          Mention count
        </p>
        {!configured ? (
          <Badge
            variant="outline"
            className="h-4 border-amber-500/30 bg-amber-500/10 px-1 text-[9px] font-medium text-amber-700 dark:text-amber-300"
          >
            Required
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="h-4 px-1 text-[9px] font-medium text-muted-foreground"
          >
            {question.Min}–{question.Max} (avg {question.AVG})
          </Badge>
        )}
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {question.GridScreen
          ? "Min, max, and target average selections for this grid row (split across column codes)."
          : "Min, max, and target average mentions per interview for split sampling."}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ["Min", question.Min ?? 0],
            ["Max", question.Max ?? 0],
            ["AVG", question.AVG ?? 0],
          ] as const
        ).map(([field, value]) => (
          <div key={field} className="space-y-0.5">
            <label className="text-[10px] font-medium text-muted-foreground">
              {field}
            </label>
            <Input
              type="number"
              min={1}
              step={1}
              className="h-7 px-2 text-xs tabular-nums"
              defaultValue={value > 0 ? value : ""}
              key={`${question.Name}-${field}-${value}`}
              disabled={disabled}
              placeholder="—"
              onBlur={(e) => {
                void saveField(field, e.target.value, value);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export type QuestionAnsweringPatch = {
  FixedAnswer?: string | null;
  /** @deprecated Use FixedAnswer */
  ExploreOverride?: string | null;
  Method?: "Maintain" | "Split";
  Split?: Record<string, number>;
  Min?: number;
  Max?: number;
  AVG?: number | null;
};

function NotInDatasetShell({
  hint,
  configured,
  children,
}: {
  hint: string;
  configured?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/25 p-2.5 space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <AlertTriangle className="size-3" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[11px] font-medium leading-snug text-foreground/90">
              Not in this SAV
            </p>
            {configured ? (
              <Badge
                variant="outline"
                className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1 text-[9px] font-medium text-emerald-700 dark:text-emerald-300"
              >
                Configured
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="h-4 border-sky-500/25 bg-sky-500/10 px-1 text-[9px] font-medium text-sky-700 dark:text-sky-300"
              >
                Soft-pass
              </Badge>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

interface NotInDatasetCodedPolicyProps {
  question: DefinitionQuestion;
  codes: string[];
  fixed: string;
  summary: ReturnType<typeof splitSummary>;
  disabled?: boolean;
  onSave: (patch: QuestionAnsweringPatch) => Promise<boolean>;
}

function NotInDatasetCodedPolicy({
  question,
  codes,
  fixed,
  summary,
  disabled,
  onSave,
}: NotInDatasetCodedPolicyProps) {
  const [splitOpen, setSplitOpen] = useState(false);
  const [policyMode, setPolicyMode] = useState<"fixed" | "split">(() =>
    initialPolicyMode(question, codes),
  );
  const configured = isNotInSavAnswerConfigured(question);

  return (
    <NotInDatasetShell
      configured={configured}
      hint="Soft-pass by default — set a fixed code or split if this screen will appear for this wave."
    >
      <Tabs
        value={policyMode}
        onValueChange={(value) => {
          if (value === "fixed" || value === "split") {
            setPolicyMode(value);
          }
        }}
      >
        <TabsList className="h-7 w-full">
          <TabsTrigger value="fixed" className="flex-1 text-[11px]">
            Fixed code
          </TabsTrigger>
          <TabsTrigger value="split" className="flex-1 text-[11px]">
            Split weights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fixed" className="mt-2 space-y-1">
          {codes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No codes yet — import SAV or run explore first.
            </p>
          ) : (
            <Select
              value={fixed || null}
              disabled={disabled}
              onValueChange={(value) => {
                if (!value) return;
                const weights = Object.fromEntries(
                  codes.map((code) => [code, code === value ? 100 : 0]),
                );
                void onSave({
                  Method: "Split",
                  FixedAnswer: value,
                  Split: weights,
                });
              }}
            >
              <SelectTrigger size="sm" className="h-7 text-xs">
                <SelectValue placeholder="Select a code…">
                  {fixed
                    ? fixedCodeSelectLabel(fixed, question.Labels)
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {codes.map((code) => (
                  <SelectItem key={code} value={code} className="text-xs">
                    <span className="font-mono">{code}</span>
                    {question.Labels?.[code] &&
                      question.Labels[code] !== code && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {question.Labels[code]}
                        </span>
                      )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </TabsContent>

        <TabsContent value="split" className="mt-2 space-y-2">
          {codes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No codes yet — import SAV or run explore first.
            </p>
          ) : usesSplitDistribution(question, codes) ? (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {codes.length} codes
                </Badge>
                <Badge
                  variant={summary.totalOk ? "secondary" : "destructive"}
                  className="text-[10px] tabular-nums"
                >
                  {summary.total}% total
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-full text-xs"
                disabled={disabled}
                onClick={() => setSplitOpen(true)}
              >
                <SlidersHorizontalIcon className="size-3.5" />
                Edit weights
              </Button>
              {needsMentionSplitBounds(question) ? (
                <MentionBoundsFields
                  question={question}
                  disabled={disabled}
                  onSave={onSave}
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Set how answers are distributed across codes, then save.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-full text-xs"
                disabled={disabled}
                onClick={() => setSplitOpen(true)}
              >
                <SlidersHorizontalIcon className="size-3.5" />
                Set up split weights
              </Button>
              {needsMentionSplitBounds(question) ? (
                <MentionBoundsFields
                  question={question}
                  disabled={disabled}
                  onSave={onSave}
                />
              ) : null}
            </>
          )}
        </TabsContent>
      </Tabs>

      {splitOpen && (
        <SplitWeightsDialog
          key={question.Name}
          questionName={question.Name}
          questionType={question.Type}
          gridScreen={question.GridScreen}
          codes={codes}
          labels={question.Labels}
          weights={question.Split}
          open={splitOpen}
          disabled={disabled}
          onOpenChange={setSplitOpen}
          onSave={(patch) =>
            onSave({
              ...patch,
              Method: "Split",
              FixedAnswer: null,
              Split:
                patch.Split ??
                (summary.configured > 0
                  ? question.Split
                  : equalSplitWeights(codes)),
            })
          }
        />
      )}
    </NotInDatasetShell>
  );
}

interface QuestionAnsweringCellProps {
  question: DefinitionQuestion;
  inDataset?: boolean;
  disabled?: boolean;
  onSave: (patch: QuestionAnsweringPatch) => Promise<boolean>;
}

export function QuestionAnsweringCell({
  question,
  inDataset = true,
  disabled,
  onSave,
}: QuestionAnsweringCellProps) {
  const [splitOpen, setSplitOpen] = useState(false);
  const codes = Object.keys(question.Split).filter((k) => k !== "");
  const summary = splitSummary(question.Split, codes, question.Type);
  const fixed = getFixedAnswer(question);

  if (!inDataset) {
    if (question.Type === "Open") {
      const openConfigured = isNotInSavAnswerConfigured(question);
      return (
        <NotInDatasetShell
          configured={openConfigured}
          hint="Leave blank / Next with no text by default. Set fixed open text only if this screen needs a value."
        >
          <Input
            className="h-7 border-border/80 bg-background text-xs"
            placeholder="Leave empty, or set fixed open text…"
            defaultValue={fixed}
            disabled={disabled}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== fixed) {
                void onSave({ FixedAnswer: next || null });
              }
            }}
          />
        </NotInDatasetShell>
      );
    }

    return (
      <NotInDatasetCodedPolicy
        question={question}
        codes={codes}
        fixed={fixed}
        summary={summary}
        disabled={disabled}
        onSave={onSave}
      />
    );
  }

  return (
    <div className="rounded-lg border bg-muted/15 p-2.5">
      <Tabs
        value={question.Method}
        onValueChange={(value) => {
          if (
            (value === "Maintain" || value === "Split") &&
            value !== question.Method
          ) {
            void onSave({ Method: value });
          }
        }}
      >
        <TabsList className="mb-2.5 h-7 w-full">
          <TabsTrigger
            value="Maintain"
            disabled={disabled}
            className="flex-1 px-2 text-[11px]"
          >
            Maintain
          </TabsTrigger>
          <TabsTrigger
            value="Split"
            disabled={disabled}
            className="flex-1 px-2 text-[11px]"
          >
            Split
          </TabsTrigger>
        </TabsList>

        <TabsContent value="Maintain" className="mt-0">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Uses each interview row&apos;s dataset value (explore uses the seed
            row).
          </p>
        </TabsContent>

        <TabsContent value="Split" className="mt-0 space-y-2">
          {codes.length === 0 ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              No codes yet — import SAV or run explore first.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] tabular-nums">
                  {codes.length} codes
                </Badge>
                <Badge
                  variant={summary.totalOk ? "secondary" : "destructive"}
                  className="text-[10px] tabular-nums"
                >
                  {summary.total}% total
                </Badge>
                {summary.configured > 0 && summary.configured < codes.length && (
                  <span className="text-[10px] text-muted-foreground">
                    {summary.configured} set
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-full text-xs"
                disabled={disabled}
                onClick={() => setSplitOpen(true)}
              >
                <SlidersHorizontalIcon className="size-3.5" />
                Edit weights
              </Button>
              {needsMentionSplitBounds(question) ? (
                <MentionBoundsFields
                  question={question}
                  disabled={disabled}
                  onSave={onSave}
                />
              ) : null}
            </>
          )}
        </TabsContent>
      </Tabs>

      {splitOpen && (
        <SplitWeightsDialog
          key={question.Name}
          questionName={question.Name}
          questionType={question.Type}
          gridScreen={question.GridScreen}
          codes={codes}
          labels={question.Labels}
          weights={question.Split}
          open={splitOpen}
          disabled={disabled}
          onOpenChange={setSplitOpen}
          onSave={onSave}
        />
      )}
    </div>
  );
}
