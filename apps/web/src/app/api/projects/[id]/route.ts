import { NextResponse } from "next/server";
import { loadProject, removeProject, updateProjectSettings } from "@/lib/projects";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const updated = await updateProjectSettings(id, {
      name: body.name,
      liveLink: body.liveLink,
      testLink: body.testLink,
      mode: body.mode,
      loiTargetMinutes: body.loiTargetMinutes,
      loiJitterPercent: body.loiJitterPercent,
      savFieldMap: body.savFieldMap,
      exploreSeedRowIndex: body.exploreSeedRowIndex,
      exploreRowCount: body.exploreRowCount,
      exploreEndQuestions: body.exploreEndQuestions,
      nvProjectId: body.nvProjectId,
      nvGroup: body.nvGroup,
      questField: body.questField,
      workerProfiles: body.workerProfiles,
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await removeProject(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: id });
}
