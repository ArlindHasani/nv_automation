import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { buildCoverageReport } from "./mapping.js";
import type { SavVariablesMeta } from "./mapping.js";
import { getProjectPaths, getRepoRoot } from "./paths.js";
import {
  DefinitionSchema,
  type InterviewData,
  InterviewDataSchema,
  ProjectConfigSchema,
  type SavFieldMap,
} from "./schemas.js";

export interface SavImportBundle {
  rows: InterviewData;
  variables: SavVariablesMeta;
}

export async function parseSavBundle(savPath: string): Promise<SavImportBundle> {
  const pythonScript = path.join(getRepoRoot(), "tools", "import_sav.py");

  const jsonStr = await new Promise<string>((resolve, reject) => {
    const proc = spawn("python", [pythonScript, savPath], {
      cwd: getRepoRoot(),
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `Python exited ${code}`));
      else resolve(stdout);
    });
  });

  const parsed = JSON.parse(jsonStr) as
    | SavImportBundle
    | InterviewData;

  if (Array.isArray(parsed)) {
    return {
      rows: InterviewDataSchema.parse(parsed),
      variables: {},
    };
  }

  return {
    rows: InterviewDataSchema.parse(parsed.rows),
    variables: (parsed.variables ?? {}) as SavVariablesMeta,
  };
}

export async function parseSavFile(savPath: string): Promise<InterviewData> {
  const bundle = await parseSavBundle(savPath);
  return bundle.rows;
}

/** @deprecated Prefer project-store importDataset (multi-dataset flow) */
export async function importSavFile(
  projectId: string,
  savPath: string,
): Promise<{ rowCount: number; coverage: ReturnType<typeof buildCoverageReport> }> {
  const paths = getProjectPaths(projectId);
  const bundle = await parseSavBundle(savPath);
  await fs.writeFile(paths.dataJson, JSON.stringify(bundle.rows, null, 2));

  const projectRaw = JSON.parse(await fs.readFile(paths.projectJson, "utf-8"));
  const project = ProjectConfigSchema.parse(projectRaw);
  const defRaw = JSON.parse(await fs.readFile(paths.definitionJson, "utf-8"));
  const definition = DefinitionSchema.parse(defRaw);

  const coverage = buildCoverageReport(
    bundle.rows,
    definition,
    project.savFieldMap,
  );

  return { rowCount: bundle.rows.length, coverage };
}

export function coverageForRows(
  rows: InterviewData,
  definition: ReturnType<typeof DefinitionSchema.parse>,
  savFieldMap: SavFieldMap,
) {
  return buildCoverageReport(rows, definition, savFieldMap);
}
