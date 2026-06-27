import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import {
  type DataRow,
  type Definition,
  type ProjectConfig,
  buildLoiSchedule,
  delay,
  findQuestion,
  getChromiumLaunchOptions,
  resolveAnswerForQuestion,
} from "@nv/core";
import { NvInterviewPage } from "./pages/NvInterviewPage.js";
import {
  credentialsFromDataRow,
  NvLoginPage,
} from "./pages/NvLoginPage.js";

export type InterviewLogFn = (message: string) => void;

export interface InterviewRunOptions {
  config: ProjectConfig;
  definition: Definition;
  dataRow: DataRow;
  outputDir: string;
  headless?: boolean;
  maxQuestions?: number;
  workerId?: string;
  log?: InterviewLogFn;
}

export interface InterviewRunResult {
  success: boolean;
  questionsAnswered: number;
  lastQuestion: string | null;
  error?: string;
  logFile: string;
}

export class NvInterviewRunner {
  private browser: Browser | null = null;

  async run(options: InterviewRunOptions): Promise<InterviewRunResult> {
    const {
      config,
      definition,
      dataRow,
      outputDir,
      headless = true,
      maxQuestions = 500,
      workerId = "worker-1",
      log = console.log,
    } = options;

    await fs.mkdir(outputDir, { recursive: true });
    const logLines: string[] = [];
    const writeLog = (msg: string) => {
      const line = `[${new Date().toISOString()}] [${workerId}] ${msg}`;
      logLines.push(line);
      log(line);
    };

    const logFile = path.join(outputDir, `${workerId}-interview.log`);

    try {
      this.browser = await chromium.launch(getChromiumLaunchOptions(headless));
      const page = await this.browser.newPage();
      const loginPage = new NvLoginPage(page);
      const interview = new NvInterviewPage(page);

      const creds = credentialsFromDataRow(dataRow, config);
      writeLog(`Logging in as station=${creds.station} project=${creds.project}`);

      const liveLink = config.liveLink || config.nvLoginUrl;
      if (!liveLink) {
        const err = "Set a live link in project settings before running";
        writeLog(`ERROR: ${err}`);
        await fs.writeFile(logFile, logLines.join("\n"));
        return {
          success: false,
          questionsAnswered: 0,
          lastQuestion: null,
          error: err,
          logFile,
        };
      }

      await loginPage.goto(liveLink);
      await loginPage.login(creds);

      let questionsAnswered = 0;
      let lastQuestion: string | null = null;

      while (questionsAnswered < maxQuestions) {
        const current = await interview.getCurrentQuestion();
        if (!current) {
          writeLog("No question on page — interview may be complete.");
          break;
        }

        const qName = current.name;
        writeLog(`Got question: ${qName}${current.type === "Grid" ? " (grid)" : ""}`);

        if (current.type === "Grid" && current.gridStatements?.length) {
          for (const stmt of current.gridStatements) {
            if (!findQuestion(definition, stmt.name)) {
              const err = `Question ${stmt.name} not defined in Definition.json`;
              writeLog(`ERROR: ${err}`);
              await page.screenshot({
                path: path.join(outputDir, `undefined-${stmt.name}.png`),
                fullPage: true,
              });
              await fs.writeFile(logFile, logLines.join("\n"));
              return {
                success: false,
                questionsAnswered,
                lastQuestion: qName,
                error: err,
                logFile,
              };
            }
          }
        } else {
          const qDef = findQuestion(definition, qName);
          if (!qDef) {
            const err = `Question ${qName} not defined in Definition.json`;
            writeLog(`ERROR: ${err}`);
            await page.screenshot({
              path: path.join(outputDir, `undefined-${qName}.png`),
              fullPage: true,
            });
            await fs.writeFile(logFile, logLines.join("\n"));
            return {
              success: false,
              questionsAnswered,
              lastQuestion: qName,
              error: err,
              logFile,
            };
          }
        }

        const qDef = findQuestion(definition, qName);

        const remaining = definition.Questions.filter(
          (q) => !lastQuestion || q.Name >= qName,
        );
        const schedule = buildLoiSchedule({
          targetMinutes: config.loi.targetMinutes,
          jitterPercent: config.loi.jitterPercent,
          remainingQuestions: remaining.length ? remaining : qDef ? [qDef] : [],
        });
        const stepDelay =
          schedule.find((s) => s.questionName === qName)?.delayMs ?? 3000;
        await delay(stepDelay);

        let resolved;
        if (current.type === "Grid" && current.gridStatements?.length) {
          const statementAnswers: Record<string, string[]> = {};
          const warnings: string[] = [];
          for (const stmt of current.gridStatements) {
            const part = resolveAnswerForQuestion(definition, stmt.name, dataRow);
            warnings.push(...part.warnings);
            if (part.codes.length > 0) {
              statementAnswers[stmt.name] = part.codes;
              writeLog(
                `${stmt.name}:${part.codes.join("+")} = (from ${part.source})`,
              );
            }
          }
          resolved = {
            codes: [],
            statementAnswers,
            source: "data" as const,
            warnings,
          };
        } else {
          resolved = resolveAnswerForQuestion(definition, qName, dataRow);
        }
        for (const w of resolved.warnings) writeLog(w);

        if (resolved.statementAnswers) {
          writeLog(
            `Answering grid: ${Object.entries(resolved.statementAnswers)
              .map(([name, codes]) => `${name}=${codes.join("+")}`)
              .join(", ")}`,
          );
        } else if (resolved.codes.length > 0) {
          for (const code of resolved.codes) {
            writeLog(`${qName}:${code} = (from ${resolved.source})`);
          }
        }
        if (resolved.openText !== undefined) {
          writeLog(`Answering open: ${resolved.openText}`);
        }

        if (!resolved.statementAnswers) {
          writeLog(`Answering: ${resolved.codes.join(",") || resolved.openText || ""}`);
        }

        await interview.applyAnswer(resolved);
        await interview.clickNext();

        const nextName = await interview.waitForQuestionChange(qName, 15000);
        if (!nextName) {
          writeLog(`Stuck on ${qName}, retrying once...`);
          await interview.clickNext().catch(() => {});
          const retry = await interview.waitForQuestionChange(qName, 10000);
          if (!retry) {
            await page.screenshot({
              path: path.join(outputDir, `stuck-${qName}.png`),
              fullPage: true,
            });
            const err = `Stuck on question ${qName} after retry`;
            writeLog(`ERROR: ${err}`);
            await fs.writeFile(logFile, logLines.join("\n"));
            return {
              success: false,
              questionsAnswered,
              lastQuestion: qName,
              error: err,
              logFile,
            };
          }
        }

        lastQuestion = qName;
        questionsAnswered++;
      }

      await fs.writeFile(logFile, logLines.join("\n"));
      return {
        success: true,
        questionsAnswered,
        lastQuestion,
        logFile,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeLog(`FATAL: ${message}`);
      await fs.writeFile(logFile, logLines.join("\n"));
      return {
        success: false,
        questionsAnswered: 0,
        lastQuestion: null,
        error: message,
        logFile,
      };
    } finally {
      await this.browser?.close();
      this.browser = null;
    }
  }
}

export class NvWorkerPool {
  private running = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async runBatch(
    jobs: Array<() => Promise<InterviewRunResult>>,
  ): Promise<InterviewRunResult[]> {
    const results: InterviewRunResult[] = [];
    const queue = [...jobs];

    const runNext = async (): Promise<void> => {
      const job = queue.shift();
      if (!job) return;
      this.running++;
      try {
        results.push(await job());
      } finally {
        this.running--;
      }
      await runNext();
    };

    const workers = Array.from(
      { length: Math.min(this.maxConcurrent, jobs.length) },
      () => runNext(),
    );
    await Promise.all(workers);
    return results;
  }
}
