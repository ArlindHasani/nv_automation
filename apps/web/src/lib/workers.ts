import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import {
  ensurePlaywrightBrowsersEnv,
  getPlaywrightBrowsersPath,
  getProject,
  getRepoRoot,
} from "@nv/core";
import { prepareForExecution } from "@/lib/projects";

export interface WorkerState {
  id: string;
  projectId: string;
  workerProfileId: string;
  workerProfileLabel: string;
  status: "running" | "completed" | "failed" | "stopped";
  logs: string[];
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
}

class WorkerManager {
  private workers = new Map<string, WorkerState>();
  private processes = new Map<string, ReturnType<typeof spawn>>();
  private activeProfiles = new Set<string>();

  list(): WorkerState[] {
    return [...this.workers.values()];
  }

  get(id: string): WorkerState | undefined {
    return this.workers.get(id);
  }

  async startLiveWorker(
    projectSlug: string,
    workerProfileId: string,
    headed = false,
  ): Promise<WorkerState> {
    const profileKey = `${projectSlug}:${workerProfileId}`;
    if (this.activeProfiles.has(profileKey)) {
      throw new Error(`Worker profile ${workerProfileId} is already running`);
    }

    const project = await getProject(projectSlug);
    if (!project) throw new Error("Project not found");

    const profile = project.workerProfiles.find((p) => p.id === workerProfileId);
    if (!profile) throw new Error(`Worker profile not found: ${workerProfileId}`);

    await prepareForExecution(projectSlug);

    const id = `live-${workerProfileId}-${Date.now()}`;
    const state: WorkerState = {
      id,
      projectId: projectSlug,
      workerProfileId,
      workerProfileLabel: profile.label,
      status: "running",
      logs: [],
      startedAt: new Date().toISOString(),
    };
    this.workers.set(id, state);
    this.activeProfiles.add(profileKey);

    const script = path.join(getRepoRoot(), "workers", "run-live-worker.ts");
    const args = [
      "tsx",
      script,
      projectSlug,
      workerProfileId,
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
        NV_WORKER_ID: id,
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
      this.activeProfiles.delete(profileKey);
    });

    return state;
  }

  stop(id: string): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;
    proc.kill("SIGTERM");
    const state = this.workers.get(id);
    if (state) {
      state.status = "stopped";
      state.finishedAt = new Date().toISOString();
      this.activeProfiles.delete(`${state.projectId}:${state.workerProfileId}`);
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
