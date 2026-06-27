import { randomUUID } from "node:crypto";
import {
  DefinitionSchema,
  ensurePlaywrightChromiumInstalled,
  getProjectPaths,
  InterviewDataSchema,
  ProjectConfigSchema,
} from "@nv/core";
import { NvLiveWorkerRunner } from "@nv/playwright";
import fs from "node:fs/promises";

async function main() {
  await ensurePlaywrightChromiumInstalled();
  const projectId = process.argv[2];
  const profileId = process.argv[3];
  const headed = process.argv.includes("--headed");

  if (!projectId || !profileId) {
    console.error(
      "Usage: tsx workers/run-live-worker.ts <projectId> <workerProfileId> [--headed]",
    );
    process.exit(1);
  }

  const paths = getProjectPaths(projectId);
  const config = ProjectConfigSchema.parse(
    JSON.parse(await fs.readFile(paths.projectJson, "utf-8")),
  );
  const definition = DefinitionSchema.parse(
    JSON.parse(await fs.readFile(paths.definitionJson, "utf-8")),
  );
  const data = InterviewDataSchema.parse(
    JSON.parse(await fs.readFile(paths.dataJson, "utf-8")),
  );

  const profile = config.workerProfiles.find((p) => p.id === profileId);
  if (!profile) {
    throw new Error(`Worker profile not found: ${profileId}`);
  }

  const sessionId = randomUUID().slice(0, 8);
  const outputDir = `${paths.runCache}/${sessionId}`;
  await fs.mkdir(outputDir, { recursive: true });

  const runner = new NvLiveWorkerRunner();
  const result = await runner.run({
    projectId,
    sessionId,
    profile,
    config,
    definition,
    data,
    outputDir,
    headless: !headed,
    exploreEndQuestions: config.exploreEndQuestions,
    log: (msg, level) => console.log(level ? `[${level}] ${msg}` : msg),
  });

  console.log("Live worker finished:", result);
  process.exit(result.status === "failed" ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
