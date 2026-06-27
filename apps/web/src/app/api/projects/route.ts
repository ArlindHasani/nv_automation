import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createNewProject, listProjectSummaries } from "@/lib/projects";

function formatApiError(e: unknown): string {
  if (e instanceof ZodError) {
    return e.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      })
      .join("; ");
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

export async function GET() {
  const projects = await listProjectSummaries();
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const project = await createNewProject({
      name: body.name,
      slug: body.slug,
      nvLoginUrl: body.nvLoginUrl,
      liveLink: body.liveLink,
      testLink: body.testLink,
      mode: "Freestyle",
      loiTargetMinutes: body.loiTargetMinutes,
      loiJitterPercent: body.loiJitterPercent,
    });
    return NextResponse.json(project);
  } catch (e) {
    return NextResponse.json(
      { error: formatApiError(e) },
      { status: 400 },
    );
  }
}
