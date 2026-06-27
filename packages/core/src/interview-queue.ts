import fs from "node:fs/promises";
import path from "node:path";
import { getProjectPaths } from "./paths.js";

export type InterviewRowStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped";

export interface InterviewQueueRow {
  status: InterviewRowStatus;
  quest?: string;
  workerProfileId?: string;
  /** When set (manual run), only this profile may claim the row. */
  assignedProfileId?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  lastHeartbeatAt?: string;
  lastQuestion?: string;
  error?: string | null;
}

export interface InterviewQueueFile {
  version: 1;
  rowCount: number;
  rows: Record<string, InterviewQueueRow>;
}

export interface InterviewQueueSummary {
  rowCount: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
  skipped: number;
  rows: Array<InterviewQueueRow & { index: number }>;
}

const STALE_IN_PROGRESS_MS = 15 * 60 * 1000;

function queuePath(projectId: string): string {
  return getProjectPaths(projectId).interviewQueueJson;
}

function emptyQueue(rowCount: number): InterviewQueueFile {
  const rows: Record<string, InterviewQueueRow> = {};
  for (let i = 0; i < rowCount; i++) {
    rows[String(i)] = { status: "pending" };
  }
  return { version: 1, rowCount, rows };
}

async function readQueueFile(projectId: string): Promise<InterviewQueueFile | null> {
  try {
    const raw = JSON.parse(await fs.readFile(queuePath(projectId), "utf-8"));
    return raw as InterviewQueueFile;
  } catch {
    return null;
  }
}

async function cleanupOrphanQueueTmpFiles(queueFile: string): Promise<void> {
  const dir = path.dirname(queueFile);
  const prefix = `${path.basename(queueFile)}.`;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix) && name.endsWith(".tmp"))
      .map((name) => fs.unlink(path.join(dir, name)).catch(() => {})),
  );
}

async function writeQueueAtomic(
  projectId: string,
  queue: InterviewQueueFile,
): Promise<void> {
  const file = queuePath(projectId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await cleanupOrphanQueueTmpFiles(file);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(queue, null, 2));
    try {
      await fs.rename(tmp, file);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      // Windows cannot replace an existing file via rename alone.
      if (code === "EPERM" || code === "EEXIST" || code === "ENOTEMPTY") {
        await fs.unlink(file).catch(() => {});
        await fs.rename(tmp, file);
      } else {
        throw e;
      }
    }
  } catch (e) {
    await fs.unlink(tmp).catch(() => {});
    throw e;
  }
}

async function withQueueLock<T>(
  projectId: string,
  fn: (queue: InterviewQueueFile) => T | Promise<T>,
  retries = 8,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const queue = (await readQueueFile(projectId)) ?? emptyQueue(0);
      const result = await fn(queue);
      await writeQueueAtomic(projectId, queue);
      return result;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Queue lock failed");
}

function recoverStaleInProgress(queue: InterviewQueueFile): void {
  const now = Date.now();
  for (const row of Object.values(queue.rows)) {
    if (row.status !== "in_progress" || !row.lastHeartbeatAt) continue;
    const age = now - new Date(row.lastHeartbeatAt).getTime();
    if (age > STALE_IN_PROGRESS_MS) {
      row.status = "pending";
      row.workerProfileId = undefined;
      row.sessionId = undefined;
      row.error = "Recovered stale in-progress row";
    }
  }
}

export async function initInterviewQueue(
  projectId: string,
  rowCount: number,
  reset = false,
): Promise<InterviewQueueFile> {
  const existing = await readQueueFile(projectId);
  if (!reset && existing && existing.rowCount === rowCount) {
    recoverStaleInProgress(existing);
    await writeQueueAtomic(projectId, existing);
    return existing;
  }

  const queue = emptyQueue(rowCount);
  if (!reset && existing) {
    for (const [key, prev] of Object.entries(existing.rows)) {
      if (queue.rows[key] && prev.status === "completed") {
        queue.rows[key] = { ...prev };
      }
    }
  }
  await writeQueueAtomic(projectId, queue);
  return queue;
}

export function queueUsesManualAssignments(queue: InterviewQueueFile): boolean {
  return Object.values(queue.rows).some((row) => row.assignedProfileId);
}

export async function clearManualAssignments(projectId: string): Promise<void> {
  await withQueueLock(projectId, (queue) => {
    for (const row of Object.values(queue.rows)) {
      delete row.assignedProfileId;
      if (row.status === "skipped") {
        row.status = "pending";
      }
    }
  });
}

/** Assign specific rows to caller profiles; unassigned rows become skipped. */
export async function applyManualAssignments(
  projectId: string,
  assignments: Record<string, number[]>,
): Promise<void> {
  await withQueueLock(projectId, (queue) => {
    for (const row of Object.values(queue.rows)) {
      delete row.assignedProfileId;
      if (row.status === "skipped") {
        row.status = "pending";
      }
    }

    const assigned = new Set<number>();
    for (const [profileId, indices] of Object.entries(assignments)) {
      for (const index of indices) {
        const key = String(index);
        const row = queue.rows[key];
        if (!row || row.status === "completed") continue;
        row.assignedProfileId = profileId;
        row.status = "pending";
        assigned.add(index);
      }
    }

    for (const [key, row] of Object.entries(queue.rows)) {
      const index = Number(key);
      if (row.status === "completed") continue;
      if (!assigned.has(index)) {
        row.status = "skipped";
        delete row.assignedProfileId;
      }
    }
  });
}

export async function claimNextRow(
  projectId: string,
  workerProfileId: string,
  sessionId: string,
): Promise<number | null> {
  return withQueueLock(projectId, (queue) => {
    recoverStaleInProgress(queue);
    const manual = queueUsesManualAssignments(queue);
    const indices = Object.keys(queue.rows)
      .map((k) => Number(k))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);

    for (const index of indices) {
      const key = String(index);
      const row = queue.rows[key];
      if (!row || row.status !== "pending") continue;
      if (manual) {
        if (row.assignedProfileId !== workerProfileId) continue;
      }

      queue.rows[key] = {
        ...row,
        status: "in_progress",
        workerProfileId,
        sessionId,
        startedAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        error: null,
      };
      return index;
    }
    return null;
  });
}

export async function heartbeatRow(
  projectId: string,
  rowIndex: number,
  sessionId: string,
  lastQuestion?: string,
): Promise<void> {
  await withQueueLock(projectId, (queue) => {
    const key = String(rowIndex);
    const row = queue.rows[key];
    if (!row || row.sessionId !== sessionId) return;
    row.lastHeartbeatAt = new Date().toISOString();
    if (lastQuestion) row.lastQuestion = lastQuestion;
  });
}

export async function markRowCompleted(
  projectId: string,
  rowIndex: number,
  sessionId: string,
  quest: string,
  lastQuestion?: string,
): Promise<void> {
  await withQueueLock(projectId, (queue) => {
    const key = String(rowIndex);
    const row = queue.rows[key];
    if (!row || row.sessionId !== sessionId) return;
    queue.rows[key] = {
      ...row,
      status: "completed",
      quest,
      completedAt: new Date().toISOString(),
      lastQuestion,
      error: null,
    };
  });
}

export async function markRowFailed(
  projectId: string,
  rowIndex: number,
  sessionId: string,
  error: string,
  quest?: string,
  lastQuestion?: string,
): Promise<void> {
  await withQueueLock(projectId, (queue) => {
    const key = String(rowIndex);
    const row = queue.rows[key];
    if (!row || row.sessionId !== sessionId) return;
    queue.rows[key] = {
      ...row,
      status: "failed",
      quest: quest ?? row.quest,
      completedAt: new Date().toISOString(),
      lastQuestion: lastQuestion ?? row.lastQuestion,
      error,
    };
  });
}

export async function releaseRow(
  projectId: string,
  rowIndex: number,
  sessionId: string,
  error?: string,
): Promise<void> {
  await withQueueLock(projectId, (queue) => {
    const key = String(rowIndex);
    const row = queue.rows[key];
    if (!row || row.sessionId !== sessionId) return;
    queue.rows[key] = {
      ...row,
      status: "pending",
      workerProfileId: undefined,
      sessionId: undefined,
      startedAt: undefined,
      lastHeartbeatAt: undefined,
      error: error ?? row.error ?? null,
    };
  });
}

export async function resetInterviewQueueRows(
  projectId: string,
  statuses: InterviewRowStatus[] = ["failed", "in_progress"],
): Promise<number> {
  let resetCount = 0;
  await withQueueLock(projectId, (queue) => {
    for (const [key, row] of Object.entries(queue.rows)) {
      if (!statuses.includes(row.status)) continue;
      queue.rows[key] = {
        ...row,
        status: "pending",
        workerProfileId: undefined,
        sessionId: undefined,
        startedAt: undefined,
        completedAt: undefined,
        lastHeartbeatAt: undefined,
        lastQuestion: undefined,
        error: null,
      };
      resetCount++;
    }
  });
  return resetCount;
}

export async function setInterviewQueueRowStatus(
  projectId: string,
  indices: number[],
  status: InterviewRowStatus,
  onlyFromStatuses?: InterviewRowStatus[],
): Promise<number> {
  let updated = 0;
  const allowed = onlyFromStatuses ? new Set(onlyFromStatuses) : null;

  await withQueueLock(projectId, (queue) => {
    for (const index of indices) {
      const key = String(index);
      const row = queue.rows[key];
      if (!row) continue;
      if (allowed && !allowed.has(row.status)) continue;

      if (status === "pending") {
        queue.rows[key] = {
          ...row,
          status: "pending",
          workerProfileId: undefined,
          sessionId: undefined,
          startedAt: undefined,
          completedAt: undefined,
          lastHeartbeatAt: undefined,
          lastQuestion: undefined,
          error: null,
        };
      } else if (status === "skipped") {
        if (row.status === "completed" || row.status === "in_progress") continue;
        queue.rows[key] = {
          ...row,
          status: "skipped",
          workerProfileId: undefined,
          sessionId: undefined,
          startedAt: undefined,
          completedAt: undefined,
          lastHeartbeatAt: undefined,
          error: null,
        };
        delete queue.rows[key].assignedProfileId;
      } else {
        queue.rows[key] = { ...row, status };
      }
      updated++;
    }
  });

  return updated;
}

export async function getInterviewQueueSummary(
  projectId: string,
): Promise<InterviewQueueSummary | null> {
  const queue = await readQueueFile(projectId);
  if (!queue) return null;

  recoverStaleInProgress(queue);
  await writeQueueAtomic(projectId, queue);

  const summary: InterviewQueueSummary = {
    rowCount: queue.rowCount,
    pending: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    rows: [],
  };

  for (const [key, row] of Object.entries(queue.rows)) {
    const index = Number(key);
    summary[row.status]++;
    summary.rows.push({ ...row, index });
  }
  summary.rows.sort((a, b) => a.index - b.index);
  return summary;
}

export function formatQuestId(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^\d{10}$/.test(value)) return value;
  const digits = value.replace(/\D/g, "");
  if (!digits) return value;
  return digits.padStart(10, "0");
}
