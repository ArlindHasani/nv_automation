import fs from "node:fs/promises";
import {
  DefinitionSchema,
  fillDefinitionGapsFromData,
  getProjectPaths,
  InterviewDataSchema,
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

  const result = fillDefinitionGapsFromData(definition, data);
  await fs.writeFile(
    paths.definitionJson,
    JSON.stringify(result.definition, null, 2),
  );

  console.log(`Added ${result.added.length} questions:`, result.added.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
