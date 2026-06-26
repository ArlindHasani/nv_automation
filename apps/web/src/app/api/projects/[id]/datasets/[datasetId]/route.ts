import { NextResponse } from "next/server";
import { removeDataset } from "@/lib/projects";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; datasetId: string }> },
) {
  const { id, datasetId } = await params;
  const ok = await removeDataset(id, datasetId);
  if (!ok) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: datasetId });
}
