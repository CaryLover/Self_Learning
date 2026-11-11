import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "eli5-test-"));
try {
  const outfile = join(dir, "pipeline.mjs");
  const bundled = await build({ entryPoints: ["src/lib/eli5Pipeline.ts"], bundle: true, platform: "node", format: "esm", write: false, outfile, loader: { ".css": "empty" } });
  await writeFile(outfile, bundled.outputFiles[0].contents);
  const { checkEli5Html, runEli5Pipeline } = await import(pathToFileURL(outfile).href);
  const valid = '<!DOCTYPE html><html><head></head><body><svg viewBox="0 0 10 10"></svg></body></html>';
  assert.equal(checkEli5Html(valid), null);
  assert.equal(checkEli5Html(valid.replace('<svg ', '<svg style="fill:url(#gradient)" ')), null);
  assert.ok(checkEli5Html('<html><body>片段</body></html>'));
  assert.ok(checkEli5Html(valid.replace('</body>', '<script>alert(1)</script></body>')));
  assert.ok(checkEli5Html(valid.replace('</body>', '<img src="https://example.com/a.png"></body>')));
  const exercise = JSON.stringify(Array.from({ length: 3 }, (_, i) => ({ question: `问题${i}`, difficulty: '持平', answer: '答案', analysis: '解析' })));
  const replies = ['bad', valid, 'bad json', exercise];
  const states = [];
  await runEli5Pipeline({ grade: 'junior', topic: '数学', images: [], ctx: {}, signal: new AbortController().signal, call: async () => replies.shift(), update: state => states.push(state) });
  assert.equal(states[0].stage, 'practicing');
  assert.equal(states[1].stage, 'done');
  assert.equal(states[1].practices.length, 3);
  assert.equal(replies.length, 0);
  const invalidStates = [];
  await runEli5Pipeline({ grade: 'junior', topic: '数学', images: [], ctx: {}, signal: new AbortController().signal, call: async () => 'bad', update: state => invalidStates.push(state) });
  assert.equal(invalidStates[0].stage, 'error');
  assert.equal(invalidStates[0].html, undefined);
  const controller = new AbortController();
  const cancelledStates = [];
  await assert.rejects(runEli5Pipeline({ grade: 'junior', topic: '数学', images: [], ctx: {}, signal: controller.signal, call: async () => { controller.abort(); return valid; }, update: state => cancelledStates.push(state) }));
  assert.equal(cancelledStates.length, 0);
  process.stdout.write('ELI5 pipeline checks passed\n');
} finally {
  await unlink(join(dir, "pipeline.mjs")).catch(() => {});
  await rmdir(dir);
}
