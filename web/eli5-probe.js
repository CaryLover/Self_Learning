import { runEli5Pipeline, runEli5Practice } from "./src/lib/eli5Pipeline.ts";
import { chatRequest } from "./src/lib/api.ts";

const status = document.querySelector("#status");
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
try {
  if (!import.meta.env.DEV) throw new Error("验证页仅供开发环境使用");
  let finalState;
  let calls = 0;
  const signal = new AbortController().signal;
  const request = (messages, signal) => chatRequest({ endpoint: "http://127.0.0.1:8791/v1/chat/completions", apiKey: "mock-key-test-12345", model: "mock-vl-mini", messages, stream: false, proxyUrl: "http://127.0.0.1:8791", signal });
  const base = { grade: "junior", topic: "解释图片里的知识", images: [image], ctx: {}, signal, update: state => { finalState = state; } };
  await runEli5Pipeline({ ...base, call: (messages, signal) => ++calls === 2 ? Promise.reject(new Error("模拟练习失败")) : request(messages, signal) });
  if (finalState?.stage !== "error" || !finalState.html || !finalState.retryPractice) throw new Error("练习失败后没有保留讲解");
  await runEli5Practice({ ...base, initial: finalState, call: request });
  if (finalState?.stage !== "done" || finalState.practices?.length !== 3 || !finalState.html) throw new Error("讲解或练习未完成");
  const summary = await (await fetch("http://127.0.0.1:8791/__last-prompt")).json();
  const recent = summary.recentRequests.slice(-2);
  if (recent.length !== 2 || recent.some(request => request.imageParts !== 1 || !request.viaProxy)) throw new Error("图片或代理未传给讲解与练习");
  let clarifyCalls = 0;
  await runEli5Pipeline({ ...base, call: async () => { clarifyCalls++; return '<!DOCTYPE html><html><head><meta name="eli5-input-status" content="needs-clarification"></head><body><p>图片不清楚，请补充题目。</p></body></html>'; } });
  if (clarifyCalls !== 1 || finalState?.stage !== "clarification") throw new Error("条件不足时没有停止练习生成");
  status.textContent = "通过：讲解与练习经过代理并收到图片，练习失败可重试，条件不足会停止；使用本地模拟模型。";
} catch (error) {
  status.textContent = `验证失败：${error instanceof Error ? error.message : String(error)}`;
}
