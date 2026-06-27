"use client";

import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const tipContentClass =
  "flex max-w-sm flex-col gap-2 text-left text-xs leading-relaxed text-background [&_p]:text-background/90";

export function TipItem({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="font-semibold text-background">{title}</p>
      <p className="text-background/85">{children}</p>
    </div>
  );
}

export function TipText({ children }: { children: ReactNode }) {
  return <p className="text-background/90">{children}</p>;
}

export function HelpTip({
  content,
  className,
  side = "top",
}: {
  content: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              className,
            )}
            aria-label="More information"
          />
        }
      >
        <CircleHelp className="size-3.5" strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent side={side} className={tipContentClass}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export function LabelWithHelp({
  children,
  help,
  htmlFor,
  className,
}: {
  children: ReactNode;
  help?: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{children}</Label>
      {help ? <HelpTip content={help} /> : null}
    </div>
  );
}

export function ActionWithHelp({
  children,
  help,
  className,
}: {
  children: ReactNode;
  help: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      {children}
      <HelpTip content={help} />
    </div>
  );
}
