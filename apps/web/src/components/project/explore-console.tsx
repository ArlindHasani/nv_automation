"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ExploreLogLevel } from "@/lib/explore-stream";

export interface ExploreConsoleLine {
  id: string;
  level: ExploreLogLevel;
  message: string;
  ts: string;
}

const LEVEL_STYLES: Record<ExploreLogLevel, string> = {
  info: "text-zinc-300",
  warn: "text-amber-400",
  error: "text-red-400",
  success: "text-emerald-400",
};

function formatTime(iso: string): string {
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

export function ExploreConsole({
  lines,
  running,
  className,
}: {
  lines: ExploreConsoleLine[];
  running: boolean;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, running]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-inner",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-2">
        <span className="font-mono text-xs font-medium text-zinc-400">
          explore — live output
        </span>
        <span className="flex items-center gap-2 font-mono text-xs text-zinc-500">
          {running && (
            <span className="inline-flex items-center gap-1.5 text-emerald-500">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              running
            </span>
          )}
          {!running && lines.length > 0 && "idle"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="h-72 overflow-y-auto overscroll-y-contain p-4 font-mono text-sm"
      >
        {lines.length === 0 ? (
          <p className="text-zinc-600">
            Run explore to watch the test link walkthrough here…
          </p>
        ) : (
          <div className="space-y-0.5">
            {lines.map((line, index) => (
              <div key={`${line.id}-${index}`} className="flex gap-3 leading-relaxed">
                <span className="shrink-0 text-zinc-600">
                  {formatTime(line.ts)}
                </span>
                <span className={cn("min-w-0 break-words", LEVEL_STYLES[line.level])}>
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
