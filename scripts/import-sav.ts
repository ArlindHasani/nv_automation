import { importSavFile } from "@nv/core";

async function main() {
  const projectId = process.argv[2] ?? "ACTIVE";
  const savPath = process.argv[3];
  if (!savPath) {
    console.error("Usage: npm run import-sav -- <projectId> <path.sav>");
    process.exit(1);
  }
  const result = await importSavFile(projectId, savPath);
  console.log(`Imported ${result.rowCount} rows to projects/${projectId}/Data.json`);
  console.log("Coverage:", JSON.stringify(result.coverage, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
