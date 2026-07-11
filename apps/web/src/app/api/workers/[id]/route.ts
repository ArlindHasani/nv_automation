import { NextResponse } from "next/server";
import { getWorkerManager } from "@/lib/workers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const worker = getWorkerManager().get(id);
  if (!worker) {
    return NextResponse.json({ error: "Worker not found" }, { status: 404 });
  }
  return NextResponse.json(worker);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stopped = await getWorkerManager().stop(id);
  return NextResponse.json({ stopped });
}
