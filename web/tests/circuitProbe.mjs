import { readFile } from 'node:fs/promises';
import { $typst, TypstSnippet } from '@myriaddreamin/typst.ts/contrib/snippet';
import { MemoryAccessModel } from '@myriaddreamin/typst.ts/fs/memory';
import { FetchPackageRegistry } from '@myriaddreamin/typst.ts/fs/package';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiler = await WebAssembly.compile(await readFile('node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'));
$typst.setCompilerInitOptions({ getModule: () => compiler });
const archives = new Map();
archives.set('typed-physics-0.3.0', new Uint8Array(await readFile('public/physics-packages/typed-physics-0.3.0.bin')));
const memory = new MemoryAccessModel();
class LocalRegistry extends FetchPackageRegistry {
  pullPackageData(spec) { return spec.namespace === 'preview' ? archives.get(`${spec.name}-${spec.version}`) : undefined; }
}
$typst.use(TypstSnippet.withAccessModel(memory), TypstSnippet.withPackageRegistry(new LocalRegistry(memory)));
const bundled = await build({
  stdin: {
    contents: `export * from './src/lib/physics/circuit.ts'; export * from './src/lib/physics/pipeline.ts'; export * from './src/lib/physics/eli5Explain.ts'; export * from './src/lib/physics/diagram.ts';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { makeCircuitSource, verifyCircuitResult, preparePhysicsLesson, addEli5PhysicsExplanation, restorePhysicsCandidate, circuitDiagram } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`);
const cc = await $typst.getCompiler();
async function query(source) {
  cc.addSource('/circuit.typ', source);
  return cc.runWithWorld({ mainFilePath: '/circuit.typ' }, async world => {
    await world.compile();
    return world.query({ selector: '<physics-result>', field: 'value' });
  });
}
const model = { kind: 'resistive-circuit', voltage: 12, requested: ['equivalent', 'current'], network: { kind: 'series', children: [{ kind: 'resistor', id: 'R1', resistance: 3 }, { kind: 'parallel', children: [{ kind: 'resistor', id: 'R2', resistance: 6 }, { kind: 'resistor', id: 'R3', resistance: 6 }] }] } };
const source = makeCircuitSource(model).source;
assert.doesNotMatch(source, /e\.diagram/);
const result = await query(source);
assert.equal(verifyCircuitResult(model, result[0]), true);
assert.equal(result[0].regime, 'dc-steady-state');
assert.equal(result[0].conducts, true);
assert.ok(Math.abs(result[0].resistance - 6) < 1e-8);
assert.ok(Math.abs(result[0].current - 2) < 1e-8);
const svg = circuitDiagram(model, result[0]);
assert.match(svg, /^<svg/);
assert.match(svg, /R1/);
assert.match(svg, /R2/);
assert.match(svg, /R3/);
assert.match(svg, /V/);
const alternatives = [
  { kind: 'resistive-circuit', voltage: 6, requested: ['equivalent'], network: { kind: 'resistor', id: 'R1', resistance: 10 } },
  { kind: 'resistive-circuit', voltage: 8, requested: ['current'], network: { kind: 'parallel', children: [{ kind: 'resistor', id: 'R1', resistance: 4 }, { kind: 'resistor', id: 'R2', resistance: 12 }] } },
  { kind: 'resistive-circuit', voltage: 24, requested: ['equivalent', 'current'], network: { kind: 'parallel', children: Array.from({ length: 4 }, (_, i) => ({ kind: 'series', children: [{ kind: 'resistor', id: `R${i * 2 + 1}`, resistance: i + 2 }, { kind: 'resistor', id: `R${i * 2 + 2}`, resistance: i + 3 }] })) } },
  { kind: 'resistive-circuit', voltage: 9, requested: ['equivalent'], network: { kind: 'series', children: [{ kind: 'resistor', id: 'R1', resistance: 2 }, { kind: 'parallel', children: [{ kind: 'resistor', id: 'R2', resistance: 4 }, { kind: 'series', children: [{ kind: 'resistor', id: 'R3', resistance: 6 }, { kind: 'parallel', children: [{ kind: 'resistor', id: 'R4', resistance: 8 }, { kind: 'resistor', id: 'R5', resistance: 10 }] }] }] }] } },
];
for (const alternative of alternatives) {
  const variant = makeCircuitSource(alternative);
  const values = await query(variant.source);
  assert.equal(verifyCircuitResult(alternative, values[0]), true);
  assert.match(circuitDiagram(alternative, values[0]), /^<svg/);
}
const topic = '理想直流电源为12V，纯电阻网络中R1为3Ω，R2为6Ω，R3为6Ω。R2与R3并联后与R1串联，求总电阻和总电流。';
const extraction = { status: 'candidate', model, evidence: { voltage: '12V', topology: 'R2与R3并联后与R1串联', resistors: { R1: 'R1为3Ω', R2: 'R2为6Ω', R3: 'R3为6Ω' } } };
const signal = new AbortController().signal;
const candidate = await preparePhysicsLesson({ topic, grade: 'junior', hasImages: false, allowNotApplicable: true, signal, call: async () => JSON.stringify(extraction), render: async model => ({ model, assumptions: [], result: result[0], svg }) });
assert.equal(candidate.status, 'candidate');
assert.match(candidate.html, /<svg/);
assert.match(candidate.html, /6 Ω/);
assert.match(candidate.html, /2 A/);
assert.equal(candidate.practices.length, 3);
const saved = JSON.parse(JSON.stringify({ stage: 'error', topic, html: candidate.html, retryPhysicsExplanation: true, pendingPhysicsPractices: candidate.practices, physicsPreview: { status: 'candidate', modelVersion: 'typed-physics:0.3.0', model: candidate.model, result: candidate.result, assumptions: candidate.assumptions, evidence: candidate.evidence } }));
assert.deepEqual(restorePhysicsCandidate(saved), candidate);
const explain = async () => JSON.stringify({ status: 'ok', intro: '先找到R1。', steps: ['再看R2和R3。', '把并联部分看作整体。'], summary: '按照连接顺序理解。' });
const explained = await addEli5PhysicsExplanation({ candidate, topic, grade: 'junior', ctx: {}, signal, call: explain });
assert.match(explained.html, /先找到R1/);
assert.ok(explained.html.includes('<svg'));
await assert.rejects(addEli5PhysicsExplanation({ candidate, topic, grade: 'junior', ctx: {}, signal, call: async () => JSON.stringify({ status: 'ok', intro: '找到R9。', steps: ['第一步。', '第二步。'], summary: '完成。' }) }));
console.log('CeTZ-free typed-physics circuit probe passed');
