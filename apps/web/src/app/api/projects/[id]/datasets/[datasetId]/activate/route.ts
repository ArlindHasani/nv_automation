import { NextResponse } from "next/server";
import { activateDataset } from "@/lib/projects";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; datasetId: string }> },
) {
  const { id, datasetId } = await params;
  const ok = await activateDataset(id, datasetId);
  if (!ok) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }
  return NextResponse.json({ active: datasetId });
}
