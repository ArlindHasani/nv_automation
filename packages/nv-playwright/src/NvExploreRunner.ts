import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  type DataRow,
  type Definition,
  formatQuestionCodes,
  mergeDefinition,
  type ProjectConfig,
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

/** Long NV radio lists never auto-advance reliably — always use Next. */
function expectsAutoAdvance(classified: ClassifiedQuestion): boolean {
  if (classified.tileSelect) return true;
  if (!classified.autoSubmit) return false;
  if (classified.type === "Single" && classified.codes.length > 6) return false;
  return true;
}

export type ExploreLogFn = (
  message: string,
  level?: "info" | "warn" | "error" | "success",
) => void;

export interface ExploreBlocker {
  question: string;
  type: string;
  reason: string;
  screenshot?: string;
}

export interface ExploreTrailStep {
  step: number;
  question: string;
  type: string;
  options: string;
  answer: string;
  answerSource: string;
  screenshot?: string;
}

export interface ExploreOptions {
  config: ProjectConfig;
  definition: Definition;
  outputDir: string;
  seedRow?: DataRow;
  headless?: boolean;
  maxSteps?: number;
  log?: ExploreLogFn;
}

export interface ExploreResult {
  definition: Definition;
  discovered: number;
  added: string[];
  updated: string[];
  conflicts: ReturnType<typeof mergeDefinition>["conflicts"];
  status: "completed" | "partial";
  blockers: ExploreBlocker[];
  steps: number;
  discoveredNames: string[];
  trail: ExploreTrailStep[];
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
    } = options;

    const overrides = config.exploreDefaults ?? {};
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

    log(`Opened test link: ${config.testLink}`, "info");
    if (seedRow) {
      log(
        `Guided explore: using dataset row ${config.exploreSeedRowIndex ?? 0}`,
        "info",
      );
    }
    if (Object.keys(overrides).length > 0) {
      log(`Explore overrides: ${JSON.stringify(overrides)}`, "info");
    }

    await login.goto(config.testLink);

    let steps = 0;
    let stuckCount = 0;
    let status: ExploreResult["status"] = "completed";

    const waitLog = (message: string) => log(`  ${message}`, "info");

    try {
      while (steps < maxSteps) {
        const stepNum = steps + 1;
        const classified = await waitForNvQuestionReady(page, {
          timeoutMs: 45_000,
          log: waitLog,
        });
        if (!classified) {
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
        const answer = resolveExploreAnswer(classified, {
          overrides,
          seedRow,
          definition,
        });
        for (const w of answer.warnings) log(`  ${w}`, "warn");
        let answerText = answer.openText;
        if (answerText === undefined || answerText === "") {
          answerText = answer.codes.length > 0 ? answer.codes.join(",") : "(empty)";
        }
        log(
          `  Answering ${prevName} → "${answerText}" (${answer.source})`,
          "info",
        );

        if (answer.codes.length === 0 && !answer.openText && answer.warnings.length > 0) {
          const screenshot = `explore-blocked-no-answer-${classified.name}.png`;
          await page.screenshot({ path: `${outputDir}/${screenshot}`, fullPage: true });
          blockers.push({
            question: classified.name,
            type: classified.type,
            reason: answer.warnings.join(" "),
            screenshot,
          });
          log(`Step ${stepNum}: no answer for ${classified.name}`, "error");
          status = "partial";
          break;
        }

        try {
          await interview.applyAnswer({
            codes: answer.codes,
            openText: answer.openText,
            source: answer.source === "dataset" ? "data" : "fallback",
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
          question: classified.name,
          type: classified.type,
          options: optionsText,
          answer: answerText,
          answerSource: answer.source,
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

        let after = await waitForNvQuestionChange(page, prevName, {
          timeoutMs: classified.tileSelect ? 15_000 : autoAdvance ? 6_000 : 30_000,
          log: waitLog,
        });

        if (sameQuestion(after) && next) {
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
          });
        }

        if (sameQuestion(after)) {
          stuckCount++;
          log(
            `  Stuck on ${prevName} after answer + Next (${stuckCount}/2)`,
            "error",
          );
          if (stuckCount >= 2) {
            const screenshot = `explore-blocked-stuck-${prevName}.png`;
            await page.screenshot({ path: `${outputDir}/${screenshot}`, fullPage: true });
            blockers.push({
              question: prevName,
              type: classified.type,
              reason: `Could not advance past "${prevName}" — answer was applied but the page did not move. Add an explore override or check for a validation error on screen.`,
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
        steps++;
      }
    } finally {
      await browser.close();
    }

    const merged = mergeDefinition(definition, discoveredList);
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

    await fs.writeFile(
      `${outputDir}/explore-trail.json`,
      JSON.stringify(trail, null, 2),
    );
    log(`Explore trail → explore-cache/explore-trail.json`, "info");

    if (blockers.length > 0) {
      log(
        `Explore ${status}: blocked at ${blockers[0].question} — partial results saved`,
        "warn",
      );
    } else {
      log(`Explore completed — ${steps} step(s) walked`, "success");
    }

    return {
      definition: merged.definition,
      discovered: discoveredList.length,
      added: merged.added,
      updated: merged.updated,
      conflicts: merged.conflicts,
      status,
      blockers,
      steps,
      discoveredNames: discoveredList.map((d) => d.name),
      trail,
    };
  }
}
