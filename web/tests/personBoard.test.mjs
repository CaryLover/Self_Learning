import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "person-board-"));
const outfile = join(dir, "model.mjs");
try {
  const bundle = await build({ stdin: { contents: `export * from './src/lib/physics/personBoard.ts'; export * from './src/lib/physics/extraction.ts'; export * from './src/lib/physics/pipeline.ts';`, resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { validatePersonBoard, solvePersonBoard, parsePhysicsExtraction, preparePhysicsLesson } = await import(pathToFileURL(outfile).href);
  const stated = value => ({ value, source: "stated" });
  const model = { kind: "person-board-rest", personMassKg: stated(60), boardMassKg: stated(20), gravity: stated(10), tensionN: stated(100), setup: stated("person-on-board-ground-rope-up"), motion: stated("rest"), extraForces: stated("none"), requested: ["forces", "contact"] };
  const question = "人质量60 kg，板质量20 kg。人站在水平板上，板由地面支持，固定绳竖直绷紧并向上拉人。人和板均静止。人和板只受到重力、相互接触力、地面对板支持力和绳对人的拉力。绳对人的拉力为100 N，重力加速度10 m/s²。求受力和接触力。";
  const evidence = { personMassKg: "人质量60 kg", boardMassKg: "板质量20 kg", gravity: "重力加速度10 m/s²", tensionN: "绳对人的拉力为100 N", setup: "人站在水平板上，板由地面支持，固定绳竖直绷紧并向上拉人", motion: "人和板均静止", extraForces: "人和板只受到重力、相互接触力、地面对板支持力和绳对人的拉力" };
  const raw = JSON.stringify({ status: "candidate", model, evidence });
  assert.equal(parsePhysicsExtraction(raw, question, false).status, "candidate");
  assert.equal(parsePhysicsExtraction(raw, question, true).status, "needs_review");
  assert.equal(parsePhysicsExtraction(JSON.stringify({ status: "candidate", model, evidence: { ...evidence, setup: "人" } }), question, false).status, "needs_review");
  assert.equal(parsePhysicsExtraction(JSON.stringify({ status: "candidate", model, evidence: { ...evidence, extraForces: "重力" } }), question, false).status, "needs_review");
  assert.equal(parsePhysicsExtraction(raw, question.replace("人和板均静止", "人和板并不静止"), false).status, "needs_review");
  assert.equal(parsePhysicsExtraction(JSON.stringify({ status: "candidate", model: { ...model, tensionN: stated(200) }, evidence }), question, false).status, "needs_review");
  assert.equal(validatePersonBoard({ ...model, tensionN: stated(600) }).ok, false);
  assert.equal(validatePersonBoard({ ...model, setup: { value: model.setup.value, source: "assumed" } }).ok, false);
  assert.equal(validatePersonBoard({ ...model, requested: ["acceleration"] }).ok, false);
  assert.equal(validatePersonBoard({ ...model, friction: stated(10) }).ok, false);
  const solved = solvePersonBoard(model);
  const forces = list => Object.fromEntries(list.map(f => [f.role, [f.y, f.magnitude]]));
  assert.deepEqual(forces(solved.result.person), { "person-weight": [-1, 600], "board-on-person": [1, 500], "rope-on-person": [1, 100] });
  assert.deepEqual(forces(solved.result.board), { "board-weight": [-1, 200], "person-on-board": [-1, 500], "ground-on-board": [1, 700] });
  assert.deepEqual(forces(solved.result.system), { "person-weight": [-1, 600], "rope-on-person": [1, 100], "board-weight": [-1, 200], "ground-on-board": [1, 700] });
  for (const group of [solved.result.person, solved.result.board, solved.result.system]) assert.equal(group.reduce((sum, f) => sum + f.y * f.magnitude, 0), 0);
  const options = { topic: question, hasImages: false, signal: new AbortController().signal, call: async () => raw, render: async candidate => ({ ...solvePersonBoard(candidate), svg: "" }) };
  const lesson = await preparePhysicsLesson(options);
  assert.equal(lesson.status, "candidate");
  assert.match(lesson.html, /板对人的支持力：向上，500 N/);
  assert.match(lesson.html, /地面对板的支持力：向上，700 N/);
  const diagrams = [...lesson.html.matchAll(/<svg class="fbd"[^>]*>([\s\S]*?)<\/svg>/g)];
  assert.equal(diagrams.length, 3);
  for (const [index, group] of [solved.result.person, solved.result.board, solved.result.system].entries()) {
    const arrows = [...diagrams[index][1].matchAll(/<line x1="[^"]+" y1="([^"]+)" x2="[^"]+" y2="([^"]+)"/g)];
    assert.equal(arrows.length, group.length);
    assert.deepEqual(arrows.map(([, start, end]) => Number(end) < Number(start) ? 1 : -1), group.map(force => force.y));
  }
  assert.match(lesson.html, /整体内部/);
  assert.equal(lesson.practices.length, 3);
  assert.match(lesson.practices[1].question, /人质量 30 kg/);
  assert.match(lesson.practices[1].question, /拉人 50 N/);
  assert.match(lesson.practices[1].answer, /250 N/);
  await assert.rejects(preparePhysicsLesson({ ...options, render: async candidate => { const value = solvePersonBoard(candidate); value.result.board[1].y = 1; return { ...value, svg: "" }; } }));
  console.log("person-board model checks passed");
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
