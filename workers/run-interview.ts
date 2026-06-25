import fs from "node:fs/promises";
import {
  DataRowSchema,
  DefinitionSchema,
  ensurePlaywrightBrowsersEnv,
  getProjectPaths,
  InterviewDataSchema,
  ProjectConfigSchema,
} from "@nv/core";
import { NvInterviewRunner } from "@nv/playwright";

async function main() {
  ensurePlaywrightBrowsersEnv();
  const projectId = process.argv[2] ?? "ACTIVE";
  const rowIndex = parseInt(process.argv[3] ?? "0", 10);
  const workerId = process.argv[4] ?? "worker-1";
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

  const row = DataRowSchema.parse(data[rowIndex]);
  const headless = !process.argv.includes("--headed");

  const runner = new NvInterviewRunner();
  const result = await runner.run({
    config: project,
    definition,
    dataRow: row,
    outputDir: paths.exploreCache,
    headless,
    workerId,
    log: console.log,
  });

  console.log("Interview result:", result);
  process.exit(result.success ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
