const sessions = new Map<string, AbortController>();

export function startExploreSession(projectId: string): AbortController {
  const existing = sessions.get(projectId);
  if (existing) {
    existing.abort();
  }
  const controller = new AbortController();
  sessions.set(projectId, controller);
  return controller;
}

export function stopExploreSession(projectId: string): boolean {
  const controller = sessions.get(projectId);
  if (!controller || controller.signal.aborted) {
    return false;
  }
  controller.abort();
  return true;
}

export function endExploreSession(projectId: string): void {
  sessions.delete(projectId);
}

export function isExploreRunning(projectId: string): boolean {
  const controller = sessions.get(projectId);
  return controller !== undefined && !controller.signal.aborted;
}
