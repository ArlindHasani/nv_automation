import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  findPostExploreConfigurationGaps,
  type ExploreBlocker,
  type DataRow,
  type Definition,
  formatQuestionCodes,
  mergeDefinition,
  validateDiscoveryForMerge,
  validateMergedDefinition,
  type ProjectConfig,
  type AnswerConfigurationGap,
} from "@nv/core";
import { NvInterviewPage } from "./pages/NvInterviewPage.js";
import { NvLoginPage } from "./pages/NvLoginPage.js";
import {
  formatDiscoveredOptions,
  resolveExploreAnswer,
} from "./explore-answers.js";
import {
  toDiscoveredQuestion,
  type ClassifiedQuestion,
} from "./question-classifier.js";
import { findFirstVisible } from "./question-classifier.js";
import { NV_SELECTORS } from "./selectors.js";
import {
  waitForNvQuestionChange,
  waitForNvQuestionReady,
} from "./wait-for-question.js";
import {
  isInterviewCompletePage,
  isInterviewEndQuestion,
} from "./interview-end.js";
import { writeExploreTrailArtifacts, formatStatementAnswersForTrail } from "./explore-trail-export.js";

/** Long NV radio lists never auto-advance reliably — always use Next. */
function expectsAutoAdvance(classified: ClassifiedQuestion): boolean {
  if (classified.type === "Grid") return false;
  if (classified.tileSelect) return true;
  if (!classified.autoSubmit) return false;
  if (classified.type === "Single" && classified.codes.length > 6) return false;
  return true;
}

export type ExploreLogFn = (
  message: string,
  level?: "info" | "warn" | "error" | "success",
) => void;

export type { ExploreBlocker };

export interface ExploreTrailStep {
  step: number;
  rowPass: number;
  datasetRowIndex: number;
  question: string;
  type: string;
  options: string;
  answer: string;
  answerSource: string;
  answerPolicy?: string;
  configured?: boolean;
  warnings?: string;
  screenshot?: string;
}

export interface DatasetRowPass {
  index: number;
  row: DataRow;
}

export interface ExploreOptions {
  config: ProjectConfig;
  definition: Definition;
  outputDir: string;
  /** @deprecated Use datasetRows */
  seedRow?: DataRow;
  /** Dataset rows to walk (one test-link pass each). */
  datasetRows?: DatasetRowPass[];
  runId?: string;
  headless?: boolean;
  maxSteps?: number;
  log?: ExploreLogFn;
  /** Extra question names that end a guided explore walk (in addition to ANMER). */
  exploreEndQuestions?: string[];
  /** SAV questions missing from definition — used for post-merge validation. */
  coverageGaps?: string[];
  /** Definition questions missing from active dataset — answer policy input. */
  questionsInDefinitionNotInData?: string[];
  /** When set, loop exits early with partial results. */
  signal?: AbortSignal;
}

function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

interface ExploreStepContext {
  question: string;
  type: string;
  answer?: string;
  answerSource?: string;
  warnings: string[];
  phase: "loading" | "answering" | "waiting_advance" | "stuck";
}

function describeManualStopReason(ctx: ExploreStepContext): string {
  const parts = [`Stopped by user at ${ctx.question} (${ctx.type}).`];
  if (ctx.answer !== undefined) {
    parts.push(`Last answer: "${ctx.answer}" (${ctx.answerSource ?? "unknown"}).`);
  }
  if (ctx.warnings.length > 0) {
    parts.push(ctx.warnings.join(" "));
  }
  if (ctx.phase === "loading") {
    parts.push("Was waiting for a question to load.");
  } else if (ctx.phase === "waiting_advance") {
    parts.push("Was waiting for the page to advance after answering.");
  } else if (ctx.phase === "stuck") {
    parts.push(
      "Page did not advance — still on the same question after answer + Next.",
    );
  }
  return parts.join(" ");
}

export interface ExploreResult {
  definition: Definition;
  discovered: number;
  added: string[];
  updated: string[];
  conflicts: ReturnType<typeof mergeDefinition>["conflicts"];
  mergeIssues: ReturnType<typeof validateMergedDefinition>;
  status: "completed" | "partial";
  blockers: ExploreBlocker[];
  steps: number;
  rowsWalked: number;
  discoveredNames: string[];
  trail: ExploreTrailStep[];
  trailJson: string;
  trailCsv: string;
  configurationGaps: AnswerConfigurationGap[];
}

export class NvExploreRunner {
  async run(options: ExploreOptions): Promise<ExploreResult> {
    const {
      config,
      definition,
      outputDir,
      seedRow,
      headless = true,
      maxSteps = 200,
      log = console.log,
      exploreEndQuestions = config.exploreEndQuestions ?? [],
      coverageGaps = [],
      questionsInDefinitionNotInData = [],
      signal,
      runId: runIdInput,
      datasetRows: datasetRowsInput,
    } = options;

    const runId = runIdInput ?? `run-${Date.now()}`;
    const datasetRows =
      datasetRowsInput ??
      (seedRow
        ? [{ index: config.exploreSeedRowIndex ?? 0, row: seedRow }]
        : []);

    const blockers: ExploreBlocker[] = [];
    const discoveredList: ReturnType<typeof toDiscoveredQuestion>[] = [];
    const trail: ExploreTrailStep[] = [];
    const seen = new Set<string>();

    await fs.mkdir(outputDir, { recursive: true });

    const browser = await chromium.launch({ headless });
    const page = await browser.newPage();
    const login = new NvLoginPage(page);
    const interview = new NvInterviewPage(page);

    if (!config.testLink) {
      await browser.close();
      throw new Error("Set a test link in project settings before exploring");
    }

    if (datasetRows.length === 0) {
      await browser.close();
      throw new Error(
        "Guided explore requires an uploaded dataset — import a SAV and activate it before exploring",
      );
    }

    let steps = 0;
    let rowsWalked = 0;
    let stuckCount = 0;
    let status: ExploreResult["status"] = "completed";

    const waitLog = (message: string) => log(`  ${message}`, "info");
    const shouldAbort = () => isAborted(signal);
    let stepContext: ExploreStepContext = {
      question: "?",
      type: "unknown",
      warnings: [],
      phase: "loading",
    };

    const finishUserStop = async (): Promise<void> => {
      const lastTrail = trail.at(-1);
      if (lastTrail && stepContext.question === "?") {
        stepContext = {
          question: lastTrail.question,
          type: lastTrail.type,
          answer: lastTrail.answer,
          answerSource: lastTrail.answerSource,
          warnings: stepContext.warnings,
          phase: stepContext.phase,
        };
      }
      log("Explore stopped by user", "warn");
      const reason = describeManualStopReason(stepContext);
      log(`  ${reason}`, "warn");
      status = "partial";
      const safeName = stepContext.question.replace(/[^a-zA-Z0-9_-]+/g, "_");
      const screenshot = `explore-stopped-${safeName}.png`;
      try {
        await page.screenshot({ path: `${outputDir}/${screenshot}`, fullPage: true });
      } catch {
        // page may already be closing
      }
      blockers.push({
        question: stepContext.question,
        type: "stopped",
        reason,
        screenshot,
      });
    };

    try {
      rowLoop: for (let passIdx = 0; passIdx < datasetRows.length; passIdx++) {
        const { index: datasetRowIndex, row: currentSeedRow } =
          datasetRows[passIdx]!;
        const rowPass = passIdx + 1;

        if (passIdx === 0) {
          log(`Opened test link: ${config.testLink}`, "info");
        }
        log(
          `Guided explore pass ${rowPass}/${datasetRows.length}: dataset row ${datasetRowIndex}`,
          "info",
        );
        if (passIdx === 0) {
          await login.goto(config.testLink);
        } else {
          await login.goto(config.testLink);
          stuckCount = 0;
        }
        rowsWalked++;
        let passCompleted = false;
        let passSteps = 0;

      while (passSteps < maxSteps) {
        if (shouldAbort()) {
          await finishUserStop();
          break;
        }

        const stepNum = steps + 1;
        stepContext = {
          question: trail.at(-1)?.question ?? "?",
          type: trail.at(-1)?.type ?? "unknown",
          warnings: [],
          phase: "loading",
        };
        const classified = await waitForNvQuestionReady(page, {
          timeoutMs: 45_000,
          log: waitLog,
          shouldAbort,
        });
        if (shouldAbort()) {
          await finishUserStop();
          break;
        }
        if (!classified) {
          if (passSteps > 0 && (await isInterviewCompletePage(page))) {
            log(
              `Interview completion page detected — pass ${rowPass} complete`,
              "success",
            );
            passCompleted = true;
            break;
          }
          const screenshot = `explore-blocked-unclassified-${steps}.png`;
          await page.screenshot({ path: `${outputDir}/${screenshot}`, fullPage: true });
          blockers.push({
            question: "?",
            type: "unknown",
            reason:
              "Question did not finish loading in time. Check explore-cache screenshot — NV may need longer load or the page structure changed.",
            screenshot,
          });
          log(
            `Step ${stepNum}: question never appeared — saved screenshot ${screenshot}`,
            "error",
          );
          status = "partial";
          break;
        }

        const disc = toDiscoveredQuestion(classified);
        const optionsText = formatDiscoveredOptions(classified);

        if (!seen.has(disc.name)) {
          seen.add(disc.name);
          discoveredList.push(disc);
          log(
            `Step ${stepNum}: recorded ${disc.name} (${disc.type})`,
            "success",
          );
          log(`  Options on page: ${optionsText}`, "info");
          if (disc.labels && Object.keys(disc.labels).length > 0) {
            log(
              `  Labels: ${Object.entries(disc.labels)
                .map(([c, l]) => `${c}=${l}`)
                .join(", ")}`,
              "info",
            );
          }
          await page.screenshot({
            path: `${outputDir}/explore-${disc.name}.png`,
            fullPage: true,
          });
          log(`  Screenshot → explore-cache/explore-${disc.name}.png`, "info");
        } else {
          log(`Step ${stepNum}: still on ${disc.name} (${disc.type})`, "info");
        }

        const next = await findFirstVisible(page, NV_SELECTORS.interview.nextButton);
        const autoAdvance = expectsAutoAdvance(classified);
        const needsNextMandatory = !autoAdvance;

        if (needsNextMandatory && !next) {
          const screenshot = `explore-blocked-no-next-${classified.name}.png`;
          await page.screenshot({ path: `${outputDir}/${screenshot}`, fullPage: true });
          blockers.push({
            question: classified.name,
            type: classified.type,
            reason: "Next button not found — cannot continue.",
            screenshot,
          });
          log(`Step ${stepNum}: no Next button on ${classified.name}`, "error");
          status = "partial";
          break;
        }

        const prevName = classified.name;
        stepContext = {
          question: classified.name,
          type: classified.type,
          warnings: [],
          phase: "answering",
        };
        const answer = resolveExploreAnswer(classified, {
          seedRow: currentSeedRow,
          definition,
          questionsInDefinitionNotInData,
          datasetRowIndex: datasetRowIndex,
          mode: "explore",
        });
        for (const w of answer.warnings) log(`  ${w}`, "warn");
        stepContext.warnings = [...answer.warnings];

        let answerText = answer.openText;
        if (answer.statementAnswers && Object.keys(answer.statementAnswers).length > 0) {
          answerText = formatStatementAnswersForTrail(answer.statementAnswers);
        } else if (answerText === undefined || answerText === "") {
          answerText = answer.codes.length > 0 ? answer.codes.join(",") : "(empty)";
        }
        log(
          `  Answering ${prevName} → "${answerText}" (${answer.source}, ${answer.policy})`,
          "info",
        );
        stepContext.answer = answerText;
        stepContext.answerSource = answer.source;

        const hasGridAnswers =
          answer.statementAnswers &&
          Object.keys(answer.statementAnswers).length > 0;
        if (
          !answer.configured ||
          answer.source === "fallback" ||
          (answer.codes.length === 0 &&
            !answer.openText &&
            !hasGridAnswers)
        ) {
          const screenshot = `explore-blocked-no-answer-${classified.name}.png`;
          await page.screenshot({ path: `${outputDir}/${screenshot}`, fullPage: true });
          blockers.push({
            question: classified.name,
            type: classified.type,
            reason:
              answer.warnings.join(" ") ||
              `Question '${classified.name}' is not in the active dataset — configure a fixed answer or Split weights in Definition`,
            screenshot,
          });
          log(`Step ${stepNum}: no configured answer for ${classified.name}`, "error");
          status = "partial";
          break;
        }

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
          const message = e instanceof Error ? e.message : String(e);
          const screenshot = `explore-blocked-apply-${classified.name}.png`;
          await page.screenshot({ path: `${outputDir}/${screenshot}`, fullPage: true });
          blockers.push({
            question: classified.name,
            type: classified.type,
            reason: message,
            screenshot,
          });
          log(`Step ${stepNum}: failed to answer ${classified.name} — ${message}`, "error");
          status = "partial";
          break;
        }

        trail.push({
          step: stepNum,
          rowPass,
          datasetRowIndex,
          question: classified.name,
          type: classified.type,
          options: optionsText,
          answer: answerText,
          answerSource: answer.source,
          answerPolicy: answer.policy,
          configured: answer.configured,
          warnings: answer.warnings.length > 0 ? answer.warnings.join("; ") : undefined,
          screenshot: `explore-${classified.name}.png`,
        });

        const prevUpper = prevName.toUpperCase();
        const sameQuestion = (q: { name: string } | null | undefined) =>
          !q || q.name.toUpperCase() === prevUpper;

        if (autoAdvance) {
          log(
            classified.tileSelect
              ? "  Tile selected — waiting for page advance…"
              : "  Option selected — waiting for page advance…",
            "info",
          );
          await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
          await page.waitForTimeout(600);
        } else if (next) {
          log("  Clicking Next…", "info");
          await next.click();
        }

        stepContext.phase = "waiting_advance";

        let after = await waitForNvQuestionChange(page, prevName, {
          timeoutMs: classified.tileSelect ? 15_000 : autoAdvance ? 6_000 : 30_000,
          log: waitLog,
          shouldAbort,
        });

        if (shouldAbort()) {
          await finishUserStop();
          break;
        }

        if (sameQuestion(after) && next) {
          stepContext.phase = "stuck";
          log(
            classified.autoSubmit && autoAdvance
              ? "  data-autosubmit did not advance — clicking Next…"
              : "  Still on question — clicking Next…",
            "warn",
          );
          await next.click();
          after = await waitForNvQuestionChange(page, prevName, {
            timeoutMs: 20_000,
            log: waitLog,
            shouldAbort,
          });
        }

        if (shouldAbort()) {
          await finishUserStop();
          break;
        }

        if (sameQuestion(after)) {
          const endQuestions = exploreEndQuestions;
          if (isInterviewEndQuestion(prevName, endQuestions)) {
            log(
              `  End of interview at ${prevName} — pass ${rowPass} complete`,
              "success",
            );
            passCompleted = true;
            passSteps++;
            steps++;
            break;
          }

          if (await isInterviewCompletePage(page)) {
            log(
              `  Interview completion page detected — pass ${rowPass} complete`,
              "success",
            );
            passCompleted = true;
            passSteps++;
            steps++;
            break;
          }

          log(
            `  Stuck on ${prevName} after answer + Next (${stuckCount + 1}/2)`,
            "error",
          );
          stuckCount++;
          if (stuckCount >= 2) {
            const screenshot = `explore-blocked-stuck-${prevName}.png`;
            await page.screenshot({ path: `${outputDir}/${screenshot}`, fullPage: true });
            blockers.push({
              question: prevName,
              type: classified.type,
              reason: `Could not advance past "${prevName}" — answer was applied but the page did not move. Configure a fixed answer or Split weights, or check for a validation error on screen.`,
              screenshot,
            });
            log(`Step ${stepNum}: blocked on ${prevName}`, "error");
            status = "partial";
            break;
          }
          continue;
        }

        if (after) {
          log(`  Advanced → ${after.name}`, "success");
        } else {
          log("  Next page loaded but question not detected yet", "warn");
        }
        stuckCount = 0;
        passSteps++;
        steps++;
      }

        if (shouldAbort()) break rowLoop;
        if (status === "partial") break rowLoop;
        if (!passCompleted) break rowLoop;
        if (passIdx < datasetRows.length - 1) {
          log(
            `Pass ${rowPass} finished — opening test link for next dataset row`,
            "info",
          );
          continue rowLoop;
        }
      }
    } finally {
      await browser.close();
    }

    const merged = mergeDefinition(definition, discoveredList);
    const discoveryIssues = validateDiscoveryForMerge(discoveredList);
    for (const issue of discoveryIssues) {
      log(
        `  Merge check [${issue.severity}] ${issue.question}: ${issue.message}`,
        issue.severity === "error" ? "error" : "warn",
      );
    }

    const mergeIssues = validateMergedDefinition({
      mergeResult: merged,
      discoveryIssues,
      questionsInDataNotInDefinition: coverageGaps,
    });
    for (const issue of mergeIssues.filter((i) => i.severity === "warn")) {
      if (!discoveryIssues.includes(issue)) {
        log(`  Review [${issue.severity}] ${issue.question}: ${issue.message}`, "warn");
      }
    }

    log(
      `Merging into Definition.json — ${discoveredList.length} discovered, +${merged.added.length} new, ~${merged.updated.length} updated`,
      "info",
    );
    for (const name of merged.added) {
      const q = merged.definition.Questions.find((item) => item.Name === name);
      if (q) {
        const codes = formatQuestionCodes(q);
        log(`  + ${name} (${q.Type})${codes ? `: ${codes}` : ""}`, "success");
      }
    }
    for (const name of merged.updated) {
      const q = merged.definition.Questions.find((item) => item.Name === name);
      if (q) {
        const codes = formatQuestionCodes(q);
        log(`  ~ ${name} (${q.Type})${codes ? `: ${codes}` : ""}`, "info");
      }
    }
    if (merged.conflicts.length > 0) {
      for (const c of merged.conflicts) {
        log(
          `  ! ${c.name}: ${c.field} conflict (${c.existing} vs ${c.incoming})`,
          "warn",
        );
      }
    }

    const configurationGaps = findPostExploreConfigurationGaps(
      merged.definition,
      discoveredList.map((d) => d.name),
      questionsInDefinitionNotInData,
    );
    for (const gap of configurationGaps) {
      log(
        `  Configuration gap [${gap.type}] ${gap.question}: ${gap.reason}`,
        "warn",
      );
    }

    const { trailJson, trailCsv } = await writeExploreTrailArtifacts(
      outputDir,
      runId,
      trail,
    );
    log(`Explore trail CSV → explore-cache/${trailCsv}`, "info");
    log(`Explore trail JSON → explore-cache/${trailJson}`, "info");

    if (blockers.length > 0) {
      log(
        `Explore ${status}: blocked at ${blockers[0].question} — partial results saved`,
        "warn",
      );
    } else {
      log(
        `Explore completed — ${steps} step(s) across ${rowsWalked} row pass(es) of ${datasetRows.length}`,
        "success",
      );
    }

    return {
      definition: merged.definition,
      discovered: discoveredList.length,
      added: merged.added,
      updated: merged.updated,
      conflicts: merged.conflicts,
      mergeIssues,
      status,
      blockers,
      steps,
      rowsWalked,
      discoveredNames: discoveredList.map((d) => d.name),
      trail,
      trailJson,
      trailCsv,
      configurationGaps,
    };
  }
}
