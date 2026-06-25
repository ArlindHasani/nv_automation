import fs from "node:fs/promises";
import path from "node:path";
import {
  DefinitionSchema,
  getProjectPaths,
  getRepoRoot,
  InterviewDataSchema,
  ProjectConfigSchema,
} from "@nv/core";
import { getDb } from "./db.js";
import {
  createProject,
  getProjectBySlug,
  importDataset,
  saveDefinition,
} from "./repository.js";

async function seedFromFilesystem(): Promise<void> {
  const projectsDir = path.join(getRepoRoot(), "projects");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(projectsDir);
  } catch {
    return;
  }

  for (const slug of entries) {
    if (getProjectBySlug(slug)) continue;

    const paths = getProjectPaths(slug);
    try {
      const config = ProjectConfigSchema.parse(
        JSON.parse(await fs.readFile(paths.projectJson, "utf-8")),
      );
      const definition = DefinitionSchema.parse(
        JSON.parse(await fs.readFile(paths.definitionJson, "utf-8")),
      );
      const data = InterviewDataSchema.parse(
        JSON.parse(await fs.readFile(paths.dataJson, "utf-8")),
      );

      const project = createProject({
        name: config.name,
        slug,
        nvLoginUrl: config.nvLoginUrl,
        liveLink: config.liveLink ?? "",
        testLink: config.testLink,
        mode: config.mode,
        loiTargetMinutes: config.loi.targetMinutes,
        loiJitterPercent: config.loi.jitterPercent,
        maxWorkers: config.workers.maxConcurrent,
        savFieldMap: config.savFieldMap,
      });

      saveDefinition(project.id, definition);
      await importDataset(project.id, "default", data);
      console.log(`Seeded project: ${slug}`);
    } catch (e) {
      console.warn(`Skip seed ${slug}:`, e);
    }
  }
}

async function main() {
  getDb();
  await seedFromFilesystem();
  console.log("Database ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
