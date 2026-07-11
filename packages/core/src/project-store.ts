import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildCoverageReport,
  collectDatasetColumns,
  type CoverageReport,
  type SavVariablesMeta,
} from "./mapping.js";
import { fillDefinitionGapsFromData } from "./fill-gaps.js";
import { migrateExploreDefaultsToDefinition, migrateFixedAnswerFields, reconcileFixedAnswerSplits } from "./answer-policy.js";
import { mergeSplitWeights, normalizeSplitForFixedAnswer, isSplitTotalValid, splitWeightSum, resolveMentionBounds } from "./split.js";
import { buildProjectWorkflow } from "./workflow.js";
import {
  type Definition,
  DefinitionSchema,
  DEFAULT_SAV_FIELD_MAP,
  type InterviewData,
  InterviewDataSchema,
  type ProjectConfig,
  ProjectConfigSchema,
  type SavFieldMap,
  type WorkerProfile,
  normalizeNvProjectId,
} from "./schemas.js";
import { getProjectPaths, getProjectsRoot } from "./paths.js";
import {
  initInterviewQueue,
  getInterviewQueueSummary,
  formatQuestId,
} from "./interview-queue.js";

function normalizeSavFieldMap(map: SavFieldMap | undefined): SavFieldMap {
  if (!map) return { ...DEFAULT_SAV_FIELD_MAP };
  return {
    station: map.station || DEFAULT_SAV_FIELD_MAP.station,
    password: map.password || DEFAULT_SAV_FIELD_MAP.password,
    id: map.id || DEFAULT_SAV_FIELD_MAP.id,
    project: map.project || DEFAULT_SAV_FIELD_MAP.project,
  };
}

type MetaFile = ProjectMeta & {
  nvLoginUrl?: string;
  exploreDefaults?: Record<string, string>;
  savFieldMap?: SavFieldMap & { group?: string };
};

export interface ProjectMeta {
  slug: string;
  name: string;
  liveLink: string;
  testLink: string;
  mode: string;
  nvProjectId: string;
  nvGroup: string;
  questField: string;
  loiTargetMinutes: number;
  loiJitterPercent: number;
  savFieldMap: SavFieldMap;
  exploreSeedRowIndex: number;
  exploreRowCount: number;
  exploreEndQuestions: string[];
  workerProfiles: WorkerProfile[];
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
  mergeIssues?: Array<{ severity: string; question: string; message: string }>;
  configurationGaps?: Array<{ question: string; type: string; reason: string }>;
  steps?: number;
  rowsWalked?: number;
  discoveredNames?: string[];
  trailCsv?: string;
  trailJson?: string;
  createdAt: string;
}

export interface LiveRun {
  id: string;
  status: "completed" | "partial" | "failed" | "stopped";
  workerProfileId: string;
  workerProfileLabel: string;
  interviewsCompleted: number;
  interviewsFailed: number;
  steps?: number;
  lastRowIndex?: number | null;
  lastQuest?: string;
  lastQuestion?: string;
  error?: string;
  trailCsv?: string;
  trailJson?: string;
  trailWideCsv?: string;
  logFile?: string;
  startedAt: string;
  finishedAt: string;
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
  savFieldMap?: SavFieldMap;
  exploreSeedRowIndex?: number;
  exploreRowCount?: number;
  exploreEndQuestions?: string[];
  nvProjectId?: string;
  nvGroup?: string;
  questField?: string;
  workerProfiles?: WorkerProfile[];
}

export interface UpdateProjectInput {
  name?: string;
  nvLoginUrl?: string;
  liveLink?: string;
  testLink?: string;
  mode?: string;
  loiTargetMinutes?: number;
  loiJitterPercent?: number;
  savFieldMap?: SavFieldMap;
  exploreSeedRowIndex?: number;
  exploreRowCount?: number;
  exploreEndQuestions?: string[];
  nvProjectId?: string;
  nvGroup?: string;
  questField?: string;
  workerProfiles?: WorkerProfile[];
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

function liveRunsPath(slug: string): string {
  return path.join(getProjectPaths(slug).dir, "live-runs.json");
}

function metaPath(slug: string): string {
  return path.join(getProjectPaths(slug).dir, "meta.json");
}

const DEFAULT_EXPLORE_END_QUESTIONS = ["ANMER"];

function normalizeExploreEndQuestions(value: string[] | undefined): string[] {
  if (!value || value.length === 0) return [...DEFAULT_EXPLORE_END_QUESTIONS];
  return value.map((q) => q.trim()).filter(Boolean);
}

function workerConcurrencyFromProfiles(profiles: WorkerProfile[] | undefined): number {
  return Math.max(1, profiles?.length ?? 0);
}

function projectToConfig(meta: ProjectMeta): ProjectConfig {
  const liveLink = meta.liveLink;
  return ProjectConfigSchema.parse({
    name: meta.name,
    liveLink,
    testLink: meta.testLink,
    mode: "Freestyle",
    nvProjectId: meta.nvProjectId,
    nvGroup: meta.nvGroup,
    questField: meta.questField,
    loi: {
      targetMinutes: meta.loiTargetMinutes,
      jitterPercent: meta.loiJitterPercent,
    },
    workers: {
      maxConcurrent: workerConcurrencyFromProfiles(meta.workerProfiles),
    },
    savFieldMap: meta.savFieldMap,
    exploreSeedRowIndex: meta.exploreSeedRowIndex ?? 0,
    exploreRowCount: meta.exploreRowCount ?? 1,
    exploreEndQuestions: normalizeExploreEndQuestions(meta.exploreEndQuestions),
    workerProfiles: meta.workerProfiles ?? [],
  });
}

async function migrateLegacyExploreDefaults(
  slug: string,
  exploreDefaults: Record<string, string> | undefined,
): Promise<void> {
  if (!exploreDefaults || Object.keys(exploreDefaults).length === 0) return;
  const paths = getProjectPaths(slug);
  let definition: Definition;
  try {
    definition = DefinitionSchema.parse(
      JSON.parse(await fs.readFile(paths.definitionJson, "utf-8")),
    );
  } catch {
    return;
  }
  if (!migrateExploreDefaultsToDefinition(definition, exploreDefaults)) return;
  await fs.writeFile(paths.definitionJson, JSON.stringify(definition, null, 2));
}

function normalizeMetaFromFile(raw: MetaFile): ProjectMeta {
  const liveLink = raw.liveLink || raw.nvLoginUrl || "";
  return {
    slug: raw.slug,
    name: raw.name,
    liveLink,
    testLink: raw.testLink ?? "",
    mode: raw.mode ?? "Freestyle",
    nvProjectId: normalizeNvProjectId(raw.nvProjectId ?? ""),
    nvGroup: raw.nvGroup ?? "1",
    questField: raw.questField ?? "quest",
    loiTargetMinutes: raw.loiTargetMinutes ?? 12,
    loiJitterPercent: raw.loiJitterPercent ?? 15,
    savFieldMap: normalizeSavFieldMap(raw.savFieldMap),
    exploreSeedRowIndex: raw.exploreSeedRowIndex ?? 0,
    exploreRowCount: raw.exploreRowCount ?? 1,
    exploreEndQuestions: normalizeExploreEndQuestions(raw.exploreEndQuestions),
    workerProfiles: raw.workerProfiles ?? [],
    activeDatasetId: raw.activeDatasetId ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

async function loadExploreSettingsFromProjectJson(slug: string): Promise<{
  exploreRowCount?: number;
  exploreEndQuestions?: string[];
  nvProjectId?: string;
  nvGroup?: string;
  questField?: string;
  workerProfiles?: WorkerProfile[];
}> {
  try {
    const config = ProjectConfigSchema.parse(
      JSON.parse(
        await fs.readFile(getProjectPaths(slug).projectJson, "utf-8"),
      ),
    );
    return {
      exploreRowCount: config.exploreRowCount,
      exploreEndQuestions: config.exploreEndQuestions,
    };
  } catch {
    return {};
  }
}

async function readMeta(slug: string): Promise<ProjectMeta | null> {
  try {
    const raw = JSON.parse(await fs.readFile(metaPath(slug), "utf-8")) as MetaFile;
    await migrateLegacyExploreDefaults(slug, raw.exploreDefaults);

    const missingExploreSettings =
      raw.exploreRowCount === undefined || raw.exploreEndQuestions === undefined;
    if (missingExploreSettings) {
      const fromProject = await loadExploreSettingsFromProjectJson(slug);
      if (raw.exploreRowCount === undefined && fromProject.exploreRowCount !== undefined) {
        raw.exploreRowCount = fromProject.exploreRowCount;
      }
      if (
        raw.exploreEndQuestions === undefined &&
        fromProject.exploreEndQuestions !== undefined
      ) {
        raw.exploreEndQuestions = fromProject.exploreEndQuestions;
      }
    }

    const meta = normalizeMetaFromFile(raw);
    const legacyFields =
      raw.exploreDefaults !== undefined ||
      raw.nvLoginUrl !== undefined ||
      raw.savFieldMap?.group !== undefined ||
      missingExploreSettings;
    if (legacyFields) {
      await writeMeta(slug, meta);
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
    let rawProject: { exploreDefaults?: Record<string, string> };
    try {
      rawProject = JSON.parse(
        await fs.readFile(paths.projectJson, "utf-8"),
      ) as { exploreDefaults?: Record<string, string> };
      config = ProjectConfigSchema.parse(rawProject);
    } catch {
      throw new Error(`Project not found: ${slug}`);
    }

    const liveLink = config.liveLink || config.nvLoginUrl || "";
    await migrateLegacyExploreDefaults(slug, rawProject.exploreDefaults);
    meta = {
      slug,
      name: config.name,
      liveLink,
      testLink: config.testLink ?? "",
      mode: config.mode,
      nvProjectId: normalizeNvProjectId(config.nvProjectId ?? ""),
      nvGroup: config.nvGroup ?? "1",
      questField: config.questField ?? "quest",
      loiTargetMinutes: config.loi.targetMinutes,
      loiJitterPercent: config.loi.jitterPercent,
      savFieldMap: normalizeSavFieldMap(config.savFieldMap),
      exploreSeedRowIndex: config.exploreSeedRowIndex ?? 0,
      exploreRowCount: config.exploreRowCount ?? 1,
      exploreEndQuestions: normalizeExploreEndQuestions(config.exploreEndQuestions),
      workerProfiles: config.workerProfiles ?? [],
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
  try {
    const projectRaw = JSON.parse(
      await fs.readFile(paths.projectJson, "utf-8"),
    ) as { exploreDefaults?: Record<string, string> };
    await migrateLegacyExploreDefaults(slug, projectRaw.exploreDefaults);
  } catch {
    // project.json may not exist yet
  }
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
    liveLink,
    testLink: input.testLink ?? "",
    mode: input.mode ?? "Freestyle",
    nvProjectId: normalizeNvProjectId(input.nvProjectId ?? ""),
    nvGroup: input.nvGroup ?? "1",
    questField: input.questField ?? "quest",
    loiTargetMinutes: input.loiTargetMinutes ?? 12,
    loiJitterPercent: input.loiJitterPercent ?? 15,
    savFieldMap: normalizeSavFieldMap(input.savFieldMap ?? DEFAULT_SAV_FIELD_MAP),
    exploreSeedRowIndex: input.exploreSeedRowIndex ?? 0,
    exploreRowCount: input.exploreRowCount ?? 1,
    exploreEndQuestions: normalizeExploreEndQuestions(input.exploreEndQuestions),
    workerProfiles: input.workerProfiles ?? [],
    activeDatasetId: null,
    createdAt: now,
    updatedAt: now,
  };

  const paths = getProjectPaths(slug);
  await ensureDir(paths.dir);
  await ensureDir(paths.exploreCache);
  await ensureDir(paths.runCache);
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
  await fs.writeFile(liveRunsPath(slug), JSON.stringify([], null, 2));
  await syncProjectFiles(slug);
  return meta;
}

export async function updateProject(
  slug: string,
  input: UpdateProjectInput,
): Promise<ProjectMeta | null> {
  const meta = await getProject(slug);
  if (!meta) return null;

  const liveLink = input.liveLink ?? input.nvLoginUrl ?? meta.liveLink;
  const updated: ProjectMeta = {
    ...meta,
    name: input.name ?? meta.name,
    liveLink,
    testLink: input.testLink ?? meta.testLink,
    mode: "Freestyle",
    nvProjectId:
      input.nvProjectId !== undefined
        ? normalizeNvProjectId(input.nvProjectId)
        : meta.nvProjectId,
    nvGroup: input.nvGroup ?? meta.nvGroup,
    questField: input.questField ?? meta.questField,
    loiTargetMinutes: input.loiTargetMinutes ?? meta.loiTargetMinutes,
    loiJitterPercent: input.loiJitterPercent ?? meta.loiJitterPercent,
    savFieldMap: normalizeSavFieldMap(input.savFieldMap ?? meta.savFieldMap),
    exploreSeedRowIndex:
      input.exploreSeedRowIndex ?? meta.exploreSeedRowIndex ?? 0,
    exploreRowCount: input.exploreRowCount ?? meta.exploreRowCount ?? 1,
    exploreEndQuestions: normalizeExploreEndQuestions(
      input.exploreEndQuestions ?? meta.exploreEndQuestions,
    ),
    workerProfiles: input.workerProfiles ?? meta.workerProfiles,
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
    const definition = DefinitionSchema.parse(
      JSON.parse(await fs.readFile(paths.definitionJson, "utf-8")),
    );
    let changed = false;
    if (migrateFixedAnswerFields(definition)) {
      changed = true;
    }
    if (reconcileFixedAnswerSplits(definition)) {
      changed = true;
    }
    if (changed) {
      await fs.writeFile(
        paths.definitionJson,
        JSON.stringify(definition, null, 2),
      );
    }
    return definition;
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

export interface DefinitionQuestionPatch {
  Name: string;
  FixedAnswer?: string | null;
  /** @deprecated Use FixedAnswer */
  ExploreOverride?: string | null;
  Method?: "Maintain" | "Split";
  Split?: Record<string, number>;
  Min?: number;
  Max?: number;
  AVG?: number | null;
}

export async function patchDefinitionQuestions(
  slug: string,
  updates: DefinitionQuestionPatch[],
): Promise<Definition> {
  const definition = await getDefinition(slug);
  const byName = new Map(
    definition.Questions.map((q) => [q.Name.toUpperCase(), q]),
  );

  for (const update of updates) {
    const q = byName.get(update.Name.toUpperCase());
    if (!q) continue;
    if (update.FixedAnswer !== undefined) {
      if (update.FixedAnswer === "" || update.FixedAnswer === null) {
        delete q.FixedAnswer;
        delete q.ExploreOverride;
      } else {
        q.FixedAnswer = update.FixedAnswer;
        delete q.ExploreOverride;
        q.Source = "manual";
        q.Split = normalizeSplitForFixedAnswer(q.Split, update.FixedAnswer);
      }
    } else if (update.ExploreOverride !== undefined) {
      if (update.ExploreOverride === "" || update.ExploreOverride === null) {
        delete q.FixedAnswer;
        delete q.ExploreOverride;
      } else {
        q.FixedAnswer = update.ExploreOverride;
        delete q.ExploreOverride;
        q.Source = "manual";
        q.Split = normalizeSplitForFixedAnswer(q.Split, update.ExploreOverride);
      }
    }
    if (update.Method !== undefined) {
      q.Method = update.Method;
      q.Source = "manual";
    }
    if (update.Split !== undefined) {
      const merged = mergeSplitWeights(q.Split, update.Split);
      const total = splitWeightSum(merged);
      if (!isSplitTotalValid(total, q.Type)) {
        throw new Error(
          q.Type === "Multi"
            ? `Split weights for '${q.Name}' need at least one positive mention %`
            : `Split weights for '${q.Name}' must sum to 100% (got ${Math.round(total * 10) / 10}%)`,
        );
      }
      q.Split = merged;
      q.Source = "manual";
    }
    if (
      update.Min !== undefined ||
      update.Max !== undefined ||
      update.AVG !== undefined
    ) {
      if (update.Min !== undefined) q.Min = update.Min;
      if (update.Max !== undefined) q.Max = update.Max;
      if (update.AVG !== undefined) {
        q.AVG = update.AVG === null ? null : update.AVG;
      }
      q.Source = "manual";

      const min = q.Min ?? 0;
      const max = q.Max ?? 0;
      const avg = q.AVG ?? 0;
      const allSet = min > 0 && max > 0 && avg > 0;
      if (allSet && !resolveMentionBounds(q)) {
        throw new Error(
          `Mention bounds for '${q.Name}' must satisfy Min ≤ AVG ≤ Max`,
        );
      }
    }
  }

  await saveDefinition(slug, definition);
  await syncProjectFiles(slug);
  return definition;
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
  return loadDatasetData(slug, active.id);
}

export async function loadDatasetData(
  slug: string,
  datasetId: string,
): Promise<InterviewData> {
  const manifest = await readManifest(slug);
  const dataset = manifest.datasets.find((d) => d.id === datasetId);
  if (!dataset) throw new Error("Dataset not found");
  const raw = await fs.readFile(
    path.join(datasetsDir(slug), dataset.file),
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
    variables,
  );

  await syncProjectFiles(slug);
  await initInterviewQueue(slug, rows.length, true);
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
  await initInterviewQueue(slug, ds.rowCount, false);
  return true;
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // already removed or missing
  }
}

export async function deleteDataset(
  slug: string,
  datasetId: string,
): Promise<boolean> {
  await ensureProjectInitialized(slug);
  const manifest = await readManifest(slug);
  const dataset = manifest.datasets.find((d) => d.id === datasetId);
  if (!dataset) return false;

  const dir = datasetsDir(slug);
  await unlinkIfExists(path.join(dir, dataset.file));
  if (dataset.savFile) {
    await unlinkIfExists(path.join(dir, dataset.savFile));
  }
  if (dataset.variablesFile) {
    await unlinkIfExists(path.join(dir, dataset.variablesFile));
  }

  const wasActive = manifest.activeId === datasetId;
  manifest.datasets = manifest.datasets.filter((d) => d.id !== datasetId);

  if (wasActive) {
    const next = manifest.datasets[0] ?? null;
    manifest.activeId = next?.id ?? null;
    manifest.datasets = manifest.datasets.map((d) => ({
      ...d,
      isActive: next ? d.id === next.id : false,
    }));
  }

  await writeManifest(slug, manifest);

  const meta = await readMeta(slug);
  if (meta) {
    meta.activeDatasetId = manifest.activeId;
    meta.updatedAt = new Date().toISOString();
    await writeMeta(slug, meta);
  }

  await syncProjectFiles(slug);
  return true;
}

export async function deleteProject(slug: string): Promise<boolean> {
  const dir = getProjectPaths(slug).dir;
  try {
    await fs.access(dir);
  } catch {
    return false;
  }
  await fs.rm(dir, { recursive: true, force: true });
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
    id?: string;
    status: string;
    added: string[];
    updated: string[];
    conflicts: unknown[];
    discovered: number;
    blockers?: ExploreBlocker[];
    mergeIssues?: ExploreRun["mergeIssues"];
    configurationGaps?: ExploreRun["configurationGaps"];
    steps?: number;
    rowsWalked?: number;
    discoveredNames?: string[];
    trailCsv?: string;
    trailJson?: string;
  },
): Promise<ExploreRun> {
  await ensureProjectInitialized(slug);
  const run: ExploreRun = {
    id: result.id ?? randomUUID(),
    status: result.status,
    added: result.added,
    updated: result.updated,
    conflicts: result.conflicts,
    discovered: result.discovered,
    blockers: result.blockers,
    mergeIssues: result.mergeIssues,
    configurationGaps: result.configurationGaps,
    steps: result.steps,
    rowsWalked: result.rowsWalked,
    discoveredNames: result.discoveredNames,
    trailCsv: result.trailCsv,
    trailJson: result.trailJson,
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

export async function listLiveRuns(slug: string, limit = 20): Promise<LiveRun[]> {
  await ensureProjectInitialized(slug);
  try {
    const runs = JSON.parse(
      await fs.readFile(liveRunsPath(slug), "utf-8"),
    ) as LiveRun[];
    return runs.slice(0, limit);
  } catch {
    return [];
  }
}

export async function recordLiveRun(
  slug: string,
  result: Omit<LiveRun, "createdAt">,
): Promise<LiveRun> {
  await ensureProjectInitialized(slug);
  const run: LiveRun = {
    ...result,
    createdAt: result.finishedAt || new Date().toISOString(),
  };

  let runs: LiveRun[] = [];
  try {
    runs = JSON.parse(await fs.readFile(liveRunsPath(slug), "utf-8"));
  } catch {
    runs = [];
  }
  runs.unshift(run);
  await fs.writeFile(liveRunsPath(slug), JSON.stringify(runs.slice(0, 50), null, 2));
  return run;
}

export async function getProjectBundle(slug: string) {
  const project = await getProject(slug);
  if (!project) return null;

  const definition = await getDefinition(slug);
  const config = projectToConfig(project);
  const datasets = await listDatasets(slug);
  const activeDataset = await getActiveDataset(slug);
  const data = await loadActiveData(slug);
  const variables = await loadActiveSavVariables(slug);
  await initInterviewQueue(slug, data.length, false);
  const coverage = buildCoverageReport(
    data,
    definition,
    project.savFieldMap,
    variables,
  );
  const exploreRuns = await listExploreRuns(slug);
  const liveRuns = await listLiveRuns(slug);
  const dataColumns = collectDatasetColumns(data, variables);
  const workflow = buildProjectWorkflow({
    config,
    definition,
    activeDataset,
    dataRowCount: data.length,
    dataColumns,
    coverage,
    exploreRuns,
  });

  let queueSummary = await getInterviewQueueSummary(slug);
  if (queueSummary && data.length > 0) {
    const questField = config.questField || "quest";
    queueSummary = {
      ...queueSummary,
      rows: queueSummary.rows.map((row) => ({
        ...row,
        quest:
          row.quest ??
          (data[row.index]
            ? formatQuestId(data[row.index][questField])
            : undefined),
      })),
    };
  }

  return {
    project: {
      ...project,
      nvLoginUrl: project.liveLink,
    },
    config,
    definition,
    datasets,
    activeDataset,
    data,
    dataColumns,
    coverage,
    exploreRuns,
    liveRuns,
    workflow,
    queueSummary,
  };
}
