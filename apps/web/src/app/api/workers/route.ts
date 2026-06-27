import { NextResponse } from "next/server";
import {
  applyManualAssignments,
  clearManualAssignments,
} from "@nv/core";
import { getWorkerManager } from "@/lib/workers";

export async function GET() {
  return NextResponse.json(getWorkerManager().list());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { projectId, workerProfileIds, headed, assignmentMode, assignments } =
      body as {
        projectId: string;
        workerProfileIds: string[];
        headed?: boolean;
        assignmentMode?: "auto" | "manual";
        assignments?: Record<string, number[]>;
      };

    if (!projectId || !Array.isArray(workerProfileIds)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (assignmentMode === "manual") {
      if (!assignments || Object.keys(assignments).length === 0) {
        return NextResponse.json(
          { error: "Manual mode requires row assignments" },
          { status: 400 },
        );
      }
      await applyManualAssignments(projectId, assignments);
    } else {
      await clearManualAssignments(projectId);
    }

    const manager = getWorkerManager();
    const started = [];
    for (const profileId of workerProfileIds) {
      started.push(
        await manager.startLiveWorker(projectId, profileId, headed ?? false),
      );
    }

    return NextResponse.json({ workers: started });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start workers" },
      { status: 400 },
    );
  }
}
