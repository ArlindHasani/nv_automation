"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ProjectBundle, ProjectSection } from "@/lib/types";

interface WorkerState {
  id: string;
  projectId: string;
  rowIndex: number;
  status: string;
  logs: string[];
}

interface ProjectContextValue {
  projectId: string;
  section: ProjectSection;
  bundle: ProjectBundle | null;
  workers: WorkerState[];
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function hasActiveWorkers(workers: WorkerState[], projectId: string): boolean {
  return workers.some(
    (w) =>
      w.projectId === projectId &&
      w.status !== "completed" &&
      w.status !== "failed",
  );
}

async function fetchProjectData(projectId: string): Promise<{
  bundle: ProjectBundle | null;
  workers: WorkerState[];
}> {
  const [pRes, wRes] = await Promise.all([
    fetch(`/api/projects/${projectId}`),
    fetch("/api/workers"),
  ]);
  return {
    bundle: pRes.ok ? await pRes.json() : null,
    workers: wRes.ok ? await wRes.json() : [],
  };
}

export function ProjectProvider({
  projectId,
  section,
  children,
}: {
  projectId: string;
  section: ProjectSection;
  children: React.ReactNode;
}) {
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [workers, setWorkers] = useState<WorkerState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refreshWorkers = useCallback(async () => {
    const wRes = await fetch("/api/workers");
    if (wRes.ok) setWorkers(await wRes.json());
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchProjectData(projectId);
      if (data.bundle) setBundle(data.bundle);
      setWorkers(data.workers);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  // Load on project open and when switching workflow sections.
  useEffect(() => {
    let cancelled = false;

    void fetchProjectData(projectId).then((data) => {
      if (cancelled) return;
      if (data.bundle) setBundle(data.bundle);
      setWorkers(data.workers);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, section]);

  // Worker status/logs only — not project config. Runs while interviews are active.
  useEffect(() => {
    if (section !== "run" || !hasActiveWorkers(workers, projectId)) return;

    const interval = setInterval(() => {
      void refreshWorkers();
    }, 2000);

    return () => clearInterval(interval);
  }, [section, projectId, workers, refreshWorkers]);

  return (
    <ProjectContext.Provider
      value={{
        projectId,
        section,
        bundle,
        workers,
        loading,
        refreshing,
        refresh,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
