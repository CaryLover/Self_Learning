import { spawnSync } from "node:child_process";

const checks = [
  "eli5Pipeline.test.mjs",
  "eli5View.test.mjs",
  "sessionData.test.mjs",
  "socraticReport.test.mjs",
  "apiRequests.test.mjs",
  "reportExport.test.mjs",
  "markdown.test.mjs",
  "proxySettings.test.mjs",
  "gradePrompt.test.mjs",
  "physicsModel.test.mjs",
  "physicsEli5.test.mjs",
  "physicsWorkerClient.test.mjs",
  "circuitModel.test.mjs",
  "circuitProbe.mjs",
  "fusionRouting.test.mjs",
  "personBoard.test.mjs",
  "publicAssets.test.mjs",
  "compilerAsset.test.mjs",
  "physicsPreviewBuild.test.mjs",
];

for (const file of checks) {
  console.log(`\n检查 ${file}`);
  const result = spawnSync(process.execPath, [`tests/${file}`], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log("\n检查 TypeScript 类型");
const types = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"], { stdio: "inherit" });
if (types.status !== 0) process.exit(types.status || 1);
console.log("\n所有开发检查通过");
