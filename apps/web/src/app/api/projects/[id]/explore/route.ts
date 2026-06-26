import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { NvExploreRunner } from "@nv/playwright";
import {
  loadProject,
  prepareForExecution,
  recordExploreRun,
  saveProjectDefinition,
} from "@/lib/projects";
import { buildExplorePreflight } from "@nv/core";
import type { ExploreLogLevel, ExploreStreamEvent } from "@/lib/explore-stream";
import {
  endExploreSession,
  startExploreSession,
  stopExploreSession,
} from "@/lib/explore-session";
import { ensurePlaywrightBrowsersEnv, getProjectPaths } from "@nv/core";

function inferLogLevel(message: string): ExploreLogLevel {
  if (message.includes("ERROR") || message.includes("stuck") || message.includes("blocked")) {
    return "error";
  }
  if (message.includes("stopped") || message.includes("Stopping")) {
    return "warn";
  }
  if (message.includes("warn") || message.includes("No explore default")) {
    return "warn";
  }
  if (
    message.includes("complete") ||
    message.includes("Finished") ||
    message.includes("merged")
  ) {
    return "success";
  }
  return "info";
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stopped = stopExploreSession(id);
  if (!stopped) {
    return NextResponse.json({ error: "No explore run in progress" }, { status: 404 });
  }
  return NextResponse.json({ stopped: true });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const push = (event: ExploreStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      const log = (message: string, level?: ExploreLogLevel) => {
        push({
          type: "log",
          level: level ?? inferLogLevel(message),
          message,
          ts: new Date().toISOString(),
        });
      };

      try {
        log("Initializing explore session…");
        const bundle = await loadProject(id);
        if (!bundle) {
          push({ type: "error", error: "Project not found" });
          controller.close();
          return;
        }

        if (!bundle.config.testLink) {
          push({
            type: "error",
            error: "Set a test link in project settings before exploring",
          });
          controller.close();
          return;
        }

        log(`Project: ${bundle.project.name}`);
        log(`Test link: ${bundle.config.testLink}`);

        if (!bundle.activeDataset || bundle.data.length === 0) {
          push({
            type: "error",
            error:
              "Import and activate a dataset (SAV) before exploring — guided explore uses dataset rows for answers",
          });
          controller.close();
          return;
        }

        const preflight = buildExplorePreflight({
          config: bundle.config,
          definition: bundle.definition,
          activeDataset: bundle.activeDataset,
          dataRowCount: bundle.data.length,
          questionsInDefinitionNotInData:
            bundle.coverage.questionsInDefinitionNotInData,
        });
        if (!preflight.ready) {
          const failed = preflight.checks.filter((c) => !c.ok);
          push({
            type: "error",
            error: `Explore pre-flight failed: ${failed.map((c) => c.detail ?? c.label).join("; ")}`,
          });
          controller.close();
          return;
        }

        await prepareForExecution(id);
        const paths = getProjectPaths(id);
        log("Synced project files for workers", "info");

        const seedIndex = bundle.config.exploreSeedRowIndex ?? 0;
        const rowCount = bundle.config.exploreRowCount ?? 1;
        const datasetRows: Array<{ index: number; row: (typeof bundle.data)[0] }> =
          [];
        for (let i = 0; i < rowCount && seedIndex + i < bundle.data.length; i++) {
          datasetRows.push({
            index: seedIndex + i,
            row: bundle.data[seedIndex + i],
          });
        }
        if (datasetRows.length === 0) {
          push({
            type: "error",
            error: `Explore seed row ${seedIndex} is out of range (${bundle.data.length} row(s) in dataset)`,
          });
          controller.close();
          return;
        }
        if (rowCount > datasetRows.length) {
          log(
            `Only ${datasetRows.length} row(s) available from seed ${seedIndex} — configured ${rowCount}`,
            "warn",
          );
        }
        log(
          `Guided explore: ${datasetRows.length} pass(es) starting at row ${seedIndex} of ${bundle.data.length}`,
          "info",
        );

        ensurePlaywrightBrowsersEnv();
        const runner = new NvExploreRunner();
        const session = startExploreSession(id);
        const runId = randomUUID().slice(0, 8);
        log("Launching headless browser…");

        const result = await runner.run({
          config: bundle.config,
          definition: bundle.definition,
          outputDir: paths.exploreCache,
          datasetRows,
          runId,
          headless: true,
          exploreEndQuestions: bundle.config.exploreEndQuestions,
          coverageGaps: bundle.coverage.questionsInDataNotInDefinition,
          signal: session.signal,
          log: (message) => log(message),
        });

        log("Saving Definition.json…");
        await saveProjectDefinition(id, result.definition);

        const exploreRun = await recordExploreRun(id, {
          id: runId,
          status: result.status,
          added: result.added,
          updated: result.updated,
          conflicts: result.conflicts,
          discovered: result.discovered,
          blockers: result.blockers,
          mergeIssues: result.mergeIssues,
          steps: result.steps,
          rowsWalked: result.rowsWalked,
          discoveredNames: result.discoveredNames,
          trailCsv: result.trailCsv,
          trailJson: result.trailJson,
        });

        await prepareForExecution(id);

        log(
          `Finished — ${result.discovered} question(s), +${result.added.length} new, ${result.rowsWalked} row pass(es), trail: explore-cache/${result.trailCsv}`,
          result.status === "completed" ? "success" : "warn",
        );

        push({
          type: "done",
          discovered: result.discovered,
          added: result.added,
          updated: result.updated,
          conflicts: result.conflicts,
          status: result.status,
          blockers: result.blockers,
          steps: result.steps,
          discoveredNames: result.discoveredNames,
          exploreRun,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Explore failed";
        log(message, "error");
        push({ type: "error", error: message });
      } finally {
        endExploreSession(id);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
