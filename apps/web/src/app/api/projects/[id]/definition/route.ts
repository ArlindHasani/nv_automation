import { NextResponse } from "next/server";
import { patchDefinitionQuestions } from "@nv/core";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const updates = body.updates as Array<{
      Name: string;
      FixedAnswer?: string | null;
      ExploreOverride?: string | null;
      Method?: "Maintain" | "Split";
      Split?: Record<string, number>;
    }>;
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates array required" },
        { status: 400 },
      );
    }
    const definition = await patchDefinitionQuestions(id, updates);
    return NextResponse.json({ definition });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed" },
      { status: 400 },
    );
  }
}
