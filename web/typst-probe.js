import { renderPhysicsInWorker } from './src/lib/physics/workerClient';
import { preparePhysicsLesson } from './src/lib/physics/pipeline';
import { addEli5PhysicsExplanation } from './src/lib/physics/eli5Explain';
const status = document.querySelector('#status');
async function run() {
try {
  const start = performance.now();
  const draft = { kind: 'smooth-incline', objectName: 'A', massKg: { value: 4, source: 'stated' }, angleDeg: { value: 30, source: 'stated' }, gravity: { value: 9.81, source: 'stated' }, surface: { value: 'fixed-smooth', source: 'stated' }, extraForces: { value: 'none', source: 'stated' }, requested: ['forces', 'normal', 'acceleration'] };
  const evidence = { massKg: '质量4 kg', angleDeg: '30°', gravity: '9.81', surface: '固定光滑斜面', extraForces: '只受重力和支持力' };
  let rendered = 0;
  const controller = new AbortController();
  const options = { topic: '质量4 kg的物块在30°固定光滑斜面上，只受重力和支持力。重力加速度9.81 m/s²。', hasImages: false, signal: controller.signal, call: async () => JSON.stringify({ status: 'candidate', model: draft, evidence }), render: model => { rendered++; return renderPhysicsInWorker(model, controller.signal); } };
  const lesson = await preparePhysicsLesson(options);
  if (lesson.status !== 'candidate') throw Error(lesson.reason);
  const unrelated = await preparePhysicsLesson({ ...options, topic: '为什么先乘除后加减？', allowNotApplicable: true, call: async () => '{"status":"not_applicable"}' });
  if (unrelated.status !== 'not_applicable' || rendered !== 1) throw Error('非物理主题不应进入物理渲染');
  const explained = await addEli5PhysicsExplanation({ candidate: lesson, topic: options.topic, grade: 'senior', ctx: {}, signal: controller.signal, call: async () => JSON.stringify({ status: 'ok', intro: '先观察研究对象。', steps: ['先看重力方向。', '再看斜面对物块的支持力。'], summary: '把题目条件和图中的方向联系起来。' }) });
  if (!explained.html.includes('先观察研究对象。') || !explained.html.includes('支持力 N = mg cosθ')) throw Error('ELI5 讲解与物理结果没有正确组合');
  const rejected = await preparePhysicsLesson({ ...options, topic: '条件不明确' });
  if (rejected.status !== 'needs_review' || rendered !== 1) throw Error('未拦截条件不足的题目');
  const hangingModel = { kind: 'hanging-at-rest', objectName: 'B', massKg: { value: 2, source: 'stated' }, gravity: { value: 10, source: 'stated' }, motion: { value: 'rest', source: 'stated' }, rope: { value: 'vertical-taut-fixed', source: 'stated' }, extraForces: { value: 'none', source: 'stated' }, requested: ['forces', 'tension'] };
  const hangingEvidence = { massKg: '质量2 kg', gravity: '10', motion: '悬挂并静止', rope: '固定、竖直绷紧的绳', extraForces: '只受重力和绳的拉力' };
  const hanging = await preparePhysicsLesson({ ...options, topic: '质量2 kg的物块用固定、竖直绷紧的绳悬挂并静止，物块只受重力和绳的拉力。重力加速度10 m/s²。', call: async () => JSON.stringify({ status: 'candidate', model: hangingModel, evidence: hangingEvidence }), render: model => renderPhysicsInWorker(model, controller.signal) });
  if (hanging.status !== 'candidate' || hanging.result.tension !== 20) throw Error('悬挂题结果异常');
  if (lesson.practices.length !== 3 || hanging.practices.length !== 3 || !hanging.practices[1].answer.includes('20')) throw Error('练习结果异常');
  const cancel = new AbortController();
  const cancelled = renderPhysicsInWorker(draft, cancel.signal).then(() => false, error => error?.name === 'AbortError');
  cancel.abort();
  if (!await cancelled) throw Error('后台任务取消异常');
  document.querySelector('#figure').srcdoc = explained.html;
  document.querySelector('#hanging').srcdoc = hanging.html;
  status.textContent = `两个完整样例验证通过（模拟模型）：${Math.round(performance.now() - start)} ms；斜面支持力约 ${lesson.result.normal.toFixed(2)} N，加速度 ${lesson.result.acceleration.toFixed(3)} m/s²；悬挂拉力 ${hanging.result.tension} N；各生成 3 道练习；条件不足已拦截；后台任务可取消。`;
} catch (error) { status.textContent = `验证失败：${error?.stack || error}`; }
}
void run();
