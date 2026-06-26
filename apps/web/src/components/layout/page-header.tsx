import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  projectName?: string;
  description?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
}

export function PageHeader({
  title,
  projectName,
  description,
  icon: Icon,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-5 border-b bg-gradient-to-r from-card/80 to-card/40 px-8 py-8 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary md:size-12">
              <Icon className="size-5 md:size-6" />
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {title}
            </h1>
            {projectName && (
              <p
                className="line-clamp-2 text-sm leading-snug font-medium break-all text-muted-foreground"
                title={projectName}
              >
                {projectName}
              </p>
            )}
          </div>
        </div>
        {description && (
          <div className="max-w-2xl pl-0 text-sm text-muted-foreground md:pl-14 md:text-base">
            {description}
          </div>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-3">{children}</div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "default" | "warning";
  /** metric = large number; text = clamped label (dataset names, etc.) */
  valueVariant?: "metric" | "text";
  className?: string;
}

export function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  valueVariant = "metric",
  className,
}: StatCardProps) {
  const valueTitle =
    typeof value === "string" && value.length > 28 ? value : undefined;
  const subtitleTitle =
    subtitle && subtitle.length > 40 ? subtitle : undefined;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase md:text-sm md:normal-case md:tracking-normal">
          {label}
        </p>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl md:size-10",
            variant === "warning"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-4 md:size-5" />
        </div>
      </div>
      <p
        className={cn(
          "mt-2.5 font-semibold tracking-tight",
          valueVariant === "metric"
            ? "text-3xl md:text-4xl"
            : "line-clamp-2 text-sm leading-snug break-all md:text-base",
          variant === "warning" && valueVariant === "metric" && "text-destructive",
        )}
        title={valueTitle}
      >
        {value}
      </p>
      {subtitle && (
        <p
          className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground"
          title={subtitleTitle}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
