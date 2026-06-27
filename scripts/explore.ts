import fs from "node:fs/promises";
import {
  buildCoverageReport,
  DefinitionSchema,
  ensurePlaywrightChromiumInstalled,
  getProjectPaths,
  InterviewDataSchema,
  ProjectConfigSchema,
} from "@nv/core";
import { NvExploreRunner } from "@nv/playwright";

async function main() {
  await ensurePlaywrightChromiumInstalled();
  const projectId = process.argv[2] ?? "ACTIVE";
  const paths = getProjectPaths(projectId);

  const project = ProjectConfigSchema.parse(
    JSON.parse(await fs.readFile(paths.projectJson, "utf-8")),
  );
  const definition = DefinitionSchema.parse(
    JSON.parse(await fs.readFile(paths.definitionJson, "utf-8")),
  );
  const data = InterviewDataSchema.parse(
    JSON.parse(await fs.readFile(paths.dataJson, "utf-8")),
  );
  const coverage = buildCoverageReport(data, definition, project.savFieldMap);

  const seedIndex = project.exploreSeedRowIndex ?? 0;
  const rowCount = project.exploreRowCount ?? 1;
  const datasetRows: Array<{ index: number; row: (typeof data)[0] }> = [];
  for (let i = 0; i < rowCount && seedIndex + i < data.length; i++) {
    datasetRows.push({ index: seedIndex + i, row: data[seedIndex + i]! });
  }
  if (datasetRows.length === 0) {
    throw new Error(
      `Explore seed row ${seedIndex} is out of range (${data.length} row(s) in dataset)`,
    );
  }

  const runner = new NvExploreRunner();
  const result = await runner.run({
    config: project,
    definition,
    outputDir: paths.exploreCache,
    datasetRows,
    headless: process.argv.includes("--headed") ? false : true,
    log: console.log,
    coverageGaps: coverage.questionsInDataNotInDefinition,
    questionsInDefinitionNotInData:
      coverage.questionsInDefinitionNotInData,
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
    configurationGaps: result.configurationGaps,
    status: result.status,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
