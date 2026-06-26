import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getProjectPaths } from "@nv/core";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  const { id, runId } = await params;
  const safeId = runId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const csvPath = path.join(
    getProjectPaths(id).exploreCache,
    `explore-trail-${safeId}.csv`,
  );

  try {
    const csv = await fs.readFile(csvPath, "utf-8");
    const normalized = csv.replace(/\u2192/g, "=");
    return new NextResponse(normalized.startsWith("\uFEFF") ? normalized : `\uFEFF${normalized}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="explore-trail-${safeId}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Trail not found" }, { status: 404 });
  }
}
