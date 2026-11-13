import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "physics-model-"));
const outfile = join(dir, "model.mjs");
try {
  const result = await build({ stdin: { contents: `export * from './src/lib/physics/model.ts'; export * from './src/lib/physics/extraction.ts'; export * from './src/lib/physics/pipeline.ts'; export * from './src/lib/physics/hanging.ts';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, result.outputFiles[0].contents);
  const { validateSmoothIncline, parsePhysicsExtraction, preparePhysicsLesson, validateHanging, makeHangingSource, verifyHangingResult } = await import(pathToFileURL(outfile).href);
  const valid = { kind: "smooth-incline", objectName: "A", massKg: { value: 2, source: "stated" }, angleDeg: { value: 30, source: "stated" }, gravity: { value: 10, source: "assumed" }, surface: { value: "fixed-smooth", source: "stated" }, extraForces: { value: "none", source: "stated" }, requested: ["forces", "normal"] };
  assert.deepEqual(validateSmoothIncline(valid).assumptions, ["gravity"]);
  assert.equal(validateSmoothIncline({ ...valid, angleDeg: { value: 90, source: "stated" } }).ok, false);
  assert.equal(validateSmoothIncline({ ...valid, extraForces: { value: "none", source: "assumed" } }).ok, false);
  assert.equal(validateSmoothIncline({ ...valid, massKg: { value: NaN, source: "stated" } }).ok, false);
  assert.equal(validateSmoothIncline({ ...valid, angleDeg: { value: 30, source: "assumed" } }).ok, false);
  assert.equal(validateSmoothIncline({ ...valid, contactBodies: ["person", "board"] }).ok, false);
  assert.equal(validateSmoothIncline({ ...valid, requested: ["forces", "forces"] }).ok, false);
  assert.equal(validateSmoothIncline(null).ok, false);
  const question = '质量2 kg的物块在30°固定光滑斜面上，只受重力和支持力。';
  const extraction = { status: 'candidate', model: valid, evidence: { massKg: '质量2 kg', angleDeg: '30°', surface: '固定光滑斜面', extraForces: '只受重力和支持力' } };
  assert.equal(parsePhysicsExtraction(JSON.stringify(extraction), question, false).status, 'candidate');
  for (const [source, excerpt, expected] of [
    ['质量2e0 kg', '2e0 kg', 'candidate'],
    ['质量2克', '2克', 'needs_review'],
    ['质量-2 kg', '2 kg', 'needs_review'],
    ['质量− 2 kg', '2 kg', 'needs_review'],
    ['质量4+2 kg', '2 kg', 'needs_review'],
    ['质量1, 2 kg', '2 kg', 'needs_review'],
    ['质量2 kg + 1 kg', '2 kg', 'needs_review'],
  ]) {
    const text = question.replace('质量2 kg', source);
    const data = { ...extraction, evidence: { ...extraction.evidence, massKg: excerpt } };
    assert.equal(parsePhysicsExtraction(JSON.stringify(data), text, false).status, expected, source);
  }
  for (const [source, excerpt, expected] of [
    ['重力加速度10 m/s²', '10 m/s²', 'candidate'],
    ['重力加速度1e1 m/s^2', '1e1 m/s^2', 'candidate'],
    ['重力加速度10 cm/s²', '10 cm/s²', 'needs_review'],
    ['重力加速度10', '10', 'needs_review'],
  ]) {
    const data = { ...extraction, model: { ...valid, gravity: { value: 10, source: 'stated' } }, evidence: { ...extraction.evidence, gravity: excerpt } };
    assert.equal(parsePhysicsExtraction(JSON.stringify(data), `${question}${source}`, false).status, expected, source);
  }
  assert.equal(parsePhysicsExtraction(JSON.stringify(extraction), question, true).status, 'needs_review');
  assert.equal(parsePhysicsExtraction(JSON.stringify({ ...extraction, evidence: { ...extraction.evidence, extraForces: '伪造引文' } }), question, false).status, 'needs_review');
  assert.equal(parsePhysicsExtraction(JSON.stringify({ ...extraction, model: { ...valid, massKg: { value: 3, source: 'stated' } } }), question, false).status, 'needs_review');
  assert.match(parsePhysicsExtraction(JSON.stringify({ ...extraction, model: { ...valid, massKg: { value: -1, source: 'stated' } } }), question, false).reason, /物体质量/);
  assert.match(parsePhysicsExtraction(JSON.stringify({ ...extraction, evidence: { ...extraction.evidence, massKg: '伪造引文' } }), question, false).reason, /物体质量缺少可核对的原文依据/);
  assert.equal(parsePhysicsExtraction(JSON.stringify({ ...extraction, evidence: { ...extraction.evidence, surface: '斜面' } }), question, false).status, 'needs_review');
  assert.equal(parsePhysicsExtraction(JSON.stringify({ ...extraction, evidence: { ...extraction.evidence, extraForces: '重力和支持力' } }), question, false).status, 'needs_review');
  assert.equal(parsePhysicsExtraction(JSON.stringify(extraction), question, false).status, 'candidate');
  assert.equal(parsePhysicsExtraction('{"status":"needs_review"}', question, false).status, 'needs_review');
  let calls = 0;
  let renders = 0;
  const signal = new AbortController().signal;
  const call = async () => { calls++; return JSON.stringify(extraction); };
  const inclineForces = [{ role: 'weight', direction: [0, -1] }, { role: 'normal', direction: [-0.5, Math.cos(Math.PI / 6)] }];
  const render = async model => { renders++; return { model, assumptions: ['gravity'], result: { status: 'solved', model: 'single-contact-body', normal: 2 * 10 * Math.cos(Math.PI / 6), acceleration: 5, forces: inclineForces }, svg: '<svg></svg>' }; };
  const candidate = await preparePhysicsLesson({ topic: question, hasImages: false, signal, call, render });
  assert.equal(candidate.status, 'candidate');
  assert.ok(candidate.html.includes('支持力'));
  assert.equal(candidate.practices.length, 3);
  assert.ok(candidate.practices[1].answer.includes('17.32'));
  assert.ok(candidate.practices[2].answer.includes('5'));
  assert.equal(calls, 1);
  assert.equal(renders, 1);
  const juniorIncline = await preparePhysicsLesson({ topic: question, hasImages: false, allowNotApplicable: true, grade: 'junior', signal, call, render });
  assert.equal(juniorIncline.status, 'unsupported');
  assert.equal(renders, 1);
  const unrelated = await preparePhysicsLesson({ topic: '为什么先乘除后加减？', hasImages: false, allowNotApplicable: true, signal, call: async () => '{"status":"not_applicable"}', render });
  assert.equal(unrelated.status, 'not_applicable');
  assert.equal(renders, 1);
  let repairedCalls = 0;
  const repairedRoute = await preparePhysicsLesson({ topic: '为什么先乘除后加减？', hasImages: false, allowNotApplicable: true, signal, call: async () => ++repairedCalls === 1 ? '格式错误' : '{"status":"not_applicable"}', render });
  assert.equal(repairedRoute.status, 'not_applicable');
  assert.equal(repairedCalls, 2);
  let uncertainCalls = 0;
  const uncertainRoute = await preparePhysicsLesson({ topic: '题目条件不清', hasImages: false, allowNotApplicable: true, signal, call: async () => { uncertainCalls++; return '{"status":"needs_review"}'; }, render });
  assert.equal(uncertainRoute.status, 'needs_review');
  assert.equal(uncertainCalls, 1);
  const beyondLibrary = await preparePhysicsLesson({ topic: '解释热传导', hasImages: false, allowNotApplicable: true, signal, call: async () => '{"status":"unsupported"}', render });
  assert.equal(beyondLibrary.status, 'unsupported');
  assert.equal(renders, 1);
  const explainedStatus = await preparePhysicsLesson({ topic: '请解释光合作用', hasImages: false, allowNotApplicable: true, signal, call: async () => '{"status":"not_applicable","reason":"这是生物学主题"}', render });
  assert.equal(explainedStatus.status, 'not_applicable');
  const explainedUnsupported = await preparePhysicsLesson({ topic: '请解释热传导', hasImages: false, allowNotApplicable: true, signal, call: async () => '{"status":"unsupported","reason":"热学暂不支持"}', render });
  assert.equal(explainedUnsupported.status, 'unsupported');
  assert.equal(renders, 1);
  const contradictory = await preparePhysicsLesson({ topic: question, hasImages: false, allowNotApplicable: true, signal, call: async () => JSON.stringify({ status: 'not_applicable', model: valid }), render });
  assert.equal(contradictory.status, 'needs_review');
  assert.equal(renders, 1);
  const unsupported = await preparePhysicsLesson({ topic: '物理条件不明确', hasImages: false, allowNotApplicable: true, signal, call: async () => '{"status":"needs_review"}', render });
  assert.equal(unsupported.status, 'needs_review');
  assert.equal(renders, 1);
  const explicit = await preparePhysicsLesson({ topic: '无关题目', hasImages: false, signal, call: async () => '{"status":"not_applicable"}', render });
  assert.equal(explicit.status, 'needs_review');
  assert.equal(renders, 1);
  assert.equal((await preparePhysicsLesson({ topic: question, hasImages: true, signal, call, render })).status, 'needs_review');
  assert.equal(calls, 2);
  const incomplete = await preparePhysicsLesson({ topic: '条件不明确', hasImages: false, signal, call, render });
  assert.equal(incomplete.status, 'needs_review');
  assert.equal(renders, 1);
  await assert.rejects(preparePhysicsLesson({ topic: question, hasImages: false, signal, call, render: async model => ({ model, assumptions: ['gravity'], result: { status: 'solved', model: 'single-contact-body', normal: 2 * 10 * Math.cos(Math.PI / 6), acceleration: 5, forces: [{ role: 'weight', direction: [0, -1] }, { role: 'normal', direction: [0.5, -Math.cos(Math.PI / 6)] }] }, svg: '<svg></svg>' }) }));
  await assert.rejects(preparePhysicsLesson({ topic: question, hasImages: false, signal, call, render: async model => ({ ...await render(model), result: { status: 'solved', model: 'single-contact-body', normal: 99, acceleration: 5 } }) }));
  const hanging = { kind: 'hanging-at-rest', objectName: 'A', massKg: { value: 2, source: 'stated' }, gravity: { value: 10, source: 'assumed' }, motion: { value: 'rest', source: 'stated' }, rope: { value: 'vertical-taut-fixed', source: 'stated' }, extraForces: { value: 'none', source: 'stated' }, requested: ['forces', 'tension'] };
  assert.equal(validateHanging(hanging).ok, true);
  assert.deepEqual(validateHanging(hanging).assumptions, ['gravity']);
  assert.equal(validateHanging({ ...hanging, motion: { value: 'rest', source: 'assumed' } }).ok, false);
  assert.equal(validateHanging({ ...hanging, rope: { value: 'vertical-taut-fixed', source: 'assumed' } }).ok, false);
  assert.throws(() => makeHangingSource({ ...hanging, motion: { value: 'moving', source: 'stated' } }));
  assert.match(makeHangingSource(hanging).source, /rope\("cord", from: "top", to: "A\.top"\)/);
  const hangingForces = [{ role: 'weight', direction: [0, -1] }, { role: 'tension', direction: [0, 1] }];
  assert.equal(verifyHangingResult(hanging, { status: 'solved', model: 'hanging-body', tension: 20, forces: hangingForces }), true);
  assert.equal(verifyHangingResult(hanging, { status: 'solved', model: 'hanging-body', tension: 19 }), false);
  const hangingQuestion = '质量2 kg的物块用固定、竖直绷紧的绳悬挂并静止，物块只受重力和绳的拉力。';
  const hangingEvidence = { massKg: '质量2 kg', motion: '悬挂并静止', rope: '固定、竖直绷紧的绳', extraForces: '只受重力和绳的拉力' };
  const hangingRaw = JSON.stringify({ status: 'candidate', model: hanging, evidence: hangingEvidence });
  assert.equal(parsePhysicsExtraction(hangingRaw, hangingQuestion, false).status, 'candidate');
  for (const [field, fragment] of [['motion', '悬挂'], ['rope', '绳悬挂'], ['extraForces', '重力和绳的拉力']]) {
    const weak = JSON.stringify({ status: 'candidate', model: hanging, evidence: { ...hangingEvidence, [field]: fragment } });
    assert.equal(parsePhysicsExtraction(weak, hangingQuestion, false).status, 'needs_review', field);
  }
  const hangingLesson = await preparePhysicsLesson({ topic: hangingQuestion, hasImages: false, signal, call: async () => hangingRaw, render: async model => ({ model, assumptions: ['gravity'], result: { status: 'solved', model: 'hanging-body', tension: 20, forces: hangingForces }, svg: '<svg></svg>' }) });
  assert.equal(hangingLesson.status, 'candidate');
  const juniorHanging = await preparePhysicsLesson({ topic: hangingQuestion, hasImages: false, grade: 'junior', allowNotApplicable: true, signal, call: async () => hangingRaw, render: async model => ({ model, assumptions: ['gravity'], result: { status: 'solved', model: 'hanging-body', tension: 20, forces: hangingForces }, svg: '<svg></svg>' }) });
  assert.equal(juniorHanging.status, 'candidate');
  assert.equal(hangingLesson.practices.length, 3);
  assert.ok(hangingLesson.html.includes('拉力 T = mg'));
  assert.equal(verifyHangingResult(hanging, { status: 'solved', model: 'hanging-body', tension: 20, forces: [{ role: 'weight', direction: [0, -1] }, { role: 'tension', direction: [0, -1] }] }), false);
  assert.equal(parsePhysicsExtraction(hangingRaw, hangingQuestion.replace('静止', '运动'), false).status, 'needs_review');
  assert.equal(parsePhysicsExtraction(hangingRaw, hangingQuestion.replace('并静止', '并非静止'), false).status, 'needs_review');
  const misleading = JSON.stringify({ status: 'candidate', model: hanging, evidence: { ...hangingEvidence, motion: '静止' } });
  assert.equal(parsePhysicsExtraction(misleading, hangingQuestion.replace('并静止', '并非静止'), false).status, 'needs_review');
  const fabricatedRest = JSON.stringify({ status: 'candidate', model: { ...hanging, motion: { value: 'rest', source: 'assumed' } }, evidence: hangingEvidence });
  assert.equal(parsePhysicsExtraction(fabricatedRest, hangingQuestion, false).status, 'needs_review');
  console.log("physics model checks passed");
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
