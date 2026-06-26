"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Equal, Eraser } from "lucide-react";
import type { QuestionAnsweringPatch } from "./question-answering-cell";

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

function splitTotal(split: Record<string, string>, codes: string[]): number {
  return codes.reduce((sum, code) => {
    const raw = split[code]?.trim() ?? "";
    if (raw === "") return sum;
    const n = Number.parseFloat(raw);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function optionLabel(
  labels: Record<string, string> | undefined,
  code: string,
): string | null {
  const raw = labels?.[code];
  if (!raw || raw.trim() === "" || raw === code) return null;
  return raw.trim();
}

function weightToDraftValue(weight: number | undefined): string {
  const w = weight ?? 0;
  return w === 0 ? "" : String(w);
}

function draftFromWeights(
  weights: Record<string, number>,
  codes: string[],
): Record<string, string> {
  return Object.fromEntries(
    codes.map((code) => [code, weightToDraftValue(weights[code])]),
  );
}

interface SplitWeightsDialogProps {
  questionName: string;
  codes: string[];
  labels?: Record<string, string>;
  weights: Record<string, number>;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: QuestionAnsweringPatch) => Promise<boolean | void>;
}

export function SplitWeightsDialog({
  questionName,
  codes,
  labels,
  weights,
  open,
  disabled,
  onOpenChange,
  onSave,
}: SplitWeightsDialogProps) {
  const [draft, setDraft] = useState(() => draftFromWeights(weights, codes));
  const [saving, setSaving] = useState(false);

  const total = Math.round(splitTotal(draft, codes) * 10) / 10;
  const totalOk = Math.abs(total - 100) < 0.5;

  function distributeEvenly() {
    const next = equalSplitWeights(codes);
    setDraft(
      Object.fromEntries(codes.map((c) => [c, weightToDraftValue(next[c])])),
    );
  }

  function clearWeights() {
    setDraft(Object.fromEntries(codes.map((c) => [c, ""])));
  }

  async function apply() {
    const next: Record<string, number> = {};
    for (const code of codes) {
      const raw = draft[code]?.trim() ?? "";
      if (raw === "") {
        next[code] = 0;
        continue;
      }
      const n = Number.parseFloat(raw);
      next[code] = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    setSaving(true);
    try {
      await onSave({ Split: next });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="!flex w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full"
        style={{ maxHeight: "min(88vh, 640px)" }}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 pr-14">
          <DialogTitle className="font-mono text-sm">{questionName}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Set the chance each code is picked per interview. Weights should sum
            to 100%.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <TooltipProvider delay={400}>
            <Table className="w-full table-fixed">
              <colgroup>
                <col className="w-[68px]" />
                <col />
                <col className="w-[100px]" />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-popover">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 bg-popover px-0 text-xs">
                    Code
                  </TableHead>
                  <TableHead className="h-8 bg-popover px-0 pl-3 text-xs">
                    Label
                  </TableHead>
                  <TableHead className="h-8 bg-popover px-0 text-right text-xs">
                    Weight
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((code) => {
                  const label = optionLabel(labels, code);
                  return (
                    <TableRow key={code}>
                      <TableCell className="px-0 py-2.5 align-middle font-mono text-xs font-medium">
                        {code}
                      </TableCell>
                      <TableCell className="max-w-0 px-0 py-2.5 pl-3 align-middle text-xs text-muted-foreground">
                        {label ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="block cursor-default truncate" />
                              }
                            >
                              {label}
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-xs text-left"
                            >
                              {label}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground/60 italic">
                            No label
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-0 py-2.5 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            type="number"
                            min={0}
                            step={0.1}
                            className="h-8 w-[72px] shrink-0 px-2 text-right text-xs tabular-nums"
                            value={draft[code] ?? ""}
                            disabled={disabled || saving}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                [code]: e.target.value,
                              }))
                            }
                          />
                          <span className="w-3 shrink-0 text-xs text-muted-foreground">
                            %
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>

        <div className="shrink-0 border-t bg-muted/30 px-6 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Total</span>
              <Badge
                variant={totalOk ? "secondary" : "destructive"}
                className="tabular-nums"
              >
                {total}%
              </Badge>
              {!totalOk && (
                <span className="text-xs text-muted-foreground">/ 100%</span>
              )}
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {codes.length} codes
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex min-w-0 flex-1 rounded-lg border bg-background p-0.5"
              role="group"
              aria-label="Weight shortcuts"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 flex-1 rounded-md px-2"
                disabled={disabled || saving || codes.length === 0}
                onClick={clearWeights}
              >
                <Eraser className="size-3.5 shrink-0" />
                Clear
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 flex-1 rounded-md px-2"
                disabled={disabled || saving || codes.length === 0}
                onClick={distributeEvenly}
              >
                <Equal className="size-3.5 shrink-0" />
                Even
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 px-4"
              disabled={disabled || saving || codes.length === 0}
              onClick={() => void apply()}
            >
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function splitSummary(
  weights: Record<string, number>,
  codes: string[],
): { total: number; totalOk: boolean; configured: number } {
  const total =
    Math.round(
      codes.reduce((sum, code) => sum + (weights[code] ?? 0), 0) * 10,
    ) / 10;
  const configured = codes.filter((c) => (weights[c] ?? 0) > 0).length;
  return {
    total,
    totalOk: Math.abs(total - 100) < 0.5,
    configured,
  };
}
