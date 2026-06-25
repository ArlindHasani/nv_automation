import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildCoverageReport,
  type CoverageReport,
  type SavVariablesMeta,
} from "./mapping.js";
import { fillDefinitionGapsFromData } from "./fill-gaps.js";
import {
  type Definition,
  DefinitionSchema,
  type InterviewData,
  InterviewDataSchema,
  type ProjectConfig,
  ProjectConfigSchema,
  type SavFieldMap,
} from "./schemas.js";
import { getProjectPaths, getProjectsRoot } from "./paths.js";

const DEFAULT_SAV_MAP: SavFieldMap = {
  station: "nomp",
  password: "password",
  id: "ws",
  project: "quest",
  group: "s_ini",
};

export interface ProjectMeta {
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
  exploreDefaults: Record<string, string>;
  exploreSeedRowIndex: number;
  activeDatasetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetMeta {
  id: string;
  name: string;
  rowCount: number;
  file: string;
  savFile: string | null;
  variablesFile: string | null;
  isActive: boolean;
  importedAt: string;
}

export interface ExploreBlocker {
  question: string;
  type: string;
  reason: string;
  screenshot?: string;
}

export interface ExploreRun {
  id: string;
  status: string;
  added: string[];
  updated: string[];
  conflicts: unknown[];
  discovered: number;
  blockers?: ExploreBlocker[];
  steps?: number;
  discoveredNames?: string[];
  createdAt: string;
}

interface DatasetsManifest {
  activeId: string | null;
  datasets: DatasetMeta[];
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
  exploreDefaults?: Record<string, string>;
  exploreSeedRowIndex?: number;
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
  exploreDefaults?: Record<string, string>;
  exploreSeedRowIndex?: number;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "project";
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function datasetsDir(slug: string): string {
  return path.join(getProjectPaths(slug).dir, "datasets");
}

function manifestPath(slug: string): string {
  return path.join(datasetsDir(slug), "manifest.json");
}

function exploreRunsPath(slug: string): string {
  return path.join(getProjectPaths(slug).dir, "explore-runs.json");
}

function metaPath(slug: string): string {
  return path.join(getProjectPaths(slug).dir, "meta.json");
}

function projectToConfig(meta: ProjectMeta): ProjectConfig {
  const liveLink = meta.liveLink || meta.nvLoginUrl;
  return ProjectConfigSchema.parse({
    name: meta.name,
    nvLoginUrl: liveLink,
    liveLink,
    testLink: meta.testLink,
    mode: meta.mode,
    loi: {
      targetMinutes: meta.loiTargetMinutes,
      jitterPercent: meta.loiJitterPercent,
    },
    workers: { maxConcurrent: meta.maxWorkers },
    savFieldMap: meta.savFieldMap,
    exploreDefaults: meta.exploreDefaults ?? {},
    exploreSeedRowIndex: meta.exploreSeedRowIndex ?? 0,
  });
}

async function readMeta(slug: string): Promise<ProjectMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(slug), "utf-8");
    const meta = JSON.parse(raw) as ProjectMeta;
    if (!meta.exploreDefaults) {
      meta.exploreDefaults = {};
    }
    if (meta.exploreSeedRowIndex === undefined) {
      meta.exploreSeedRowIndex = 0;
    }
    return meta;
  } catch {
    return null;
  }
}

async function writeMeta(slug: string, meta: ProjectMeta): Promise<void> {
  await ensureDir(getProjectPaths(slug).dir);
  await fs.writeFile(metaPath(slug), JSON.stringify(meta, null, 2));
}

/** Bootstrap meta.json + datasets manifest from legacy project.json + Data.json */
async function ensureProjectInitialized(slug: string): Promise<ProjectMeta> {
  const paths = getProjectPaths(slug);
  let meta = await readMeta(slug);
  let bootstrapped = false;

  if (!meta) {
    const now = new Date().toISOString();
    let config: ProjectConfig;
    try {
      config = ProjectConfigSchema.parse(
        JSON.parse(await fs.readFile(paths.projectJson, "utf-8")),
      );
    } catch {
      throw new Error(`Project not found: ${slug}`);
    }

    const liveLink = config.liveLink || config.nvLoginUrl;
    meta = {
      slug,
      name: config.name,
      nvLoginUrl: liveLink,
      liveLink,
      testLink: config.testLink ?? "",
      mode: config.mode,
      loiTargetMinutes: config.loi.targetMinutes,
      loiJitterPercent: config.loi.jitterPercent,
      maxWorkers: config.workers.maxConcurrent,
      savFieldMap: config.savFieldMap,
      exploreDefaults: config.exploreDefaults ?? {},
      exploreSeedRowIndex: config.exploreSeedRowIndex ?? 0,
      activeDatasetId: null,
      createdAt: now,
      updatedAt: now,
    };
    await writeMeta(slug, meta);
    bootstrapped = true;
  }

  await ensureDir(datasetsDir(slug));

  try {
    await fs.access(manifestPath(slug));
  } catch {
    let rows: InterviewData = [];
    try {
      rows = InterviewDataSchema.parse(
        JSON.parse(await fs.readFile(paths.dataJson, "utf-8")),
      );
    } catch {
      rows = [];
    }

    if (rows.length > 0) {
      const id = "default";
      const file = `${id}.json`;
      await fs.writeFile(
        path.join(datasetsDir(slug), file),
        JSON.stringify(rows, null, 2),
      );
      const manifest: DatasetsManifest = {
        activeId: id,
        datasets: [
          {
            id,
            name: "default",
            rowCount: rows.length,
            file,
            savFile: null,
            variablesFile: null,
            isActive: true,
            importedAt: meta.createdAt,
          },
        ],
      };
      await fs.writeFile(manifestPath(slug), JSON.stringify(manifest, null, 2));
      meta.activeDatasetId = id;
      await writeMeta(slug, meta);
    } else {
      await fs.writeFile(
        manifestPath(slug),
        JSON.stringify({ activeId: null, datasets: [] } satisfies DatasetsManifest, null, 2),
      );
    }
    bootstrapped = true;
  }

  if (bootstrapped) {
    await writeProjectSnapshots(slug, meta);
  }
  return meta;
}

async function readManifest(slug: string): Promise<DatasetsManifest> {
  try {
    const raw = await fs.readFile(manifestPath(slug), "utf-8");
    return JSON.parse(raw) as DatasetsManifest;
  } catch {
    return { activeId: null, datasets: [] };
  }
}

async function writeManifest(slug: string, manifest: DatasetsManifest): Promise<void> {
  await fs.writeFile(manifestPath(slug), JSON.stringify(manifest, null, 2));
}

/** Write project.json + Data.json from meta + active dataset (for Playwright workers) */
async function writeProjectSnapshots(slug: string, meta: ProjectMeta): Promise<string> {
  const paths = getProjectPaths(slug);
  const config = projectToConfig(meta);

  let definition: Definition;
  try {
    definition = DefinitionSchema.parse(
      JSON.parse(await fs.readFile(paths.definitionJson, "utf-8")),
    );
  } catch {
    definition = { Name: meta.name, Questions: [], Coherencies: [], Length: [0, 0] };
    await fs.writeFile(paths.definitionJson, JSON.stringify(definition, null, 2));
  }

  await fs.writeFile(paths.projectJson, JSON.stringify(config, null, 2));

  const manifest = await readManifest(slug);
  let data: InterviewData = [];
  if (manifest.activeId) {
    const ds = manifest.datasets.find((d) => d.id === manifest.activeId);
    if (ds) {
      data = InterviewDataSchema.parse(
        JSON.parse(
          await fs.readFile(path.join(datasetsDir(slug), ds.file), "utf-8"),
        ),
      );
    }
  }
  await fs.writeFile(paths.dataJson, JSON.stringify(data, null, 2));
  return paths.dir;
}

export async function syncProjectFiles(slug: string): Promise<string> {
  const meta = (await readMeta(slug)) ?? (await ensureProjectInitialized(slug));
  return writeProjectSnapshots(slug, meta);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const root = getProjectsRoot();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }

  const projects: ProjectMeta[] = [];
  for (const slug of entries) {
    const stat = await fs.stat(path.join(root, slug));
    if (!stat.isDirectory()) continue;
    try {
      projects.push(await ensureProjectInitialized(slug));
    } catch {
      // skip invalid folders
    }
  }
  return projects.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getProject(slug: string): Promise<ProjectMeta | null> {
  try {
    return await ensureProjectInitialized(slug);
  } catch {
    return null;
  }
}

export async function createProject(input: CreateProjectInput): Promise<ProjectMeta> {
  const root = getProjectsRoot();
  await ensureDir(root);

  const now = new Date().toISOString();
  let slug = input.slug ? slugify(input.slug) : slugify(input.name);
  try {
    await fs.access(path.join(root, slug));
    slug = `${slug}-${randomUUID().slice(0, 6)}`;
  } catch {
    // slug available
  }

  const liveLink = input.liveLink ?? input.nvLoginUrl ?? "";
  const meta: ProjectMeta = {
    slug,
    name: input.name,
    nvLoginUrl: liveLink,
    liveLink,
    testLink: input.testLink ?? "",
    mode: input.mode ?? "Cloning",
    loiTargetMinutes: input.loiTargetMinutes ?? 12,
    loiJitterPercent: input.loiJitterPercent ?? 15,
    maxWorkers: input.maxWorkers ?? 2,
    savFieldMap: input.savFieldMap ?? DEFAULT_SAV_MAP,
    exploreDefaults: input.exploreDefaults ?? {},
    exploreSeedRowIndex: input.exploreSeedRowIndex ?? 0,
    activeDatasetId: null,
    createdAt: now,
    updatedAt: now,
  };

  const paths = getProjectPaths(slug);
  await ensureDir(paths.dir);
  await ensureDir(paths.exploreCache);
  await ensureDir(datasetsDir(slug));

  await writeMeta(slug, meta);
  await fs.writeFile(
    paths.definitionJson,
    JSON.stringify(
      { Name: input.name, Questions: [], Coherencies: [], Length: [0, 0] } satisfies Definition,
      null,
      2,
    ),
  );
  await fs.writeFile(
    manifestPath(slug),
    JSON.stringify({ activeId: null, datasets: [] } satisfies DatasetsManifest, null, 2),
  );
  await fs.writeFile(exploreRunsPath(slug), JSON.stringify([], null, 2));
  await syncProjectFiles(slug);
  return meta;
}

export async function updateProject(
  slug: string,
  input: UpdateProjectInput,
): Promise<ProjectMeta | null> {
  const meta = await getProject(slug);
  if (!meta) return null;

  const liveLink = input.liveLink ?? input.nvLoginUrl ?? meta.liveLink ?? meta.nvLoginUrl;
  const updated: ProjectMeta = {
    ...meta,
    name: input.name ?? meta.name,
    nvLoginUrl: liveLink,
    liveLink,
    testLink: input.testLink ?? meta.testLink,
    mode: input.mode ?? meta.mode,
    loiTargetMinutes: input.loiTargetMinutes ?? meta.loiTargetMinutes,
    loiJitterPercent: input.loiJitterPercent ?? meta.loiJitterPercent,
    maxWorkers: input.maxWorkers ?? meta.maxWorkers,
    savFieldMap: input.savFieldMap ?? meta.savFieldMap,
    exploreDefaults: input.exploreDefaults ?? meta.exploreDefaults ?? {},
    exploreSeedRowIndex:
      input.exploreSeedRowIndex ?? meta.exploreSeedRowIndex ?? 0,
    updatedAt: new Date().toISOString(),
  };

  await writeMeta(slug, updated);
  await syncProjectFiles(slug);
  return updated;
}

export async function getDefinition(slug: string): Promise<Definition> {
  const paths = getProjectPaths(slug);
  await ensureProjectInitialized(slug);
  try {
    return DefinitionSchema.parse(
      JSON.parse(await fs.readFile(paths.definitionJson, "utf-8")),
    );
  } catch {
    return { Name: "", Questions: [], Coherencies: [], Length: [0, 0] };
  }
}

export async function saveDefinition(
  slug: string,
  definition: Definition,
): Promise<void> {
  await ensureProjectInitialized(slug);
  const paths = getProjectPaths(slug);
  await fs.writeFile(paths.definitionJson, JSON.stringify(definition, null, 2));
  const meta = await readMeta(slug);
  if (meta) {
    meta.updatedAt = new Date().toISOString();
    await writeMeta(slug, meta);
  }
}

export async function listDatasets(slug: string): Promise<DatasetMeta[]> {
  const manifest = await readManifest(slug);
  return manifest.datasets;
}

export async function getActiveDataset(slug: string): Promise<DatasetMeta | null> {
  const manifest = await readManifest(slug);
  if (!manifest.activeId) return null;
  return manifest.datasets.find((d) => d.id === manifest.activeId) ?? null;
}

export async function loadActiveData(slug: string): Promise<InterviewData> {
  const active = await getActiveDataset(slug);
  if (!active) return [];
  const raw = await fs.readFile(
    path.join(datasetsDir(slug), active.file),
    "utf-8",
  );
  return InterviewDataSchema.parse(JSON.parse(raw));
}

export async function loadActiveSavVariables(
  slug: string,
): Promise<SavVariablesMeta> {
  const active = await getActiveDataset(slug);
  if (!active) return {};

  if (active.variablesFile) {
    try {
      const raw = await fs.readFile(
        path.join(datasetsDir(slug), active.variablesFile),
        "utf-8",
      );
      return JSON.parse(raw) as SavVariablesMeta;
    } catch {
      // fall through — try .sav on disk
    }
  }

  if (active.savFile) {
    try {
      const { parseSavBundle } = await import("./sav-import.js");
      const savPath = path.join(datasetsDir(slug), active.savFile);
      const bundle = await parseSavBundle(savPath);
      return bundle.variables;
    } catch {
      return {};
    }
  }

  return {};
}

export async function importDataset(
  slug: string,
  name: string,
  rows: InterviewData,
  savPath?: string,
  variables: SavVariablesMeta = {},
): Promise<{ dataset: DatasetMeta; coverage: CoverageReport }> {
  await ensureProjectInitialized(slug);
  const id = randomUUID().slice(0, 8);
  const file = `${id}.json`;
  const dir = datasetsDir(slug);
  await fs.writeFile(path.join(dir, file), JSON.stringify(rows, null, 2));

  let savFile: string | null = null;
  let variablesFile: string | null = null;
  if (savPath) {
    savFile = `${id}.sav`;
    await fs.copyFile(savPath, path.join(dir, savFile));
  }
  if (Object.keys(variables).length > 0) {
    variablesFile = `${id}-variables.json`;
    await fs.writeFile(
      path.join(dir, variablesFile),
      JSON.stringify(variables, null, 2),
    );
  }

  const manifest = await readManifest(slug);
  const isFirst = manifest.datasets.length === 0;
  const dataset: DatasetMeta = {
    id,
    name,
    rowCount: rows.length,
    file,
    savFile,
    variablesFile,
    isActive: isFirst,
    importedAt: new Date().toISOString(),
  };

  if (isFirst) {
    manifest.activeId = id;
    manifest.datasets = [dataset];
  } else {
    manifest.datasets = manifest.datasets.map((d) => ({ ...d, isActive: false }));
    manifest.datasets.unshift({ ...dataset, isActive: true });
    manifest.activeId = id;
  }

  await writeManifest(slug, manifest);
  const meta = await readMeta(slug);
  if (meta) {
    meta.activeDatasetId = manifest.activeId;
    meta.updatedAt = new Date().toISOString();
    await writeMeta(slug, meta);
  }

  const definition = await getDefinition(slug);
  const gapResult = fillDefinitionGapsFromData(definition, rows, variables);
  if (gapResult.added.length > 0 || gapResult.updated.length > 0) {
    await saveDefinition(slug, gapResult.definition);
  }

  const projectMeta = await getProject(slug);
  const coverage = buildCoverageReport(
    rows,
    gapResult.definition,
    projectMeta!.savFieldMap,
  );

  await syncProjectFiles(slug);
  return { dataset, coverage };
}

export async function setActiveDataset(
  slug: string,
  datasetId: string,
): Promise<boolean> {
  const manifest = await readManifest(slug);
  const ds = manifest.datasets.find((d) => d.id === datasetId);
  if (!ds) return false;

  manifest.activeId = datasetId;
  manifest.datasets = manifest.datasets.map((d) => ({
    ...d,
    isActive: d.id === datasetId,
  }));
  await writeManifest(slug, manifest);

  const meta = await readMeta(slug);
  if (meta) {
    meta.activeDatasetId = datasetId;
    meta.updatedAt = new Date().toISOString();
    await writeMeta(slug, meta);
  }

  await syncProjectFiles(slug);
  return true;
}

export async function listExploreRuns(slug: string, limit = 10): Promise<ExploreRun[]> {
  await ensureProjectInitialized(slug);
  try {
    const runs = JSON.parse(
      await fs.readFile(exploreRunsPath(slug), "utf-8"),
    ) as ExploreRun[];
    return runs.slice(0, limit);
  } catch {
    return [];
  }
}

export async function recordExploreRun(
  slug: string,
  result: {
    status: string;
    added: string[];
    updated: string[];
    conflicts: unknown[];
    discovered: number;
    blockers?: ExploreBlocker[];
    steps?: number;
    discoveredNames?: string[];
  },
): Promise<ExploreRun> {
  await ensureProjectInitialized(slug);
  const run: ExploreRun = {
    id: randomUUID(),
    ...result,
    createdAt: new Date().toISOString(),
  };

  let runs: ExploreRun[] = [];
  try {
    runs = JSON.parse(await fs.readFile(exploreRunsPath(slug), "utf-8"));
  } catch {
    runs = [];
  }
  runs.unshift(run);
  await fs.writeFile(exploreRunsPath(slug), JSON.stringify(runs.slice(0, 50), null, 2));
  return run;
}

export async function getProjectBundle(slug: string) {
  const project = await getProject(slug);
  if (!project) return null;

  const definition = await getDefinition(slug);
  const datasets = await listDatasets(slug);
  const activeDataset = await getActiveDataset(slug);
  const data = await loadActiveData(slug);
  const coverage = buildCoverageReport(data, definition, project.savFieldMap);
  const exploreRuns = await listExploreRuns(slug);

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
