import fs from "node:fs/promises";
import {
  DefinitionSchema,
  getProjectPaths,
  ProjectConfigSchema,
} from "@nv/core";
import { NvExploreRunner } from "@nv/playwright";

async function main() {
  const projectId = process.argv[2] ?? "ACTIVE";
  const paths = getProjectPaths(projectId);

  const project = ProjectConfigSchema.parse(
    JSON.parse(await fs.readFile(paths.projectJson, "utf-8")),
  );
  const definition = DefinitionSchema.parse(
    JSON.parse(await fs.readFile(paths.definitionJson, "utf-8")),
  );

  const runner = new NvExploreRunner();
  const result = await runner.run({
    config: project,
    definition,
    outputDir: paths.exploreCache,
    headless: process.argv.includes("--headed") ? false : true,
    log: console.log,
  });

  await fs.writeFile(
    paths.definitionJson,
    JSON.stringify(result.definition, null, 2),
  );

  console.log("Explore complete:", {
    discovered: result.discovered,
    added: result.added,
    updated: result.updated,
    conflicts: result.conflicts,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
