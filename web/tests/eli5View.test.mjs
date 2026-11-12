import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "eli5-view-"));
const outfile = join(dir, "view.cjs");
try {
  const bundle = await build({ stdin: { contents: `export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'; export { Eli5View } from './src/components/Eli5View.tsx';`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, platform: "node", format: "cjs", write: false, outfile, loader: { ".css": "empty" } });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { createElement, renderToStaticMarkup, Eli5View } = (await import(pathToFileURL(outfile).href)).default;
  const html = '<!DOCTYPE html><html><body><p>已生成的讲解</p></body></html>';
  const render = (eli5, busy = false) => renderToStaticMarkup(createElement(Eli5View, { eli5, busy, onRetryPractice() {} }));
  const failed = render({ stage: 'error', html, retryPractice: true, error: '练习生成失败' });
  assert.match(failed, /重新生成练习/);
  assert.match(failed, /练习生成失败/);
  assert.match(failed, /已生成的讲解/);
  assert.match(failed, /sandbox=""/);
  assert.match(render({ stage: 'error', html, retryPractice: true, error: '失败' }, true), /disabled=""/);
  assert.doesNotMatch(render({ stage: 'error', error: '讲解失败' }), /重新生成练习/);
  assert.match(render({ stage: 'clarification', html }), /请根据讲解中的提示补充信息/);
  assert.doesNotMatch(render({ stage: 'clarification', html }), /巩固练习/);
  console.log('ELI5 view checks passed');
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
