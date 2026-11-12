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
  const { checkEli5Html, runEli5Pipeline, runEli5Practice } = await import(pathToFileURL(outfile).href);
  const valid = '<!DOCTYPE html><html><head></head><body><p>这是一幅图</p><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg></body></html>';
  assert.equal(checkEli5Html(valid), null);
  assert.equal(checkEli5Html(valid.replace('<svg ', '<svg style="fill:url(#gradient)" ')), null);
  assert.ok(checkEli5Html('<html><body>片段</body></html>'));
  assert.ok(checkEli5Html('<!DOCTYPE html><html><head></head><body><svg></svg></body></html>'));
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
  const picture = 'data:image/png;base64,dGVzdA==';
  const messages = [];
  const pictureStates = [];
  await runEli5Pipeline({ grade: 'junior', topic: '请解释图中过程', images: [picture], ctx: {}, signal: new AbortController().signal, call: async items => { messages.push(items); return messages.length === 1 ? valid : exercise; }, update: state => pictureStates.push(state) });
  assert.equal(pictureStates.at(-1).stage, 'done');
  assert.ok(!messages[0][0].content.includes('请解释图中过程'));
  for (const call of messages) {
    const user = call.find(message => message.role === 'user');
    assert.ok(Array.isArray(user.content));
    assert.equal(user.content.filter(part => part.type === 'image_url').length, 1);
    assert.equal(user.content.find(part => part.type === 'image_url').image_url.url, picture);
    assert.ok(user.content.find(part => part.type === 'text').text.includes('请解释图中过程'));
  }
  const clarificationHtml = valid.replace('<head></head>', `<head><meta content='needs-clarification' name='eli5-input-status'></head>`).replace('这是一幅图', '图片中的数字看不清，请补充数字。');
  const clarificationStates = [];
  let clarificationCalls = 0;
  await runEli5Pipeline({ grade: 'junior', topic: '请解释图片', images: [picture], ctx: {}, signal: new AbortController().signal, call: async () => { clarificationCalls++; return clarificationHtml; }, update: state => clarificationStates.push(state) });
  assert.equal(clarificationCalls, 1);
  assert.equal(clarificationStates.at(-1).stage, 'clarification');
  assert.equal(clarificationStates.at(-1).html, clarificationHtml);
  assert.equal(clarificationStates.at(-1).practices, undefined);
  const partialStates = [];
  let partialCalls = 0;
  await runEli5Pipeline({ grade: 'senior', topic: '化学反应', images: [], ctx: {}, signal: new AbortController().signal, call: async () => { if (++partialCalls === 1) return valid; throw new Error('连接失败'); }, update: state => partialStates.push(state) });
  assert.equal(partialStates.at(-1).stage, 'error');
  assert.equal(partialStates.at(-1).html, valid);
  assert.match(partialStates.at(-1).error, /讲解已生成.*练习生成失败.*连接失败/);
  assert.equal(partialStates.at(-1).retryPractice, true);
  const retryStates = [];
  let retryCalls = 0;
  await runEli5Practice({ grade: 'senior', topic: '化学反应', images: [picture], ctx: {}, signal: new AbortController().signal, initial: partialStates.at(-1), call: async items => { retryCalls++; assert.equal(items[1].content[1].image_url.url, picture); return exercise; }, update: state => retryStates.push(state) });
  assert.equal(retryCalls, 1);
  assert.equal(retryStates.at(-1).stage, 'done');
  assert.equal(retryStates.at(-1).html, valid);
  assert.equal(retryStates.at(-1).retryPractice, false);
  assert.equal(retryStates.at(-1).practices.length, 3);
  for (const [grade, topic] of [['primary', '植物怎样长大'], ['junior', '为什么会有四季'], ['senior', '电路中的电流']]) {
    const seen = [];
    const outputs = [];
    await runEli5Pipeline({ grade, topic, images: [], ctx: {}, signal: new AbortController().signal, call: async items => { seen.push(items); return seen.length === 1 ? valid : exercise; }, update: state => outputs.push(state) });
    assert.equal(outputs.at(-1).stage, 'done');
    assert.ok(seen[0].find(message => message.role === 'user').content.includes(topic));
    assert.ok(seen[1].find(message => message.role === 'user').content.includes(topic));
  }
  const mismatchMessages = [];
  await runEli5Pipeline({ grade: 'junior', topic: '二次函数', images: [], ctx: { gradeLevel: '高三' }, signal: new AbortController().signal, call: async items => { mismatchMessages.push(items); return mismatchMessages.length === 1 ? valid : exercise; }, update() {} });
  assert.doesNotMatch(mismatchMessages[0][0].content, /高三（初中）/);
  assert.match(mismatchMessages[0][0].content, /二次函数属于义务教育内容/);
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
