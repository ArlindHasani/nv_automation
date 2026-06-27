import { NextResponse } from "next/server";
import {
  getInterviewQueueSummary,
  initInterviewQueue,
  loadActiveData,
  resetInterviewQueueRows,
  setInterviewQueueRowStatus,
} from "@nv/core";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = await loadActiveData(id);
    await initInterviewQueue(id, data.length, false);
    const summary = await getInterviewQueueSummary(id);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load queue" },
      { status: 400 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const statuses = body.statuses as
      | Array<"failed" | "in_progress" | "pending" | "completed" | "skipped">
      | undefined;
    const resetCount = await resetInterviewQueueRows(
      id,
      statuses ?? ["failed", "in_progress"],
    );
    const summary = await getInterviewQueueSummary(id);
    return NextResponse.json({ resetCount, summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to reset queue" },
      { status: 400 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const indices = body.indices as number[] | undefined;
    const action = body.action as "skip" | "unskip" | undefined;

    if (!Array.isArray(indices) || indices.length === 0 || !action) {
      return NextResponse.json(
        { error: "indices and action (skip|unskip) are required" },
        { status: 400 },
      );
    }

    const updatedCount = await setInterviewQueueRowStatus(
      id,
      indices,
      action === "skip" ? "skipped" : "pending",
      action === "skip"
        ? ["pending", "failed"]
        : ["skipped"],
    );
    const summary = await getInterviewQueueSummary(id);
    return NextResponse.json({ updatedCount, summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update queue" },
      { status: 400 },
    );
  }
}
