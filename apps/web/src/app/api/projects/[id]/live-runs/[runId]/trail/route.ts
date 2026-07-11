import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getProjectPaths, listLiveRuns } from "@nv/core";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const { id, runId } = await params;
  const kind = new URL(req.url).searchParams.get("kind") ?? "csv";
  const runs = await listLiveRuns(id, 50);
  const run = runs.find((r) => r.id === runId);
  if (!run) {
    return NextResponse.json({ error: "Live run not found" }, { status: 404 });
  }

  const paths = getProjectPaths(id);
  const dir = path.join(paths.runCache, runId);

  let fileName: string | undefined;
  let contentType = "text/plain; charset=utf-8";
  if (kind === "csv") {
    fileName = run.trailCsv;
    contentType = "text/csv; charset=utf-8";
  } else if (kind === "wide") {
    fileName = run.trailWideCsv;
    contentType = "text/csv; charset=utf-8";
  } else if (kind === "json") {
    fileName = run.trailJson;
    contentType = "application/json; charset=utf-8";
  } else if (kind === "log") {
    fileName = run.logFile;
  }

  if (!fileName) {
    return NextResponse.json({ error: "Artifact not available" }, { status: 404 });
  }

  try {
    const body = await fs.readFile(path.join(dir, fileName));
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }
}
