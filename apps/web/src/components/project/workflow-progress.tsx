"use client";

import {
  AlertTriangle,
  Ban,
  Check,
  Compass,
  Database,
  ListTree,
  Play,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectSection } from "@/lib/types";

export interface WorkflowStepView {
  id: string;
  label: string;
  description: string;
  status: "pending" | "ready" | "complete" | "warning" | "blocked";
  detail?: string;
  section: ProjectSection;
}

interface WorkflowProgressProps {
  steps: WorkflowStepView[];
  currentStep: string;
  onNavigate?: (section: ProjectSection) => void;
}

const STEP_ICONS: Record<string, LucideIcon> = {
  import: Database,
  preflight: Settings2,
  explore: Compass,
  review: ListTree,
  run: Play,
};

const STATUS_STYLES = {
  complete: {
    node: "border-emerald-500 bg-emerald-500 text-white",
    label: "text-emerald-700 dark:text-emerald-400",
  },
  ready: {
    node: "border-primary bg-primary text-primary-foreground",
    label: "text-primary",
  },
  warning: {
    node: "border-amber-500 bg-amber-500 text-white",
    label: "text-amber-700 dark:text-amber-400",
  },
  blocked: {
    node: "border-destructive bg-destructive text-destructive-foreground",
    label: "text-destructive",
  },
  pending: {
    node: "border-border bg-background text-muted-foreground",
    label: "text-muted-foreground",
  },
} as const;

function trackProgressRatio(steps: WorkflowStepView[]): number {
  if (steps.length <= 1) return 0;
  let lastComplete = -1;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].status === "complete") lastComplete = i;
    else break;
  }
  if (lastComplete < 0) return 0;
  return lastComplete / (steps.length - 1);
}

function StepNodeButton({
  step,
  index,
  isCurrent,
  onNavigate,
}: {
  step: WorkflowStepView;
  index: number;
  isCurrent: boolean;
  onNavigate?: (section: ProjectSection) => void;
}) {
  const style = STATUS_STYLES[step.status];
  const StepIcon = STEP_ICONS[step.id] ?? Database;

  return (
    <div className="relative flex size-10 shrink-0 items-center justify-center">
      {isCurrent && (
        <span
          className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-primary/40"
          aria-hidden
        />
      )}
      <button
        type="button"
        onClick={() => onNavigate?.(step.section)}
        title={`${index + 1}. ${step.label}`}
        className={cn(
          "relative z-10 flex size-10 items-center justify-center rounded-full border-2 transition-transform hover:scale-105",
          style.node,
        )}
      >
        <StepIcon className="size-[18px]" strokeWidth={2.25} />
        {step.status === "complete" && (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-background">
            <Check className="size-2.5" strokeWidth={3} />
          </span>
        )}
        {step.status === "warning" && (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-amber-600 text-white ring-2 ring-background">
            <AlertTriangle className="size-2.5" strokeWidth={2.5} />
          </span>
        )}
        {step.status === "blocked" && (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground ring-2 ring-background">
            <Ban className="size-2.5" strokeWidth={2.5} />
          </span>
        )}
      </button>
    </div>
  );
}

function StepLabel({
  step,
  index,
  isCurrent,
  onNavigate,
}: {
  step: WorkflowStepView;
  index: number;
  isCurrent: boolean;
  onNavigate?: (section: ProjectSection) => void;
}) {
  const style = STATUS_STYLES[step.status];
  const detail = step.detail ?? step.description;

  return (
    <button
      type="button"
      onClick={() => onNavigate?.(step.section)}
      className={cn(
        "mt-3 flex w-full min-h-17 flex-col items-center rounded-lg px-1 py-2 text-center transition-colors hover:bg-muted/50",
        isCurrent && "bg-muted/70 ring-1 ring-primary/15",
      )}
    >
      <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        Step {index + 1}
      </span>
      <span
        className={cn(
          "mt-0.5 text-sm leading-tight font-semibold",
          isCurrent ? "text-foreground" : style.label,
        )}
      >
        {step.label}
      </span>
      <span className="mt-1 line-clamp-2 w-full text-xs leading-snug wrap-break-word text-muted-foreground">
        {detail}
      </span>
    </button>
  );
}

function WorkflowStepRow({
  step,
  index,
  isCurrent,
  isLast,
  onNavigate,
}: {
  step: WorkflowStepView;
  index: number;
  isCurrent: boolean;
  isLast: boolean;
  onNavigate?: (section: ProjectSection) => void;
}) {
  const detail = step.detail ?? step.description;
  const style = STATUS_STYLES[step.status];

  return (
    <li className="flex gap-3">
      <div className="flex w-10 shrink-0 flex-col items-center">
        <StepNodeButton
          step={step}
          index={index}
          isCurrent={isCurrent}
          onNavigate={onNavigate}
        />
        {!isLast && (
          <div
            className={cn(
              "my-1 w-[2px] min-h-8 flex-1 rounded-full",
              step.status === "complete" ? "bg-emerald-500" : "bg-border",
            )}
            aria-hidden
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => onNavigate?.(step.section)}
        className={cn(
          "mb-3 min-w-0 flex-1 rounded-lg py-1 text-left transition-colors hover:bg-muted/50",
          isCurrent && "bg-muted/70 px-2 ring-1 ring-primary/15",
        )}
      >
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Step {index + 1}
        </span>
        <span
          className={cn(
            "mt-0.5 block text-sm font-semibold",
            isCurrent ? "text-foreground" : style.label,
          )}
        >
          {step.label}
        </span>
        <span className="mt-1 block text-xs leading-snug wrap-break-word text-muted-foreground">
          {detail}
        </span>
      </button>
    </li>
  );
}

export function WorkflowProgress({
  steps,
  currentStep,
  onNavigate,
}: WorkflowProgressProps) {
  const n = steps.length;
  const trackInset = n > 0 ? `${100 / (2 * n)}%` : "10%";
  const trackSpan = n > 0 ? `${100 - 100 / n}%` : "80%";
  const progress = trackProgressRatio(steps);

  return (
    <div className="rounded-xl border bg-muted/20 p-4 md:p-5">
      <div className="relative hidden lg:block">
        <div
          className="pointer-events-none absolute top-5 h-[2px] -translate-y-1/2 rounded-full bg-border"
          style={{ left: trackInset, width: trackSpan }}
          aria-hidden
        />
        {progress > 0 && (
          <div
            className="pointer-events-none absolute top-5 h-[2px] -translate-y-1/2 rounded-full bg-emerald-500"
            style={{
              left: trackInset,
              width: `calc(${trackSpan} * ${progress})`,
            }}
            aria-hidden
          />
        )}

        <ol className="relative flex w-full">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className="flex min-w-0 flex-1 flex-col items-center"
            >
              <div className="flex h-10 w-full items-center justify-center">
                <StepNodeButton
                  step={step}
                  index={index}
                  isCurrent={step.id === currentStep}
                  onNavigate={onNavigate}
                />
              </div>
              <StepLabel
                step={step}
                index={index}
                isCurrent={step.id === currentStep}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ol>
      </div>

      <ol className="flex flex-col lg:hidden">
        {steps.map((step, index) => (
          <WorkflowStepRow
            key={step.id}
            step={step}
            index={index}
            isCurrent={step.id === currentStep}
            isLast={index === steps.length - 1}
            onNavigate={onNavigate}
          />
        ))}
      </ol>
    </div>
  );
}
