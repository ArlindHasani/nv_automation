import fs from "node:fs/promises";
import path from "node:path";
import {
  buildCoverageReport,
  type CoverageReport,
  type Definition,
  DefinitionSchema,
  type InterviewData,
  InterviewDataSchema,
  type ProjectConfig,
  ProjectConfigSchema,
  type SavFieldMap,
} from "@nv/core";
import {
  datasetDir,
  ensureDir,
  getDb,
  newId,
  slugify,
} from "./db.js";

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  nvLoginUrl: string;
  liveLink: string;
  testLink: string;
  mode: string;
  loiTargetMinutes: number;
  loiJitterPercent: number;
  maxWorkers: number;
  savFieldMap: SavFieldMap;
  activeDatasetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetRow {
  id: string;
  projectId: string;
  name: string;
  rowCount: number;
  dataPath: string;
  savPath: string | null;
  isActive: boolean;
  importedAt: string;
}

export interface ExploreRunRow {
  id: string;
  projectId: string;
  status: string;
  added: string[];
  updated: string[];
  conflicts: unknown[];
  discovered: number;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  nvLoginUrl?: string;
  liveLink?: string;
  testLink?: string;
  mode?: string;
  loiTargetMinutes?: number;
  loiJitterPercent?: number;
  maxWorkers?: number;
  savFieldMap?: SavFieldMap;
}

export interface UpdateProjectInput {
  name?: string;
  nvLoginUrl?: string;
  liveLink?: string;
  testLink?: string;
  mode?: string;
  loiTargetMinutes?: number;
  loiJitterPercent?: number;
  maxWorkers?: number;
  savFieldMap?: SavFieldMap;
}

type ProjectRecord = {
  id: string;
  slug: string;
  name: string;
  nv_login_url: string;
  live_link: string;
  test_link: string;
  mode: string;
  loi_target_minutes: number;
  loi_jitter_percent: number;
  max_workers: number;
  sav_field_map: string;
  active_dataset_id: string | null;
  created_at: string;
  updated_at: string;
};

type DatasetRecord = {
  id: string;
  project_id: string;
  name: string;
  row_count: number;
  data_path: string;
  sav_path: string | null;
  is_active: number;
  imported_at: string;
};

function rowToProject(r: ProjectRecord): ProjectRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    nvLoginUrl: r.nv_login_url,
    liveLink: r.live_link,
    testLink: r.test_link,
    mode: r.mode,
    loiTargetMinutes: r.loi_target_minutes,
    loiJitterPercent: r.loi_jitter_percent,
    maxWorkers: r.max_workers,
    savFieldMap: JSON.parse(r.sav_field_map) as SavFieldMap,
    activeDatasetId: r.active_dataset_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToDataset(r: DatasetRecord): DatasetRow {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    rowCount: r.row_count,
    dataPath: r.data_path,
    savPath: r.sav_path,
    isActive: r.is_active === 1,
    importedAt: r.imported_at,
  };
}

const DEFAULT_SAV_MAP: SavFieldMap = {
  station: "nomp",
  password: "password",
  id: "ws",
  project: "quest",
  group: "s_ini",
};

export function projectToConfig(p: ProjectRow): ProjectConfig {
  return ProjectConfigSchema.parse({
    name: p.name,
    nvLoginUrl: p.nvLoginUrl,
    liveLink: p.liveLink,
    testLink: p.testLink,
    mode: p.mode,
    loi: {
      targetMinutes: p.loiTargetMinutes,
      jitterPercent: p.loiJitterPercent,
    },
    workers: { maxConcurrent: p.maxWorkers },
    savFieldMap: p.savFieldMap,
  });
}

export function listProjects(): ProjectRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
    .all() as ProjectRecord[];
  return rows.map(rowToProject);
}

export function getProjectBySlug(slug: string): ProjectRow | null {
  const row = getDb()
    .prepare("SELECT * FROM projects WHERE slug = ?")
    .get(slug) as ProjectRecord | undefined;
  return row ? rowToProject(row) : null;
}

export function getProjectById(id: string): ProjectRow | null {
  const row = getDb()
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(id) as ProjectRecord | undefined;
  return row ? rowToProject(row) : null;
}

export function createProject(input: CreateProjectInput): ProjectRow {
  const db = getDb();
  const id = newId();
  const now = new Date().toISOString();
  let slug = input.slug ? slugify(input.slug) : slugify(input.name);

  const existing = db.prepare("SELECT 1 FROM projects WHERE slug = ?").get(slug);
  if (existing) slug = `${slug}-${id.slice(0, 6)}`;

  const savFieldMap = input.savFieldMap ?? DEFAULT_SAV_MAP;

  db.prepare(
    `INSERT INTO projects (
      id, slug, name, nv_login_url, live_link, test_link, mode,
      loi_target_minutes, loi_jitter_percent, max_workers, sav_field_map,
      active_dataset_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    slug,
    input.name,
    input.nvLoginUrl ?? "https://nv25.ffind.com/nv_rev2/login.php",
    input.liveLink ?? "",
    input.testLink ?? "",
    input.mode ?? "Cloning",
    input.loiTargetMinutes ?? 12,
    input.loiJitterPercent ?? 15,
    input.maxWorkers ?? 2,
    JSON.stringify(savFieldMap),
    now,
    now,
  );

  const definition: Definition = {
    Name: input.name,
    Questions: [],
    Coherencies: [],
    Length: [0, 0],
  };
  saveDefinition(id, definition);

  return getProjectById(id)!;
}

export function updateProject(
  slug: string,
  input: UpdateProjectInput,
): ProjectRow | null {
  const project = getProjectBySlug(slug);
  if (!project) return null;

  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE projects SET
      name = ?, nv_login_url = ?, live_link = ?, test_link = ?, mode = ?,
      loi_target_minutes = ?, loi_jitter_percent = ?, max_workers = ?,
      sav_field_map = ?, updated_at = ?
    WHERE id = ?`,
  ).run(
    input.name ?? project.name,
    input.nvLoginUrl ?? project.nvLoginUrl,
    input.liveLink ?? project.liveLink,
    input.testLink ?? project.testLink,
    input.mode ?? project.mode,
    input.loiTargetMinutes ?? project.loiTargetMinutes,
    input.loiJitterPercent ?? project.loiJitterPercent,
    input.maxWorkers ?? project.maxWorkers,
    JSON.stringify(input.savFieldMap ?? project.savFieldMap),
    now,
    project.id,
  );

  return getProjectBySlug(slug);
}

export function getDefinition(projectId: string): Definition {
  const row = getDb()
    .prepare("SELECT content FROM definitions WHERE project_id = ?")
    .get(projectId) as { content: string } | undefined;

  if (!row) {
    return { Name: "", Questions: [], Coherencies: [], Length: [0, 0] };
  }
  return DefinitionSchema.parse(JSON.parse(row.content));
}

export function saveDefinition(
  projectId: string,
  definition: Definition,
): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO definitions (project_id, content, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    )
    .run(projectId, JSON.stringify(definition), now);

  getDb()
    .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
    .run(now, projectId);
}

export function listDatasets(projectId: string): DatasetRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM datasets WHERE project_id = ? ORDER BY imported_at DESC",
    )
    .all(projectId) as DatasetRecord[];
  return rows.map(rowToDataset);
}

export function getActiveDataset(projectId: string): DatasetRow | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM datasets WHERE project_id = ? AND is_active = 1 LIMIT 1",
    )
    .get(projectId) as DatasetRecord | undefined;
  return row ? rowToDataset(row) : null;
}

export async function loadDatasetRows(dataset: DatasetRow): Promise<InterviewData> {
  const raw = await fs.readFile(dataset.dataPath, "utf-8");
  return InterviewDataSchema.parse(JSON.parse(raw));
}

export async function importDataset(
  projectId: string,
  name: string,
  rows: InterviewData,
  savPath?: string,
): Promise<{ dataset: DatasetRow; coverage: CoverageReport }> {
  const db = getDb();
  const datasetId = newId();
  const dir = datasetDir(projectId, datasetId);
  ensureDir(dir);

  const dataPath = path.join(dir, "data.json");
  await fs.writeFile(dataPath, JSON.stringify(rows, null, 2));

  let storedSav: string | null = null;
  if (savPath) {
    storedSav = path.join(dir, "source.sav");
    await fs.copyFile(savPath, storedSav);
  }

  const now = new Date().toISOString();
  const isFirst =
    (db
      .prepare("SELECT COUNT(*) as c FROM datasets WHERE project_id = ?")
      .get(projectId) as { c: number }).c === 0;

  if (isFirst) {
    db.prepare("UPDATE datasets SET is_active = 0 WHERE project_id = ?").run(
      projectId,
    );
  }

  db.prepare(
    `INSERT INTO datasets (id, project_id, name, row_count, data_path, sav_path, is_active, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    datasetId,
    projectId,
    name,
    rows.length,
    dataPath,
    storedSav,
    isFirst ? 1 : 0,
    now,
  );

  if (isFirst) {
    db.prepare("UPDATE projects SET active_dataset_id = ? WHERE id = ?").run(
      datasetId,
      projectId,
    );
  }

  const project = getProjectById(projectId)!;
  const definition = getDefinition(projectId);
  const coverage = buildCoverageReport(rows, definition, project.savFieldMap);

  return { dataset: rowToDataset(
    db.prepare("SELECT * FROM datasets WHERE id = ?").get(datasetId) as DatasetRecord,
  ), coverage };
}

export function setActiveDataset(projectId: string, datasetId: string): boolean {
  const db = getDb();
  const ds = db
    .prepare("SELECT id FROM datasets WHERE id = ? AND project_id = ?")
    .get(datasetId, projectId);
  if (!ds) return false;

  db.prepare("UPDATE datasets SET is_active = 0 WHERE project_id = ?").run(
    projectId,
  );
  db.prepare("UPDATE datasets SET is_active = 1 WHERE id = ?").run(datasetId);
  db.prepare("UPDATE projects SET active_dataset_id = ?, updated_at = ? WHERE id = ?").run(
    datasetId,
    new Date().toISOString(),
    projectId,
  );
  return true;
}

export function recordExploreRun(
  projectId: string,
  result: {
    status: string;
    added: string[];
    updated: string[];
    conflicts: unknown[];
    discovered: number;
  },
): ExploreRunRow {
  const id = newId();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO explore_runs (id, project_id, status, added, updated, conflicts, discovered, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      projectId,
      result.status,
      JSON.stringify(result.added),
      JSON.stringify(result.updated),
      JSON.stringify(result.conflicts),
      result.discovered,
      now,
    );

  return {
    id,
    projectId,
    status: result.status,
    added: result.added,
    updated: result.updated,
    conflicts: result.conflicts,
    discovered: result.discovered,
    createdAt: now,
  };
}

export function listExploreRuns(projectId: string, limit = 10): ExploreRunRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM explore_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(projectId, limit) as Array<{
    id: string;
    project_id: string;
    status: string;
    added: string;
    updated: string;
    conflicts: string;
    discovered: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    status: r.status,
    added: JSON.parse(r.added) as string[],
    updated: JSON.parse(r.updated) as string[],
    conflicts: JSON.parse(r.conflicts) as unknown[],
    discovered: r.discovered,
    createdAt: r.created_at,
  }));
}

export async function getProjectBundle(slug: string) {
  const project = getProjectBySlug(slug);
  if (!project) return null;

  const definition = getDefinition(project.id);
  const datasets = listDatasets(project.id);
  const activeDataset = getActiveDataset(project.id);
  const data = activeDataset
    ? await loadDatasetRows(activeDataset)
    : [];
  const coverage = buildCoverageReport(
    data,
    definition,
    project.savFieldMap,
  );
  const exploreRuns = listExploreRuns(project.id);

  return {
    project,
    config: projectToConfig(project),
    definition,
    datasets,
    activeDataset,
    data,
    coverage,
    exploreRuns,
  };
}
