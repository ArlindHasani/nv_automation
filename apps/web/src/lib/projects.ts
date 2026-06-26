import {
  createProject,
  deleteDataset as deleteProjectDataset,
  deleteProject,
  getDefinition,
  getProjectBundle,
  importDataset,
  listDatasets,
  listProjects,
  recordExploreRun,
  saveDefinition,
  setActiveDataset,
  syncProjectFiles,
  updateProject,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "@nv/core";
import { fillDefinitionGapsFromData } from "@nv/core";

export async function listProjectSummaries() {
  const projects = await listProjects();
  const summaries = await Promise.all(
    projects.map(async (p) => {
      const [datasets, definition] = await Promise.all([
        listDatasets(p.slug),
        getDefinition(p.slug),
      ]);
      const active = datasets.find((d) => d.isActive) ?? datasets[0];
      return {
        id: p.slug,
        name: p.name,
        questionCount: definition.Questions.length,
        dataRowCount: active?.rowCount ?? 0,
        datasetCount: datasets.length,
        updatedAt: p.updatedAt,
      };
    }),
  );
  return summaries;
}

export async function loadProject(slug: string) {
  return getProjectBundle(slug);
}

export async function createNewProject(input: CreateProjectInput) {
  return createProject(input);
}

export async function updateProjectSettings(
  slug: string,
  input: UpdateProjectInput,
) {
  return updateProject(slug, input);
}

export async function saveProjectDefinition(
  slug: string,
  definition: Parameters<typeof saveDefinition>[1],
) {
  await saveDefinition(slug, definition);
  return definition;
}

export async function activateDataset(slug: string, datasetId: string) {
  return setActiveDataset(slug, datasetId);
}

export async function removeDataset(slug: string, datasetId: string) {
  return deleteProjectDataset(slug, datasetId);
}

export async function removeProject(slug: string) {
  return deleteProject(slug);
}

export async function importSavToProject(
  slug: string,
  name: string,
  savPath: string,
) {
  const { parseSavBundle } = await import("@nv/core");
  const bundle = await parseSavBundle(savPath);
  return importDataset(slug, name, bundle.rows, savPath, bundle.variables);
}

export async function fixDefinitionGaps(slug: string) {
  const bundle = await getProjectBundle(slug);
  if (!bundle) throw new Error("Project not found");

  const { loadActiveSavVariables } = await import("@nv/core");
  const variables = await loadActiveSavVariables(slug);
  const result = fillDefinitionGapsFromData(
    bundle.definition,
    bundle.data,
    variables,
  );
  await saveDefinition(slug, result.definition);
  await syncProjectFiles(slug);
  return result;
}

export async function prepareForExecution(slug: string) {
  return syncProjectFiles(slug);
}

export { recordExploreRun, syncProjectFiles };
