import fs from "node:fs";
import fsPromises from "node:fs/promises";
import {
  buildCoverageReport,
  DefinitionSchema,
  ensurePlaywrightChromiumInstalled,
  getProjectPaths,
  InterviewDataSchema,
  ProjectConfigSchema,
} from "@nv/core";
import { NvLiveWorkerRunner } from "@nv/playwright";

async function main() {
  await ensurePlaywrightChromiumInstalled();
  const projectId = process.argv[2];
  const profileId = process.argv[3];
  const headed = process.argv.includes("--headed");
  const skipLoi = process.argv.includes("--skip-loi");

  if (!projectId || !profileId) {
    console.error(
      "Usage: tsx workers/run-live-worker.ts <projectId> <workerProfileId> [--headed] [--skip-loi]",
    );
    process.exit(1);
  }

  const paths = getProjectPaths(projectId);
  const config = ProjectConfigSchema.parse(
    JSON.parse(await fsPromises.readFile(paths.projectJson, "utf-8")),
  );
  const definition = DefinitionSchema.parse(
    JSON.parse(await fsPromises.readFile(paths.definitionJson, "utf-8")),
  );
  const data = InterviewDataSchema.parse(
    JSON.parse(await fsPromises.readFile(paths.dataJson, "utf-8")),
  );

  const profile = config.workerProfiles.find((p) => p.id === profileId);
  if (!profile) {
    throw new Error(`Worker profile not found: ${profileId}`);
  }

  const coverage = buildCoverageReport(data, definition, config.savFieldMap);
  // Prefer UI worker id so run-cache / live-runs.json / console share one id.
  const sessionId =
    process.env.NV_WORKER_ID?.trim() ||
    `live-${profileId}-${Date.now()}`;
  const outputDir = `${paths.runCache}/${sessionId}`;
  await fsPromises.mkdir(outputDir, { recursive: true });

  const stopFile =
    process.env.NV_WORKER_STOP_FILE?.trim() ||
    `${outputDir}/${sessionId}.stop`;

  const ac = new AbortController();
  const requestStop = (reason: string) => {
    if (ac.signal.aborted) return;
    console.log(`[warn] Stop requested (${reason})`);
    ac.abort();
  };

  process.on("SIGINT", () => requestStop("SIGINT"));
  process.on("SIGTERM", () => requestStop("SIGTERM"));

  const stopPoll = setInterval(() => {
    try {
      if (fs.existsSync(stopFile)) {
        requestStop("stop file");
      }
    } catch {
      // ignore
    }
  }, 400);

  if (skipLoi) {
    console.log("[info] LOI delays disabled (--skip-loi)");
  }

  try {
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
      questionsInDefinitionNotInData: coverage.questionsInDefinitionNotInData,
      respectLoi: !skipLoi,
      signal: ac.signal,
      log: (msg, level) => console.log(level ? `[${level}] ${msg}` : msg),
    });

    console.log(
      `Live worker finished: ${result.status} completed=${result.interviewsCompleted} failed=${result.interviewsFailed}`,
    );
    process.exit(result.status === "failed" ? 1 : 0);
  } finally {
    clearInterval(stopPoll);
    await fsPromises.unlink(stopFile).catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
