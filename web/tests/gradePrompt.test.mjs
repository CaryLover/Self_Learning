import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "grade-prompt-"));
const outfile = join(dir, "prompts.mjs");
try {
  const bundle = await build({ stdin: { contents: `export * from './src/lib/grade.ts'; export * from './src/prompts/socratic.ts';`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { curriculumRule, buildSocraticSystem } = await import(pathToFileURL(outfile).href);
  assert.match(curriculumRule('junior', '初三'), /二次函数属于义务教育内容/);
  assert.doesNotMatch(curriculumRule('junior', '初三'), /不得使用高中内容：二次函数/);
  assert.doesNotMatch(curriculumRule('junior', '高三'), /高三/);
  assert.match(curriculumRule('primary'), /学生当前年级：小学（小学）/);
  const socratic = buildSocraticSystem('primary', { gradeLevel: '三年级' });
  assert.match(socratic, /永远不能直接给出孩子当前题目或问题的最终答案/);
  assert.match(socratic, /@@SKILLMAP@@/);
  assert.match(socratic, /@@REPORT@@/);
  console.log('grade and Socratic prompt checks passed');
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
