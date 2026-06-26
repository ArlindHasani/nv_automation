import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import { ensurePlaywrightBrowsersEnv, getPlaywrightBrowsersPath, getRepoRoot } from "@nv/core";
import { prepareForExecution } from "@/lib/projects";

export interface WorkerState {
  id: string;
  projectId: string;
  rowIndex: number;
  status: "idle" | "running" | "completed" | "failed";
  logs: string[];
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
}

class WorkerManager {
  private workers = new Map<string, WorkerState>();
  private processes = new Map<string, ReturnType<typeof spawn>>();

  list(): WorkerState[] {
    return [...this.workers.values()];
  }

  get(id: string): WorkerState | undefined {
    return this.workers.get(id);
  }

  async startInterview(
    projectSlug: string,
    rowIndex: number,
    headed = false,
  ): Promise<WorkerState> {
    await prepareForExecution(projectSlug);

    const id = `worker-${Date.now()}-${rowIndex}`;
    const state: WorkerState = {
      id,
      projectId: projectSlug,
      rowIndex,
      status: "running",
      logs: [],
      startedAt: new Date().toISOString(),
    };
    this.workers.set(id, state);

    const script = path.join(getRepoRoot(), "workers", "run-interview.ts");
    const args = [
      "tsx",
      script,
      projectSlug,
      String(rowIndex),
      id,
      ...(headed ? ["--headed"] : []),
    ];

    ensurePlaywrightBrowsersEnv();
    const proc = spawn("npx", args, {
      cwd: getRepoRoot(),
      shell: true,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        PLAYWRIGHT_BROWSERS_PATH: getPlaywrightBrowsersPath(),
      },
    });
    this.processes.set(id, proc);

    const append = (line: string) => {
      state.logs.push(line);
      if (state.logs.length > 500) state.logs.shift();
    };

    proc.stdout?.on("data", (d) => {
      for (const line of d.toString().split("\n").filter(Boolean)) append(line);
    });
    proc.stderr?.on("data", (d) => {
      for (const line of d.toString().split("\n").filter(Boolean)) {
        append(`[stderr] ${line}`);
      }
    });

    proc.on("close", (code) => {
      state.status = code === 0 ? "completed" : "failed";
      state.exitCode = code ?? undefined;
      state.finishedAt = new Date().toISOString();
      this.processes.delete(id);
    });

    return state;
  }

  stop(id: string): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;
    proc.kill("SIGTERM");
    const state = this.workers.get(id);
    if (state) {
      state.status = "failed";
      state.finishedAt = new Date().toISOString();
    }
    return true;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __nvWorkerManager: WorkerManager | undefined;
}

export function getWorkerManager(): WorkerManager {
  if (!global.__nvWorkerManager) {
    global.__nvWorkerManager = new WorkerManager();
  }
  return global.__nvWorkerManager;
}
