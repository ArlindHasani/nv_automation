import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { importSavToProject } from "@/lib/projects";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  const name = (form.get("name") as string) || `import-${Date.now()}`;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const tmp = path.join(os.tmpdir(), `nv-import-${Date.now()}.sav`);
  await fs.writeFile(tmp, Buffer.from(await file.arrayBuffer()));

  try {
    const result = await importSavToProject(id, name, tmp);
    return NextResponse.json({
      dataset: result.dataset,
      coverage: result.coverage,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed" },
      { status: 500 },
    );
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}
