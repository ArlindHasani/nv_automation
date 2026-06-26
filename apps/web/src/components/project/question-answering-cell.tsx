"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SlidersHorizontalIcon } from "lucide-react";
import {
  SplitWeightsDialog,
  splitSummary,
} from "./split-weights-dialog";

const DATASET_ROW_VALUE = "__dataset_row__";

function exploreOverrideToSelectValue(
  saved: string,
  codes: string[],
  inDataset: boolean,
): string {
  if (!saved) {
    if (!inDataset && codes.length > 0) return codes[0]!;
    return DATASET_ROW_VALUE;
  }
  if (codes.includes(saved)) return saved;
  return saved;
}

function exploreOverrideSelectLabel(
  value: string,
  labels?: Record<string, string>,
): string {
  if (value === DATASET_ROW_VALUE) return "Use dataset seed row";
  const label = labels?.[value];
  if (label && label !== value) return `${value} — ${label}`;
  return value;
}

interface DefinitionQuestion {
  Name: string;
  Type: string;
  Method: string;
  Split: Record<string, number>;
  Labels?: Record<string, string>;
  ExploreOverride?: string | null;
}

export type QuestionAnsweringPatch = {
  ExploreOverride?: string | null;
  Method?: "Maintain" | "Split";
  Split?: Record<string, number>;
};

function ExploreOverrideControl({
  question,
  inDataset,
  disabled,
  onSave,
}: {
  question: DefinitionQuestion;
  inDataset: boolean;
  disabled?: boolean;
  onSave: (patch: QuestionAnsweringPatch) => Promise<boolean>;
}) {
  const codes = Object.keys(question.Split).filter((k) => k !== "");
  const saved = (question.ExploreOverride ?? "").trim();
  const savedSelectValue = exploreOverrideToSelectValue(saved, codes, inDataset);
  const [pendingSelectValue, setPendingSelectValue] = useState<string | null>(
    null,
  );
  const selectValue = pendingSelectValue ?? savedSelectValue;

  if (question.Type === "Open") {
    return (
      <div className="space-y-1">
        {!inDataset && !saved && (
          <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
            Not in active dataset — enter text used on the test link (required
            for explore).
          </p>
        )}
        <Input
          className="h-7 text-xs"
          placeholder={
            inDataset
              ? "Open text for explore (optional — uses seed row if empty)"
              : "Open text for explore (required)"
          }
          defaultValue={saved}
          disabled={disabled}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== saved) {
              void onSave({ ExploreOverride: next || null });
            }
          }}
        />
      </div>
    );
  }

  if (codes.length === 0) {
    return (
      <p className="text-[11px] leading-snug text-muted-foreground">
        No codes yet — import SAV or run explore first.
      </p>
    );
  }

  const extraCodes =
    saved && !codes.includes(saved) ? [saved] : [];

  return (
    <Select
      value={selectValue}
      disabled={disabled}
      onValueChange={(value) => {
        if (!value) return;
        const previous = selectValue;
        setPendingSelectValue(value);
        const next =
          value === DATASET_ROW_VALUE ? null : value;
        void onSave({ ExploreOverride: next }).then((ok) => {
          setPendingSelectValue(ok ? null : previous);
        });
      }}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "h-7 w-full border-border/80 bg-background px-2 text-xs",
          "[&_[data-slot=select-value]]:line-clamp-none",
          "[&_svg]:size-3",
        )}
      >
        <span className="truncate text-left">
          {exploreOverrideSelectLabel(selectValue, question.Labels)}
        </span>
      </SelectTrigger>
      <SelectContent>
        {inDataset && (
          <SelectItem value={DATASET_ROW_VALUE} className="text-xs">
            Use dataset seed row
          </SelectItem>
        )}
        {!inDataset && (
          <SelectItem value={DATASET_ROW_VALUE} disabled className="text-xs">
            Use dataset seed row (not in SAV)
          </SelectItem>
        )}
        {extraCodes.map((code) => (
          <SelectItem key={`legacy-${code}`} value={code} className="text-xs">
            <span className="font-mono">{code}</span>
            <span className="text-muted-foreground"> (current)</span>
          </SelectItem>
        ))}
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

  return (
    <div className="rounded-lg border bg-muted/15 p-2.5">
      <div className="mb-2.5 space-y-1">
        <Label className="text-[11px] font-normal text-muted-foreground">
          Explore override
          <span className="text-muted-foreground/70"> · test link only</span>
        </Label>
        <ExploreOverrideControl
          question={question}
          inDataset={inDataset}
          disabled={disabled}
          onSave={onSave}
        />
        {!inDataset && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            No SAV column on the active dataset — pick a code above or use Split
            weights for explore-only questions.
          </p>
        )}
      </div>

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
            {inDataset
              ? "Live interviews use each row's dataset value."
              : "Not in active dataset — live interviews cannot use row values; use Split or add a SAV column."}
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
