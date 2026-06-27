"use client";

import { useEffect, useMemo, useState } from "react";
import { Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSegment } from "@/components/project/filter-group";
import { cn } from "@/lib/utils";
import { formatStatusLabel } from "@/lib/format-labels";
import { useStickToBottomScroll } from "@/hooks/use-stick-to-bottom-scroll";

type LogLevel = "info" | "warn" | "error" | "success";

export interface WorkerConsoleWorker {
  id: string;
  workerProfileLabel: string;
  workerProfileId: string;
  status: string;
  logs: string[];
  startedAt?: string;
  finishedAt?: string;
}

interface WorkerConsoleProps {
  workers: WorkerConsoleWorker[];
  onStop?: (workerId: string) => void;
  className?: string;
}

function parseLogLevel(line: string): { level: LogLevel; message: string } {
  if (line.startsWith("[stderr]")) {
    return { level: "error", message: line.slice("[stderr]".length).trim() };
  }
  const bracket = line.match(/^\[(info|warn|error|success)\]\s*(.*)$/i);
  if (bracket) {
    return {
      level: bracket[1].toLowerCase() as LogLevel,
      message: bracket[2],
    };
  }
  if (/error|failed|exception/i.test(line)) {
    return { level: "error", message: line };
  }
  if (/warn/i.test(line)) {
    return { level: "warn", message: line };
  }
  if (/complete|success|finished/i.test(line)) {
    return { level: "success", message: line };
  }
  return { level: "info", message: line };
}

const LEVEL_STYLES: Record<LogLevel, string> = {
  info: "text-zinc-300",
  warn: "text-amber-400",
  error: "text-red-400",
  success: "text-emerald-400",
};

function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function WorkerConsole({
  workers,
  onStop,
  className,
}: WorkerConsoleProps) {
  const [selectedId, setSelectedId] = useState<string>("");

  const sortedWorkers = useMemo(
    () =>
      [...workers].sort((a, b) => {
        if (a.status === "running" && b.status !== "running") return -1;
        if (b.status === "running" && a.status !== "running") return 1;
        return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
      }),
    [workers],
  );

  useEffect(() => {
    if (sortedWorkers.length === 0) {
      setSelectedId("");
      return;
    }
    const stillVisible = sortedWorkers.some((w) => w.id === selectedId);
    if (!stillVisible) {
      const next =
        sortedWorkers.find((w) => w.status === "running") ?? sortedWorkers[0];
      setSelectedId(next.id);
    }
  }, [sortedWorkers, selectedId]);

  const selected = sortedWorkers.find((w) => w.id === selectedId);
  const anyRunning = sortedWorkers.some((w) => w.status === "running");

  const lines = useMemo(() => {
    if (!selected) return [];
    return selected.logs.map((line, index) => ({
      id: `${selected.id}-${index}`,
      ...parseLogLevel(line),
    }));
  }, [selected]);

  const scrollRef = useStickToBottomScroll<HTMLDivElement>(selectedId, [lines]);

  if (sortedWorkers.length === 0) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-inner",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-2">
          <span className="font-mono text-xs font-medium text-zinc-400">
            callers — live output
          </span>
        </div>
        <div className="p-4 font-mono text-sm text-zinc-600">
          Start workers to stream caller logs here…
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-inner",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 py-2">
        <span className="font-mono text-xs font-medium text-zinc-400">
          callers — live output
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {anyRunning ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-emerald-500">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              {sortedWorkers.filter((w) => w.status === "running").length} running
            </span>
          ) : (
            <span className="font-mono text-xs text-zinc-500">idle</span>
          )}
          {selected?.status === "running" && onStop ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              onClick={() => onStop(selected.id)}
            >
              <Square className="mr-1 size-3 fill-current" />
              Stop
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 border-b border-zinc-800 bg-zinc-900/40 px-4 py-3">
        <FilterSegment
          value={selectedId}
          onChange={setSelectedId}
          options={sortedWorkers.map((w) => ({
            value: w.id,
            label: w.workerProfileLabel,
            count: w.logs.length,
          }))}
        />
        {selected ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge
              variant={
                selected.status === "running"
                  ? "default"
                  : selected.status === "completed"
                    ? "secondary"
                    : "destructive"
              }
            >
              {formatStatusLabel(selected.status)}
            </Badge>
            <span className="font-mono text-zinc-500">{selected.id}</span>
            {selected.startedAt ? (
              <span className="text-zinc-500">
                started {formatTime(selected.startedAt)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="h-80 overflow-y-auto overscroll-y-contain p-4 font-mono text-sm"
      >
        {lines.length === 0 ? (
          <p className="text-zinc-600">Waiting for logs from {selected?.workerProfileLabel}…</p>
        ) : (
          <div className="space-y-0.5">
            {lines.map((line) => (
              <div key={line.id} className="flex gap-3 leading-relaxed">
                <span className="shrink-0 select-none text-zinc-600 tabular-nums">
                  {String(line.id.split("-").pop()).padStart(4, "0")}
                </span>
                <span className={cn("min-w-0 wrap-break-word", LEVEL_STYLES[line.level])}>
                  {line.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
