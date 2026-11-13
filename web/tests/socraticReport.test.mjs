import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "socratic-report-"));
const outfile = join(dir, "report.mjs");
try {
  const bundle = await build({ entryPoints: ["src/lib/socraticReport.ts"], bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { enforceReportPolicy } = await import(pathToFileURL(outfile).href);

  const report = {
    generatedAt: 123,
    knowledge: [
      { name: "受力分析", score: 80, status: "掌握", advice: "继续练习" },
      { name: "公式", score: 7.6, status: "未作答，无法评定：没有作答证据", advice: "" },
      { name: "单位", score: -5, status: "", advice: "复习" },
    ],
  };
  const zero = enforceReportPolicy(report, 0);
  assert.equal(zero.knowledge[0].score, 10);
  assert.equal(zero.knowledge[0].status, "未作答，无法评定");
  assert.equal(zero.knowledge[0].advice, "继续练习");
  assert.equal(zero.knowledge[1].score, 8);
  assert.equal(zero.knowledge[1].status, "未作答，无法评定：没有作答证据");
  assert.equal(zero.knowledge[2].score, 0);
  assert.equal(zero.knowledge[2].status, "未作答，无法评定");
  assert.equal(zero.generatedAt, 123);

  const answered = enforceReportPolicy(report, 2);
  assert.deepEqual(answered, report);
  console.log("Socratic report policy checks passed");
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
