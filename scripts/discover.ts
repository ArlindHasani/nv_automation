import path from "node:path";
import { getProjectPaths } from "@nv/core";
import { runDiscovery } from "@nv/playwright";

async function main() {
  const projectId = process.argv[2] ?? "ACTIVE";
  const url = process.argv[3];
  const paths = getProjectPaths(projectId);

  const targetUrl =
    url ||
    process.env.NV_DISCOVER_URL ||
    "https://nv25.ffind.com/nv_rev2/login.php";

  const result = await runDiscovery({
    url: targetUrl,
    outputDir: path.join(paths.exploreCache, "discovery"),
    headless: !process.argv.includes("--headed"),
    maxQuestions: 10,
  });

  console.log("Discovery complete:", JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
