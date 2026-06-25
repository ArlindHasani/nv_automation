import fs from "node:fs/promises";
import {
  buildCoverageReport,
  DefinitionSchema,
  fillDefinitionGapsFromData,
  getProjectPaths,
  InterviewDataSchema,
  ProjectConfigSchema,
  resolveAnswerForQuestion,
} from "@nv/core";

async function main() {
  const projectId = process.argv[2] ?? "ACTIVE";
  const paths = getProjectPaths(projectId);

  const definition = DefinitionSchema.parse(
    JSON.parse(await fs.readFile(paths.definitionJson, "utf-8")),
  );
  const data = InterviewDataSchema.parse(
    JSON.parse(await fs.readFile(paths.dataJson, "utf-8")),
  );
  const project = ProjectConfigSchema.parse(
    JSON.parse(await fs.readFile(paths.projectJson, "utf-8")),
  );

  const gaps = fillDefinitionGapsFromData(definition, data);
  if (gaps.added.length > 0) {
    await fs.writeFile(
      paths.definitionJson,
      JSON.stringify(gaps.definition, null, 2),
    );
    console.log("Fixed gaps, added:", gaps.added.join(", "));
  }

  const finalDef = gaps.added.length ? gaps.definition : definition;
  const coverage = buildCoverageReport(data, finalDef, project.savFieldMap);

  console.log("\n=== Parity Report ===");
  console.log("Questions in definition:", finalDef.Questions.length);
  console.log("Data rows:", data.length);
  console.log(
    "Missing in definition:",
    coverage.questionsInDataNotInDefinition.length
      ? coverage.questionsInDataNotInDefinition.join(", ")
      : "none",
  );

  const row = data[0];
  if (row) {
    console.log("\n=== Sample Maintain resolutions (row 0) ===");
    for (const q of finalDef.Questions.slice(0, 10)) {
      const resolved = resolveAnswerForQuestion(finalDef, q.Name, row);
      console.log(
        `${q.Name}: ${resolved.codes.join(",") || (resolved.openText ?? "")} [${resolved.source}]`,
      );
    }
  }

  console.log("\nParity check complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
