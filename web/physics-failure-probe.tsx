import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LearnView } from "./src/components/LearnView";
import { defaultSettings } from "./src/lib/store";
import type { Session } from "./src/lib/types";

const status = document.querySelector("#result")!;
const settings = defaultSettings();
settings.providers.siliconflow = { enabled: true, apiKey: "fake-local-test-key", defaultModel: "mock-text", models: { "mock-text": { enabled: true } } };
const question = '理想直流电源为12V，纯电阻网络中R1为3Ω，R2为6Ω，R3为6Ω。R2与R3并联后与R1串联，求总电阻和总电流。';
const model = { kind: 'resistive-circuit', voltage: 12, requested: ['equivalent', 'current'], network: { kind: 'series', children: [{ kind: 'resistor', id: 'R1', resistance: 3 }, { kind: 'parallel', children: [{ kind: 'resistor', id: 'R2', resistance: 6 }, { kind: 'resistor', id: 'R3', resistance: 6 }] }] } };
const extraction = { status: 'candidate', model, evidence: { voltage: '12V', topology: 'R2与R3并联后与R1串联', resistors: { R1: 'R1为3Ω', R2: 'R2为6Ω', R3: 'R3为6Ω' } } };
const originalFetch = window.fetch;
const originalWorker = window.Worker;
let requests = 0;
let explanationRequests = 0;
let workerStarts = 0;
let pendingSnapshot: Session | undefined;
const getPendingSnapshot = (): Session | undefined => pendingSnapshot;
const requestCount = () => requests;
window.fetch = async (_input, init) => {
  requests++;
  const messages = JSON.parse(String(init?.body ?? '{}')).messages ?? [];
  const system = messages.find((message: { role?: string }) => message.role === 'system')?.content ?? '';
  let reply: unknown = extraction;
  if (system.includes('物理事实组织图解讲解')) {
    explanationRequests++;
    reply = explanationRequests === 1 ? { status: 'needs_review' } : { status: 'ok', intro: '先找到R1。', steps: ['再看R2和R3。', '按连接关系理解整个电路。'], summary: '再结合图中的结果思考。' };
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
window.Worker = class { constructor() { throw new Error('test worker failure'); } } as unknown as typeof Worker;
function Fixture({ initial = null }: { initial?: Session | null }) {
  const [current, setCurrent] = useState<Session | null>(initial);
  return <LearnView active settings={settings} prefs={{ grade: "senior", mode: "eli5" }} sessions={current ? [current] : []} current={current} onPrefsChange={() => {}} onNewSession={() => {}} onOpenSession={() => {}} onDeleteSession={() => {}} onSaveSession={next => { if (next.eli5?.retryPhysicsExplanation) pendingSnapshot = structuredClone(next); setCurrent(next); }} goSettings={() => {}} />;
}
const root = createRoot(document.querySelector("#root")!);
root.render(<Fixture />);
const waitFor = async (selector: string): Promise<Element> => {
  for (let i = 0; i < 600; i++) {
    const element = document.querySelector(selector);
    if (element) return element;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`没有找到 ${selector}`);
};
try {
  const input = await waitFor("textarea") as HTMLTextAreaElement;
  input.focus();
  document.execCommand("insertText", false, `【物理测试】${question}`);
  await new Promise(resolve => setTimeout(resolve, 100));
  (await waitFor(".composer-right .btn-send") as HTMLButtonElement).click();
  const error = await waitFor(".eli5 .error-card");
  if (!error.textContent?.includes("物理工具处理失败") || !error.textContent.includes("后台线程启动失败") || requestCount() !== 1) throw new Error("没有正确报告物理工具失败");
  const retry = await waitFor(".eli5 button.btn");
  if (!retry.textContent?.includes("重新生成讲解")) throw new Error("没有保留重试入口");
  window.Worker = class extends originalWorker {
    constructor(url: string | URL, options?: WorkerOptions) { super(url, options); workerStarts++; }
  };
  (retry as HTMLButtonElement).click();
  let explanationRetry: HTMLButtonElement | null = null;
  for (let i = 0; i < 600; i++) {
    const button = document.querySelector<HTMLButtonElement>(".eli5 button.btn");
    if (button?.textContent?.includes("重新生成物理讲解")) { explanationRetry = button; break; }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!explanationRetry || !document.querySelector(".explain-frame") || requestCount() !== 3 || workerStarts !== 1) throw new Error("物理结果未在讲解失败后保留");
  explanationRetry.click();
  await waitFor(".eli5 .done-banner");
  if (requestCount() !== 4 || workerStarts !== 1 || !document.querySelector(".explain-frame")) throw new Error("重试讲解时重复计算或未完成融合");
  const pending = getPendingSnapshot();
  const preview = pending?.eli5?.physicsPreview;
  if (!pending?.eli5 || !preview || preview.model.kind !== "resistive-circuit" || !("resistance" in preview.result)) throw new Error("没有保存待恢复的物理结果");
  const corrupted: Session = { ...pending, eli5: { ...pending.eli5, physicsPreview: { ...preview, result: { ...preview.result, resistance: 999 } } } };
  root.render(<Fixture key="corrupted" initial={corrupted} />);
  const corruptRetry = await waitFor(".eli5 button.btn") as HTMLButtonElement;
  corruptRetry.click();
  for (let i = 0; i < 160 && !document.querySelector(".eli5")?.textContent?.includes("未通过恢复检查"); i++) await new Promise(resolve => setTimeout(resolve, 50));
  if (!document.querySelector(".eli5")?.textContent?.includes("未通过恢复检查") || document.querySelector(".explain-frame") || requestCount() !== 4 || workerStarts !== 1) throw new Error("损坏结果没有被拦截");
  status.textContent = "物理工具失败恢复检查通过";
} catch (error) {
  status.textContent = `物理工具失败恢复检查失败：${error instanceof Error ? error.message : "未知错误"}`;
} finally {
  root.unmount();
  window.fetch = originalFetch;
  window.Worker = originalWorker;
}
