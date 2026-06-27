"use client";

import { CheckCircle2, XCircle, ChevronDown } from "lucide-react";

interface ExplorePreflightCardProps {
  preflight: {
    ready: boolean;
    checks: Array<{
      id: string;
      label: string;
      ok: boolean;
      detail?: string;
    }>;
  };
  defaultOpen?: boolean;
  title?: string;
}

export function ExplorePreflightCard({
  preflight,
  defaultOpen,
  title = "Pre-flight",
}: ExplorePreflightCardProps) {
  const failed = preflight.checks.filter((c) => !c.ok);
  const open = defaultOpen ?? failed.length > 0;

  return (
    <details
      className="group rounded-lg border bg-muted/20 text-sm"
      open={open}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
        {preflight.ready ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        ) : (
          <XCircle className="size-4 shrink-0 text-amber-600" />
        )}
        <span className="flex-1 font-medium">
          {title} {preflight.ready ? "— ready" : "— action needed"}
        </span>
        <span className="text-xs text-muted-foreground">
          {preflight.checks.filter((c) => c.ok).length}/{preflight.checks.length}{" "}
          passed
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ul className="space-y-2 border-t px-3 py-2">
        {preflight.checks.map((check) => (
          <li key={check.id} className="flex items-start gap-2 text-sm">
            {check.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            )}
            <div>
              <span className="font-medium">{check.label}</span>
              {check.detail && (
                <p className="text-xs text-muted-foreground">{check.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
