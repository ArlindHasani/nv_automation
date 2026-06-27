import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  buildLoiSchedule,
  claimNextRow,
  delay,
  formatQuestId,
  getChromiumLaunchOptions,
  heartbeatRow,
  initInterviewQueue,
  markRowCompleted,
  markRowFailed,
  releaseRow,
  type DataRow,
  type Definition,
  type InterviewData,
  type ProjectConfig,
  type WorkerProfile,
} from "@nv/core";
import { NvInterviewPage } from "./pages/NvInterviewPage.js";
import { NvLoginPage } from "./pages/NvLoginPage.js";
import { NvHomePage } from "./pages/NvHomePage.js";
import { killSession } from "./nv-session.js";
import { resolveExploreAnswer } from "./explore-answers.js";
import { formatStatementAnswersForTrail } from "./explore-trail-export.js";
import { findFirstVisible, type ClassifiedQuestion } from "./question-classifier.js";
import { NV_SELECTORS } from "./selectors.js";
import {
  waitForNvQuestionChange,
  waitForNvQuestionReady,
} from "./wait-for-question.js";
import {
  isInterviewCompletePage,
  isInterviewEndQuestion,
} from "./interview-end.js";

function expectsAutoAdvance(classified: ClassifiedQuestion): boolean {
  if (classified.type === "Grid") return false;
  if (classified.tileSelect) return true;
  if (!classified.autoSubmit) return false;
  if (classified.type === "Single" && classified.codes.length > 6) return false;
  return true;
}

export type LiveWorkerLogFn = (
  message: string,
  level?: "info" | "warn" | "error" | "success",
) => void;

export interface LiveWorkerRunResult {
  sessionId: string;
  interviewsCompleted: number;
  interviewsFailed: number;
  lastRowIndex: number | null;
  status: "completed" | "stopped" | "failed";
  error?: string;
  logFile: string;
}

export interface LiveWorkerRunOptions {
  projectId: string;
  sessionId: string;
  profile: WorkerProfile;
  config: ProjectConfig;
  definition: Definition;
  data: InterviewData;
  outputDir: string;
  headless?: boolean;
  exploreEndQuestions?: string[];
  questionsInDefinitionNotInData?: string[];
  signal?: AbortSignal;
  log?: LiveWorkerLogFn;
}

export class NvLiveWorkerRunner {
  async run(options: LiveWorkerRunOptions): Promise<LiveWorkerRunResult> {
    const {
      projectId,
      sessionId,
      profile,
      config,
      definition,
      data,
      outputDir,
      headless = true,
      exploreEndQuestions = ["ANMER"],
      questionsInDefinitionNotInData = [],
      signal,
    } = options;

    const log = options.log ?? (() => {});
    const questField = config.questField || "quest";
    const liveLink = config.liveLink || config.nvLoginUrl;
    if (!liveLink) throw new Error("Set a live link in project settings");

    await fs.mkdir(outputDir, { recursive: true });
    const logFile = path.join(outputDir, `${sessionId}-worker.log`);
    const logLines: string[] = [];
    const writeLog = (msg: string, level?: "info" | "warn" | "error" | "success") => {
      const line = `[${new Date().toISOString()}] ${msg}`;
      logLines.push(line);
      log(msg, level);
    };

    let interviewsCompleted = 0;
    let interviewsFailed = 0;
    let lastRowIndex: number | null = null;
    let currentRowIndex: number | null = null;
    let status: LiveWorkerRunResult["status"] = "completed";

    const shouldAbort = () => Boolean(signal?.aborted);

    await initInterviewQueue(projectId, data.length);

    const browser = await chromium.launch(getChromiumLaunchOptions(headless));
    const page = await browser.newPage();
    const login = new NvLoginPage(page);
    const home = new NvHomePage(page);
    const interview = new NvInterviewPage(page);

    const cleanupRow = async (error: string, quest?: string, lastQ?: string | null) => {
      if (currentRowIndex === null) return;
      await markRowFailed(projectId, currentRowIndex, sessionId, error, quest, lastQ ?? undefined);
      interviewsFailed++;
      currentRowIndex = null;
    };

    try {
      writeLog(`Logging in as ${profile.label} (station=${profile.station})`);
      await login.goto(liveLink);
      await login.loginWithProfile(profile, config);
      await home.waitForHome();
      writeLog("Reached interviewer home screen", "success");

      while (!shouldAbort()) {
        const rowIndex = await claimNextRow(
          projectId,
          profile.id,
          sessionId,
        );
        if (rowIndex === null) {
          writeLog("No more pending rows in queue for this worker");
          break;
        }

        currentRowIndex = rowIndex;
        lastRowIndex = rowIndex;
        const row = data[rowIndex];
        if (!row) {
          await cleanupRow(`Row ${rowIndex} missing from dataset`);
          continue;
        }

        const rawQuest = row[questField];
        const quest = formatQuestId(rawQuest);
        writeLog(`Starting interview row ${rowIndex} quest=${quest}`);

        try {
          await home.startCaseByQuest(rawQuest);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          await page.screenshot({
            path: path.join(outputDir, `fail-start-${rowIndex}.png`),
            fullPage: true,
          });
          await cleanupRow(`Failed to start case: ${message}`, quest);
          await killSession(page, liveLink);
          await login.goto(liveLink);
          await login.loginWithProfile(profile, config);
          await home.waitForHome();
          continue;
        }

        let lastQuestion: string | null = null;
        let stepNum = 0;
        let interviewOk = true;

        while (!shouldAbort()) {
          stepNum++;
          await heartbeatRow(projectId, rowIndex, sessionId, lastQuestion ?? undefined);

          const ready = await waitForNvQuestionReady(page, {
            timeoutMs: 45_000,
            log: (m) => writeLog(m),
            shouldAbort,
          });

          if (shouldAbort()) {
            status = "stopped";
            interviewOk = false;
            break;
          }

          if (!ready) {
            if (await home.isOnHome()) {
              writeLog("Returned to home without explicit end question", "warn");
              break;
            }
            await page.screenshot({
              path: path.join(outputDir, `fail-load-${rowIndex}-step${stepNum}.png`),
              fullPage: true,
            });
            interviewOk = false;
            await cleanupRow("Question never loaded", quest, lastQuestion);
            break;
          }

          const classified = await interview.getCurrentQuestion();
          if (!classified || classified.name === "UNKNOWN") {
            if (await home.isOnHome()) break;
            if (await isInterviewCompletePage(page)) break;
            interviewOk = false;
            await cleanupRow("Could not classify question", quest, lastQuestion);
            break;
          }

          lastQuestion = classified.name;
          await heartbeatRow(projectId, rowIndex, sessionId, lastQuestion);

          const answer = resolveExploreAnswer(classified, {
            seedRow: row as DataRow,
            definition,
            questionsInDefinitionNotInData,
            datasetRowIndex: rowIndex,
            mode: "live",
            splitSeedNonce: `${sessionId}:${rowIndex}`,
          });

          for (const w of answer.warnings) writeLog(w, "warn");

          if (!answer.configured || answer.source === "fallback") {
            await page.screenshot({
              path: path.join(outputDir, `fail-policy-${classified.name}.png`),
              fullPage: true,
            });
            interviewOk = false;
            await cleanupRow(
              answer.warnings.join(" ") || `No configured answer for ${classified.name}`,
              quest,
              lastQuestion,
            );
            break;
          }

          const remaining = definition.Questions.filter(
            (q) => !lastQuestion || q.Name >= classified.name,
          );
          const schedule = buildLoiSchedule({
            targetMinutes: config.loi.targetMinutes,
            jitterPercent: config.loi.jitterPercent,
            remainingQuestions: remaining.length ? remaining : definition.Questions,
          });
          const stepDelay =
            schedule.find((s) => s.questionName === classified.name)?.delayMs ?? 3000;
          await delay(stepDelay);

          let answerText = answer.openText;
          if (answer.statementAnswers && Object.keys(answer.statementAnswers).length > 0) {
            answerText = formatStatementAnswersForTrail(answer.statementAnswers);
          } else if (!answerText) {
            answerText = answer.codes.join(",") || "(empty)";
          }
          writeLog(
            `  ${classified.name} → ${answerText} (${answer.source}, ${answer.policy})`,
          );

          try {
            await interview.applyAnswer({
              codes: answer.codes,
              openText: answer.openText,
              statementAnswers: answer.statementAnswers,
              source:
                answer.source === "dataset"
                  ? "data"
                  : answer.source === "split"
                    ? "split"
                    : "fallback",
              warnings: answer.warnings,
            });
          } catch (e) {
            interviewOk = false;
            await cleanupRow(
              e instanceof Error ? e.message : String(e),
              quest,
              lastQuestion,
            );
            break;
          }

          const isEnd = isInterviewEndQuestion(classified.name, exploreEndQuestions);
          const next = await findFirstVisible(page, NV_SELECTORS.interview.nextButton);
          const autoAdvance = expectsAutoAdvance(classified);

          if (!autoAdvance && next) {
            await next.click();
          } else if (autoAdvance) {
            await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
            await page.waitForTimeout(600);
          } else if (next) {
            await next.click();
          }

          if (isEnd) {
            writeLog(`End question ${classified.name} — waiting for home`, "success");
            await page.waitForTimeout(1500);
            if (!(await home.isOnHome())) {
              if (next) await next.click().catch(() => {});
              await page.waitForTimeout(2000);
            }
            break;
          }

          const after = await waitForNvQuestionChange(page, classified.name, {
            timeoutMs: autoAdvance ? 8_000 : 25_000,
            log: (m) => writeLog(m),
            shouldAbort,
          });

          if (!after && !(await home.isOnHome()) && next) {
            writeLog("Still on question — clicking Next again", "warn");
            await next.click();
            await waitForNvQuestionChange(page, classified.name, {
              timeoutMs: 15_000,
              shouldAbort,
            });
          }

          if (await home.isOnHome()) break;
        }

        if (shouldAbort()) {
          status = "stopped";
          if (currentRowIndex !== null) {
            await releaseRow(projectId, currentRowIndex, sessionId, "Stopped by user");
            currentRowIndex = null;
          }
          break;
        }

        if (interviewOk && currentRowIndex !== null) {
          await markRowCompleted(
            projectId,
            currentRowIndex,
            sessionId,
            quest,
            lastQuestion ?? undefined,
          );
          interviewsCompleted++;
          writeLog(`Completed row ${rowIndex} (${interviewsCompleted} total)`, "success");
          currentRowIndex = null;

          if (!(await home.isOnHome())) {
            await home.waitForHome(30_000).catch(async () => {
              await killSession(page, liveLink);
              await login.goto(liveLink);
              await login.loginWithProfile(profile, config);
              await home.waitForHome();
            });
          }
          continue;
        }

        if (currentRowIndex !== null) {
          await killSession(page, liveLink);
          await login.goto(liveLink);
          await login.loginWithProfile(profile, config);
          await home.waitForHome();
          currentRowIndex = null;
        }
      }

      if (await home.isOnHome()) {
        writeLog("Exiting NV session");
        await home.exit();
      } else {
        await killSession(page, liveLink);
      }
    } catch (e) {
      status = "failed";
      const message = e instanceof Error ? e.message : String(e);
      writeLog(`FATAL: ${message}`, "error");
      if (currentRowIndex !== null) {
        await releaseRow(projectId, currentRowIndex, sessionId, message).catch(() => {});
      }
      await killSession(page, liveLink).catch(() => {});
      await fs.writeFile(logFile, logLines.join("\n"));
      await browser.close();
      return {
        sessionId,
        interviewsCompleted,
        interviewsFailed,
        lastRowIndex,
        status,
        error: message,
        logFile,
      };
    } finally {
      await fs.writeFile(logFile, logLines.join("\n")).catch(() => {});
      await browser.close();
    }

    return {
      sessionId,
      interviewsCompleted,
      interviewsFailed,
      lastRowIndex,
      status,
      logFile,
    };
  }
}
