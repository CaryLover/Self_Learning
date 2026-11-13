import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "report-export-"));
const outfile = join(dir, "reportExport.mjs");
try {
  const bundle = await build({ entryPoints: ["src/lib/reportExport.ts"], bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { buildReportDocument, printReport } = await import(pathToFileURL(outfile).href);

  const report = {
    generatedAt: new Date(2026, 10, 13, 12).getTime(),
    knowledge: [
      { name: "受力分析<script>", score: 88.8, status: "<已掌握>", advice: "继续练习 & 复习" },
      { name: "公式", score: 59.4, status: "未掌握", advice: "" },
    ],
  };
  const html = buildReportDocument(report, { nickname: "<小明>", gradeLabel: "初中", topic: "斜面 & 受力" });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /2026-11-13/);
  assert.match(html, /孩子：&lt;小明&gt;/);
  assert.match(html, /学段：初中/);
  assert.match(html, /主题：斜面 &amp; 受力/);
  assert.match(html, /受力分析&lt;script&gt;/);
  assert.match(html, /状态：&lt;已掌握&gt;/);
  assert.match(html, /继续练习 &amp; 复习/);
  assert.match(html, /89 分/);
  assert.match(html, /59 分/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /https?:\/\//);

  const unnamed = buildReportDocument(report);
  assert.doesNotMatch(unnamed, /孩子：/);
  assert.doesNotMatch(unnamed, /主题：/);
  assert.equal(printReport(report), false);
  console.log("report export checks passed");
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
