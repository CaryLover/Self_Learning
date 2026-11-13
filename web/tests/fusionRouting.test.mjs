import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "fusion-routing-"));
const outfile = join(dir, "routing.mjs");
const server = spawn(process.execPath, ["../dev/mock-vendor.mjs"], { cwd: process.cwd(), env: { ...process.env, PORT: "0", MOCK_DELAY_MS: "0" }, stdio: ["ignore", "pipe", "pipe"] });
try {
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("模拟接口启动超时")), 15000);
    server.once("error", error => { clearTimeout(timer); reject(error); });
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`模拟接口提前退出：${code}`)); });
    server.stdout.once("data", data => {
      clearTimeout(timer);
      const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0]); else reject(new Error("未能读取模拟接口地址"));
    });
  });
  const bundle = await build({ stdin: { contents: `export * from './src/lib/physics/pipeline.ts'; export * from './src/lib/physics/eli5Explain.ts'; export * from './src/lib/eli5Pipeline.ts'; export * from './src/lib/api.ts';`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { preparePhysicsLesson, addEli5PhysicsExplanation, runEli5Pipeline, chatRequest } = await import(pathToFileURL(outfile).href);
  const signal = new AbortController().signal;
  const call = (messages, signal) => chatRequest({ endpoint: `${address}/v1/chat/completions`, proxyUrl: address, apiKey: "mock-key-test-12345", model: "mock-vl-mini", messages, stream: false, signal });
  const forces = [{ role: 'weight', direction: [0, -1] }, { role: 'normal', direction: [-0.5, Math.cos(Math.PI / 6)] }];
  let renders = 0;
  const render = async model => { renders++; return { model, assumptions: [], svg: '<svg><circle cx="4" cy="4" r="2"/></svg>', result: { status: 'solved', model: 'single-contact-body', normal: 4 * 9.81 * Math.cos(Math.PI / 6), acceleration: 9.81 * Math.sin(Math.PI / 6), forces } }; };
  const options = { hasImages: false, allowNotApplicable: true, grade: 'senior', signal, call, render };

  const math = await preparePhysicsLesson({ ...options, topic: '为什么先乘除后加减？' });
  assert.equal(math.status, 'not_applicable');
  let state;
  await runEli5Pipeline({ grade: 'senior', topic: '为什么先乘除后加减？', images: [], ctx: {}, signal, call, update: next => { state = next; } });
  assert.equal(state.stage, 'done');
  assert.equal(renders, 0);

  const heat = await preparePhysicsLesson({ ...options, topic: '请解释热传导' });
  assert.equal(heat.status, 'unsupported');
  await runEli5Pipeline({ grade: 'senior', topic: '请解释热传导', images: [], textOnly: true, ctx: {}, signal, call, update: next => { state = next; } });
  assert.equal(state.stage, 'done');
  assert.match(state.html, /热传导/);
  assert.doesNotMatch(state.html, /<svg|<img|<canvas/i);
  assert.equal(renders, 0);

  const ambiguous = await preparePhysicsLesson({ ...options, topic: '一个物块沿斜面下滑，求它受到的力。' });
  assert.equal(ambiguous.status, 'needs_review');
  assert.equal(renders, 0);

  const topic = '质量4 kg的物块在30°固定光滑斜面上，只受重力和支持力。重力加速度9.81 m/s²。';
  const candidate = await preparePhysicsLesson({ ...options, topic });
  assert.equal(candidate.status, 'candidate');
  const lesson = await addEli5PhysicsExplanation({ candidate, topic, grade: 'senior', ctx: {}, signal, call });
  assert.equal(renders, 1);
  assert.match(lesson.html, /<svg/);
  assert.match(lesson.html, /一起读懂这幅图/);
  assert.match(lesson.html, /33\.98 N/);
  const summary = await (await fetch(`${address}/__last-prompt`)).json();
  const kinds = summary.recentRequests.map(request => request.kind);
  assert.deepEqual(kinds, ['physics-extraction', 'eli5', 'practice', 'physics-extraction', 'eli5-text', 'practice', 'physics-extraction', 'physics-extraction', 'physics-eli5']);
  assert.ok(summary.recentRequests.every(request => request.viaProxy));
  for (const topic of ['解释植物的光合作用', '用图说明诗歌比喻', '解释二次函数的图像']) {
    const routed = await preparePhysicsLesson({ ...options, topic });
    assert.equal(routed.status, 'not_applicable');
    await runEli5Pipeline({ grade: 'senior', topic, images: [], ctx: {}, signal, call, update: next => { state = next; } });
    assert.equal(state.stage, 'done');
  }
  assert.equal(renders, 1);
  const crossSubject = await (await fetch(`${address}/__last-prompt`)).json();
  assert.deepEqual(crossSubject.recentRequests.slice(-9).map(request => request.kind), ['physics-extraction', 'eli5', 'practice', 'physics-extraction', 'eli5', 'practice', 'physics-extraction', 'eli5', 'practice']);
  console.log('fusion routing checks passed (mock model)');
} finally {
  server.kill();
  server.stdout.destroy();
  server.stderr.destroy();
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
