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
    return codes.some((c) => (question.Split[c] ?? 0) > 0);
  }
  return fixed.length > 0;
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
}

export type QuestionAnsweringPatch = {
  FixedAnswer?: string | null;
  /** @deprecated Use FixedAnswer */
  ExploreOverride?: string | null;
  Method?: "Maintain" | "Split";
  Split?: Record<string, number>;
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
    <div className="rounded-lg border border-dashed border-amber-500/25 bg-muted/25 p-2.5 space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[11px] font-medium leading-snug text-foreground/90">
              Not in active dataset
            </p>
            {configured === false && (
              <Badge
                variant="outline"
                className="h-4 border-amber-500/30 bg-amber-500/10 px-1 text-[9px] font-medium text-amber-700 dark:text-amber-300"
              >
                Required
              </Badge>
            )}
            {configured === true && (
              <Badge
                variant="outline"
                className="h-4 border-border/80 px-1 text-[9px] font-medium text-muted-foreground"
              >
                Configured
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
  const configured = isCodedPolicyConfigured(question, codes);

  return (
    <NotInDatasetShell
      configured={configured}
      hint="Choose a fixed code or split distribution for explore and live runs."
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
                const weights: Record<string, number> = {};
                weights[value] = 100;
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
            </>
          )}
        </TabsContent>
      </Tabs>

      {splitOpen && (
        <SplitWeightsDialog
          key={question.Name}
          questionName={question.Name}
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
  const summary = splitSummary(question.Split, codes);
  const fixed = getFixedAnswer(question);

  if (!inDataset) {
    if (question.Type === "Open") {
      const openConfigured = fixed.length > 0;
      return (
        <NotInDatasetShell
          configured={openConfigured}
          hint="Row values aren't available — enter fixed open text for explore and live runs."
        >
          <Input
            className="h-7 border-border/80 bg-background text-xs"
            placeholder="Enter fixed open text…"
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
            </>
          )}
        </TabsContent>
      </Tabs>

      {splitOpen && (
        <SplitWeightsDialog
          key={question.Name}
          questionName={question.Name}
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
