import fs from "node:fs/promises";
import {
  getProjectPaths,
  type Definition,
  type InterviewData,
  type ProjectConfig,
} from "@nv/core";
import {
  getActiveDataset,
  getProjectBySlug,
  loadDatasetRows,
  projectToConfig,
  getDefinition,
} from "./repository.js";
import { ensureDir } from "./db.js";

/** Write DB state to projects/{slug}/ for Playwright workers and CLI. */
export async function syncProjectToCache(slug: string): Promise<string> {
  const project = getProjectBySlug(slug);
  if (!project) throw new Error(`Project not found: ${slug}`);

  const paths = getProjectPaths(slug);
  ensureDir(paths.dir);
  ensureDir(paths.exploreCache);

  const config: ProjectConfig = projectToConfig(project);
  const definition: Definition = getDefinition(project.id);

  await fs.writeFile(paths.projectJson, JSON.stringify(config, null, 2));
  await fs.writeFile(
    paths.definitionJson,
    JSON.stringify(definition, null, 2),
  );

  const active = getActiveDataset(project.id);
  let data: InterviewData = [];
  if (active) {
    data = await loadDatasetRows(active);
  }
  await fs.writeFile(paths.dataJson, JSON.stringify(data, null, 2));

  return paths.dir;
}
