import { NextResponse } from "next/server";
import { getWorkerManager } from "@/lib/workers";

export async function GET() {
  return NextResponse.json(getWorkerManager().list());
}

export async function POST(req: Request) {
  const body = await req.json();
  const { projectId, rowIndices, headed } = body as {
    projectId: string;
    rowIndices: number[];
    headed?: boolean;
  };

  if (!projectId || !Array.isArray(rowIndices)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const manager = getWorkerManager();
  const started = await Promise.all(
    rowIndices.map((rowIndex) =>
      manager.startInterview(projectId, rowIndex, headed ?? false),
    ),
  );

  return NextResponse.json({ workers: started });
}
