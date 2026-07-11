import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  buildCoverageReport,
  claimNextRow,
  delay,
  findQuestion,
  formatQuestId,
  getChromiumLaunchOptions,
  heartbeatRow,
  initInterviewQueue,
  markRowCompleted,
  markRowFailed,
  mergeDefinition,
  recordLiveRun,
  releaseRow,
  saveDefinition,
  type DataRow,
  type Definition,
  type InterviewData,
  type ProjectConfig,
  type WorkerProfile,
} from "@nv/core";
import { NvInterviewPage } from "./pages/NvInterviewPage.js";
import { NvLoginPage } from "./pages/NvLoginPage.js";
import { NvHomePage } from "./pages/NvHomePage.js";
import { isOnLoginScreen, killSession } from "./nv-session.js";
import {
  resolveExploreAnswer,
  ensureMultiMinCodes,
} from "./explore-answers.js";
import {
  formatStatementAnswersForTrail,
  writeLiveTrailArtifacts,
  type LiveTrailStep,
} from "./live-trail-export.js";
import {
  findFirstVisible,
  toDiscoveredQuestion,
  type ClassifiedQuestion,
} from "./question-classifier.js";
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

function formatElapsed(ms: number): string {
  const sec = ms / 1000;
  return sec < 60 ? `+${sec.toFixed(1)}s` : `+${Math.floor(sec / 60)}m${Math.round(sec % 60)}s`;
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
  status: "completed" | "stopped" | "failed" | "partial";
  error?: string;
  logFile: string;
  trailCsv?: string;
  trailJson?: string;
  trailWideCsv?: string;
  steps?: number;
  lastQuest?: string;
  lastQuestion?: string | null;
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
  /** When false, skip LOI pacing delays (fast path for testing insertion logic). */
  respectLoi?: boolean;
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
      definition: initialDefinition,
      data,
      outputDir,
      headless = true,
      exploreEndQuestions = ["ANMER"],
      questionsInDefinitionNotInData: initialNotInData = [],
      respectLoi = true,
      signal,
    } = options;

    let definition = initialDefinition;
    let questionsInDefinitionNotInData = [...initialNotInData];

    const log = options.log ?? (() => {});
    const questField = config.questField || "quest";
    const liveLink = config.liveLink || config.nvLoginUrl;
    if (!liveLink) throw new Error("Set a live link in project settings");

    await fs.mkdir(outputDir, { recursive: true });
    const logFile = path.join(outputDir, `${sessionId}-worker.log`);
    const logLines: string[] = [];
    const trail: LiveTrailStep[] = [];
    const startedAtMs = Date.now();
    const startedAtIso = new Date(startedAtMs).toISOString();
    let lastQuest: string | undefined;
    let trailArtifacts:
      | { trailJson: string; trailCsv: string; trailWideCsv: string }
      | undefined;

    const writeLog = (msg: string, level?: "info" | "warn" | "error" | "success") => {
      const elapsed = formatElapsed(Date.now() - startedAtMs);
      const line = `[${elapsed}] ${msg}`;
      logLines.push(line);
      log(line, level);
    };

    /** Persist newly seen NV screens into Definition.json (same as explore merge). */
    const ensureDiscoveredInDefinition = async (
      classified: ClassifiedQuestion,
    ): Promise<void> => {
      if (findQuestion(definition, classified.name)) return;

      const disc = toDiscoveredQuestion(classified);
      const merged = mergeDefinition(definition, [disc]);
      definition = merged.definition;
      await saveDefinition(projectId, definition);

      const coverage = buildCoverageReport(data, definition, config.savFieldMap);
      questionsInDefinitionNotInData = coverage.questionsInDefinitionNotInData;

      writeLog(
        `Added ${disc.name} (${disc.type}) to Definition from live discovery`,
        "success",
      );
    };

    let interviewsCompleted = 0;
    let interviewsFailed = 0;
    let lastRowIndex: number | null = null;
    let currentRowIndex: number | null = null;
    let status: LiveWorkerRunResult["status"] = "completed";
    let fatalError: string | undefined;
    let interviewPass = 0;

    const shouldAbort = () => Boolean(signal?.aborted);

    const persistTrail = async () => {
      trailArtifacts = await writeLiveTrailArtifacts(outputDir, sessionId, trail);
      await fs.writeFile(logFile, logLines.join("\n")).catch(() => {});
    };

    const finishAndRecord = async (
      resultStatus: LiveWorkerRunResult["status"],
      error?: string,
    ): Promise<LiveWorkerRunResult> => {
      await persistTrail();
      const finishedAt = new Date().toISOString();
      await recordLiveRun(projectId, {
        id: sessionId,
        status:
          resultStatus === "failed"
            ? "failed"
            : resultStatus === "stopped"
              ? "stopped"
              : interviewsFailed > 0
                ? "partial"
                : resultStatus === "partial"
                  ? "partial"
                  : "completed",
        workerProfileId: profile.id,
        workerProfileLabel: profile.label,
        interviewsCompleted,
        interviewsFailed,
        steps: trail.length,
        lastRowIndex,
        lastQuest,
        lastQuestion: trail.at(-1)?.question,
        error,
        trailCsv: trailArtifacts?.trailCsv,
        trailJson: trailArtifacts?.trailJson,
        trailWideCsv: trailArtifacts?.trailWideCsv,
        logFile: path.basename(logFile),
        startedAt: startedAtIso,
        finishedAt,
      }).catch((e) => {
        writeLog(
          `Failed to record live run: ${e instanceof Error ? e.message : String(e)}`,
          "warn",
        );
      });

      return {
        sessionId,
        interviewsCompleted,
        interviewsFailed,
        lastRowIndex,
        status:
          resultStatus === "failed"
            ? "failed"
            : resultStatus === "stopped"
              ? "stopped"
              : interviewsFailed > 0
                ? "partial"
                : resultStatus,
        error,
        logFile,
        trailCsv: trailArtifacts?.trailCsv,
        trailJson: trailArtifacts?.trailJson,
        trailWideCsv: trailArtifacts?.trailWideCsv,
        steps: trail.length,
        lastQuest,
        lastQuestion: trail.at(-1)?.question ?? null,
      };
    };

    await initInterviewQueue(projectId, data.length);

    const browser = await chromium.launch(getChromiumLaunchOptions(headless));
    // NV login.js rejects HeadlessChrome / odd UAs ("browser not supported").
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
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
      if (!respectLoi) {
        writeLog("LOI delays disabled — answering as fast as NV allows", "warn");
      }
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
        lastQuest = quest;
        interviewPass += 1;
        writeLog(`Starting interview row ${rowIndex} quest=${quest}`);

        try {
          await home.startCaseByQuest(rawQuest);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          writeLog(`Failed to start case: ${message}`, "error");
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
        let unexpectedHome = false;
        let pendingQuestion: ClassifiedQuestion | null = null;
        let lastHeartbeatAt = 0;

        const maybeHeartbeat = async (questionName?: string) => {
          const now = Date.now();
          if (now - lastHeartbeatAt < 10_000 && questionName === lastQuestion) {
            return;
          }
          lastHeartbeatAt = now;
          await heartbeatRow(
            projectId,
            rowIndex,
            sessionId,
            questionName ?? lastQuestion ?? undefined,
          );
        };

        while (!shouldAbort()) {
          stepNum++;
          await maybeHeartbeat();

          const classified =
            pendingQuestion ??
            (await waitForNvQuestionReady(page, {
              timeoutMs: 45_000,
              settleMs: respectLoi ? 250 : 50,
              log: (m) => writeLog(m),
              shouldAbort,
            }));
          pendingQuestion = null;

          if (shouldAbort()) {
            status = "stopped";
            interviewOk = false;
            break;
          }

          if (!classified || classified.name === "UNKNOWN") {
            if (await home.isOnHome()) {
              writeLog("Returned to home without explicit end question", "warn");
              unexpectedHome = true;
              interviewOk = false;
              break;
            }
            if (await isInterviewCompletePage(page)) break;
            await page.screenshot({
              path: path.join(outputDir, `fail-load-${rowIndex}-step${stepNum}.png`),
              fullPage: true,
            });
            interviewOk = false;
            await cleanupRow(
              classified ? "Could not classify question" : "Question never loaded",
              quest,
              lastQuestion,
            );
            break;
          }

          lastQuestion = classified.name;
          await maybeHeartbeat(lastQuestion);

          await ensureDiscoveredInDefinition(classified);

          const defQuestion = findQuestion(definition, classified.name);
          const answer = resolveExploreAnswer(classified, {
            seedRow: row as DataRow,
            definition,
            questionsInDefinitionNotInData,
            dataRows: data,
            datasetRowIndex: rowIndex,
            mode: "live",
            splitSeedNonce: `${sessionId}:${rowIndex}`,
          });

          for (const w of answer.warnings) writeLog(w, "warn");

          const isOptionalSoftPass = answer.policy === "optional";
          if (
            !isOptionalSoftPass &&
            (!answer.configured || answer.source === "fallback")
          ) {
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

          if (isOptionalSoftPass) {
            writeLog(
              `  Soft-pass ${classified.name} (leave empty / Next with no input)`,
              "warn",
            );
          }

          const min = defQuestion?.Min ?? 0;
          const paddedCodes = ensureMultiMinCodes(answer.codes, classified, min);
          if (paddedCodes.length > answer.codes.length) {
            writeLog(
              `  Padded ${classified.name} to Min=${min}: ${paddedCodes.join(",")}`,
              "warn",
            );
          }

          let answerText = answer.openText;
          if (answer.statementAnswers && Object.keys(answer.statementAnswers).length > 0) {
            answerText = formatStatementAnswersForTrail(answer.statementAnswers);
          } else if (!answerText) {
            answerText = paddedCodes.join(",") || "(empty)";
          }
          writeLog(
            `  ${classified.name} → ${answerText} (${answer.source}, ${answer.policy})`,
          );

          try {
            await interview.applyAnswer({
              codes: paddedCodes,
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
            const message = e instanceof Error ? e.message : String(e);
            writeLog(`Failed to apply ${classified.name}: ${message}`, "error");
            await page.screenshot({
              path: path.join(outputDir, `fail-apply-${classified.name}.png`),
              fullPage: true,
            });
            trail.push({
              step: stepNum,
              rowPass: interviewPass,
              datasetRowIndex: rowIndex,
              question: classified.name,
              type: classified.type,
              options: "",
              answer: answerText,
              answerSource: answer.source,
              answerPolicy: answer.policy,
              configured: answer.configured,
              warnings: answer.warnings.join("; ") || undefined,
              elapsedMs: Date.now() - startedAtMs,
              quest,
              workerProfileId: profile.id,
              outcome: "failed",
              error: message,
            });
            interviewOk = false;
            await cleanupRow(message, quest, lastQuestion);
            break;
          }

          trail.push({
            step: stepNum,
            rowPass: interviewPass,
            datasetRowIndex: rowIndex,
            question: classified.name,
            type: classified.type,
            options: "",
            answer: answerText,
            answerSource: answer.source,
            answerPolicy: answer.policy,
            configured: answer.configured,
            warnings: answer.warnings.join("; ") || undefined,
            elapsedMs: Date.now() - startedAtMs,
            quest,
            workerProfileId: profile.id,
            outcome: isOptionalSoftPass ? "soft-pass" : "answered",
          });

          // Pace after selecting (so the UI isn't idle on an unanswered screen).
          if (respectLoi) {
            const remaining = Math.max(
              1,
              definition.Questions.length - stepNum,
            );
            const rawDelay = Math.round(
              (config.loi.targetMinutes * 60_000) / remaining,
            );
            const stepDelay = Math.min(
              2_500,
              Math.max(
                200,
                Math.round(
                  rawDelay *
                    (1 +
                      ((Math.random() * 2 - 1) * config.loi.jitterPercent) / 100),
                ),
              ),
            );
            writeLog(`  LOI pause ${stepDelay}ms before Next`);
            await delay(stepDelay, shouldAbort);
            if (shouldAbort()) {
              status = "stopped";
              break;
            }
          }

          const isEnd = isInterviewEndQuestion(classified.name, exploreEndQuestions);
          const next = await findFirstVisible(page, NV_SELECTORS.interview.nextButton);
          const autoAdvance = expectsAutoAdvance(classified);

          if (!autoAdvance && next) {
            await next.click();
          } else if (autoAdvance) {
            await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
            await page.waitForTimeout(respectLoi ? 400 : 100);
          } else if (next) {
            await next.click();
          }

          if (isEnd) {
            writeLog(`End question ${classified.name} — waiting for home`, "success");
            await page.waitForTimeout(respectLoi ? 1500 : 400);
            if (!(await home.isOnHome())) {
              if (next) await next.click().catch(() => {});
              await page.waitForTimeout(respectLoi ? 2000 : 500);
            }
            break;
          }

          const after = await waitForNvQuestionChange(page, classified.name, {
            timeoutMs: autoAdvance ? 8_000 : 25_000,
            settleMs: respectLoi ? 200 : 50,
            log: (m) => writeLog(m),
            shouldAbort,
          });

          if (!after && !(await home.isOnHome()) && next) {
            writeLog("Still on question — clicking Next again", "warn");
            await next.click();
            pendingQuestion = await waitForNvQuestionChange(page, classified.name, {
              timeoutMs: 15_000,
              settleMs: respectLoi ? 200 : 50,
              shouldAbort,
            });
          } else {
            pendingQuestion = after;
          }

          if (await home.isOnHome()) {
            writeLog(
              `Unexpected return to home after ${classified.name}`,
              "warn",
            );
            unexpectedHome = true;
            interviewOk = false;
            break;
          }
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

        if (unexpectedHome && currentRowIndex !== null) {
          await cleanupRow(
            `Unexpected return to home after ${lastQuestion ?? "unknown"}`,
            quest,
            lastQuestion,
          );
        }

        if (!interviewOk && !shouldAbort()) {
          writeLog("Re-logging after failed interview…", "warn");
          await killSession(page, liveLink);
          await page.waitForTimeout(1500);
          await login.goto(liveLink);
          // Fresh login page — if still mid-session, end again then reload.
          if (!(await isOnLoginScreen(page))) {
            await killSession(page, liveLink);
            await login.goto(liveLink);
          }
          await login.loginWithProfile(profile, config);
          await home.waitForHome();
          currentRowIndex = null;
        }
      }

      if (shouldAbort()) {
        status = "stopped";
        writeLog("Stop requested — ending NV session via end.php", "warn");
      }

      if (await home.isOnHome()) {
        writeLog("Exiting NV session");
        await home.exit();
      } else {
        writeLog("Ending NV session via end.php");
        await killSession(page, liveLink);
      }

      await browser.close();
      return finishAndRecord(status, fatalError);
    } catch (e) {
      status = "failed";
      const message = e instanceof Error ? e.message : String(e);
      fatalError = message;
      writeLog(`FATAL: ${message}`, "error");
      if (currentRowIndex !== null) {
        await releaseRow(projectId, currentRowIndex, sessionId, message).catch(() => {});
      }
      await killSession(page, liveLink).catch(() => {});
      await browser.close().catch(() => {});
      return finishAndRecord("failed", message);
    } finally {
      await fs.writeFile(logFile, logLines.join("\n")).catch(() => {});
    }
  }
}
