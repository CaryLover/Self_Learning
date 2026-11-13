import { readFile } from 'node:fs/promises';
import { $typst, TypstSnippet } from '@myriaddreamin/typst.ts/contrib/snippet';
import { MemoryAccessModel } from '@myriaddreamin/typst.ts/fs/memory';
import { FetchPackageRegistry } from '@myriaddreamin/typst.ts/fs/package';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';

let compilerBytes;
if (process.env.PHYSICS_COMPRESSED_PROBE === '1') {
  const compressed = await readFile(process.env.PHYSICS_COMPRESSED_PATH || '../dev/probe-build-compressed/physics-runtime/typst-compiler.gz.bin');
  compilerBytes = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  assert.equal(createHash('sha256').update(new Uint8Array(compilerBytes)).digest('hex'), '1fc968438a672366dfec39c96c842c26ed29caff4eb1bcaab19a6c60867de5fd');
} else {
  compilerBytes = await readFile('node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm');
}
const compiler = await WebAssembly.compile(compilerBytes);
$typst.setCompilerInitOptions({ getModule: () => compiler });
const archives = new Map();
archives.set('typed-physics-0.3.0', new Uint8Array(await readFile('public/physics-packages/typed-physics-0.3.0.bin')));
const memory = new MemoryAccessModel();
class LocalRegistry extends FetchPackageRegistry {
  pullPackageData(spec) { return archives.get(`${spec.name}-${spec.version}`); }
}
$typst.use(TypstSnippet.withAccessModel(memory), TypstSnippet.withPackageRegistry(new LocalRegistry(memory)));
const js = await build({
  stdin: {
    contents: `export * from './src/lib/physics/typedSource.ts'; export * from './src/lib/physics/composeLesson.ts'; export * from './src/lib/physics/extraction.ts'; export * from './src/lib/physics/pipeline.ts'; export * from './src/lib/physics/hanging.ts'; export * from './src/lib/physics/eli5Explain.ts'; export * from './src/lib/physics/practice.ts'; export * from './src/lib/physics/diagram.ts';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const {
  makeInclineSource, verifyInclineResult, composeInclineLesson, parsePhysicsExtraction,
  preparePhysicsLesson, makeHangingSource, verifyHangingResult, addEli5PhysicsExplanation,
  restorePhysicsCandidate, composeHangingLesson, buildHangingPractices, inclineDiagram, hangingDiagram,
} = await import(`data:text/javascript;base64,${Buffer.from(js.outputFiles[0].contents).toString('base64')}`);

const cc = await $typst.getCompiler();
async function query(source) {
  cc.addSource('/probe.typ', source);
  return cc.runWithWorld({ mainFilePath: '/probe.typ' }, async world => {
    await world.compile();
    return world.query({ selector: '<physics-result>', field: 'value' });
  });
}

const draft = {
  kind: 'smooth-incline', objectName: 'A', massKg: { value: 4, source: 'stated' },
  angleDeg: { value: 30, source: 'stated' }, gravity: { value: 9.81, source: 'stated' },
  surface: { value: 'fixed-smooth', source: 'stated' }, extraForces: { value: 'none', source: 'stated' },
  requested: ['forces', 'normal', 'acceleration'],
};
const question = '质量4 kg的物块在30°固定光滑斜面上，只受重力和支持力。重力加速度9.81 m/s²。';
const extraction = parsePhysicsExtraction(JSON.stringify({ status: 'candidate', model: draft, evidence: { massKg: '质量4 kg', angleDeg: '30°', gravity: '9.81 m/s²', surface: '固定光滑斜面', extraForces: '只受重力和支持力' } }), question, false);
assert.equal(extraction.status, 'candidate');
const prepared = makeInclineSource(extraction.model);
assert.doesNotMatch(prepared.source, /#scene|#fbd/);
const answer = await query(prepared.source);
assert.equal(answer[0].status, 'solved');
assert.equal(answer[0].model, 'single-contact-body');
assert.ok(Math.abs(answer[0].normal - 4 * 9.81 * Math.cos(Math.PI / 6)) < 1e-6);
assert.ok(Math.abs(answer[0].acceleration - 9.81 * Math.sin(Math.PI / 6)) < 1e-6);
assert.equal(verifyInclineResult(prepared.model, answer[0]), true);
assert.equal(verifyInclineResult(prepared.model, { ...answer[0], normal: 100 }), false);
const svg = inclineDiagram(prepared.model, answer[0]);
assert.match(svg, /^<svg/);
assert.match(svg, /W/);
assert.match(svg, /N/);
assert.match(svg, /A/);
const lesson = composeInclineLesson(prepared.model, answer[0], svg);
assert.ok(lesson.includes('支持力 N = mg cosθ'));
assert.ok(lesson.includes('4.905 m/s²'));
assert.doesNotMatch(composeInclineLesson(prepared.model, answer[0], '<svg><script>alert(1)</script></svg>'), /<script/i);
assert.throws(() => composeInclineLesson(prepared.model, answer[0], '<svg><script src="https://bad.example/a.js"></script></svg>'));
assert.throws(() => composeInclineLesson(prepared.model, { ...answer[0], normal: 100 }, svg));
const assembled = await preparePhysicsLesson({
  topic: question, hasImages: false, signal: new AbortController().signal,
  call: async () => JSON.stringify({ status: 'candidate', model: draft, evidence: { massKg: '质量4 kg', angleDeg: '30°', gravity: '9.81 m/s²', surface: '固定光滑斜面', extraForces: '只受重力和支持力' } }),
  render: async model => ({ svg, result: answer[0], model, assumptions: [] }),
});
assert.equal(assembled.status, 'candidate');
assert.ok(assembled.html.includes('支持力 N = mg cosθ'));
const explained = await addEli5PhysicsExplanation({
  candidate: assembled, topic: question, grade: 'senior', ctx: {}, signal: new AbortController().signal,
  call: async () => JSON.stringify({ status: 'ok', intro: '先选定物块。', steps: ['看看重力的方向。', '再看斜面对物块的支持力。'], summary: '结合题目条件理解图中的关系。' }),
});
assert.ok(explained.html.includes('先选定物块。'));
assert.ok(explained.html.includes('支持力 N = mg cosθ'));
assert.ok(explained.html.includes('4.905 m/s²'));
assert.ok(explained.html.includes('<svg'));
assert.deepEqual(explained.result, assembled.result);

for (const [mass, angle, gravity] of [[2, 15, 10], [3.5, 60, 9.8], [1e-7, 1e-7, 9.81]]) {
  const next = makeInclineSource({ ...draft, massKg: { value: mass, source: 'stated' }, angleDeg: { value: angle, source: 'stated' }, gravity: { value: gravity, source: 'stated' } });
  const values = await query(next.source);
  assert.equal(verifyInclineResult(next.model, values[0]), angle !== 1e-7);
}

const hangingModel = {
  kind: 'hanging-at-rest', objectName: 'A', massKg: { value: 2, source: 'stated' },
  gravity: { value: 10, source: 'stated' }, motion: { value: 'rest', source: 'stated' },
  rope: { value: 'vertical-taut-fixed', source: 'stated' }, extraForces: { value: 'none', source: 'stated' },
  requested: ['forces', 'tension'],
};
const hangingPrepared = makeHangingSource(hangingModel);
assert.doesNotMatch(hangingPrepared.source, /#scene|#fbd/);
const hanging = await query(hangingPrepared.source);
assert.equal(hanging[0].model, 'hanging-body');
assert.equal(hanging[0].status, 'solved');
assert.equal(hanging[0].tension, 20);
assert.equal(verifyHangingResult(hangingPrepared.model, hanging[0]), true);
const hangingSvg = hangingDiagram(hangingPrepared.model, hanging[0]);
assert.match(hangingSvg, /^<svg/);
assert.match(hangingSvg, /T/);
assert.match(hangingSvg, /W/);
assert.match(hangingSvg, /A/);
const hangingHtml = composeHangingLesson(hangingModel, hanging[0], hangingSvg);
const hangingPractices = buildHangingPractices(hangingModel, hanging[0]);
const savedHanging = JSON.parse(JSON.stringify({ stage: 'error', html: hangingHtml, retryPhysicsExplanation: true, pendingPhysicsPractices: hangingPractices, physicsPreview: { status: 'candidate', modelVersion: 'typed-physics:0.3.0', model: hangingModel, result: hanging[0], assumptions: [], evidence: {} } }));
const restoredHanging = restorePhysicsCandidate(savedHanging);
assert.ok(restoredHanging);
assert.equal(restoredHanging.html, hangingHtml);
assert.deepEqual(restoredHanging.practices, hangingPractices);
console.log('CeTZ-free incline/hanging probe passed');
