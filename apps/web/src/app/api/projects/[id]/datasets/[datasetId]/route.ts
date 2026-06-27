import { NextResponse } from "next/server";
import { loadDatasetPreview, removeDataset } from "@/lib/projects";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; datasetId: string }> },
) {
  const { id, datasetId } = await params;
  try {
    const preview = await loadDatasetPreview(id, datasetId);
    return NextResponse.json(preview);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load dataset" },
      { status: 404 },
    );
  }
}

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
