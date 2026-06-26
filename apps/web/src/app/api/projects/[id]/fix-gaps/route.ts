import { NextResponse } from "next/server";
import { fixDefinitionGaps, loadProject } from "@/lib/projects";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await fixDefinitionGaps(id);
    const bundle = await loadProject(id);
    return NextResponse.json({
      added: result.added,
      updated: result.updated,
      coverage: bundle?.coverage,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fix gaps failed" },
      { status: 500 },
    );
  }
}
