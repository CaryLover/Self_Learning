import type { PhysicsModel, PhysicsRendering } from "./pipeline";
import { throwIfAborted } from "../abort";

/** 每次任务使用独立线程；中断时立即终止，防止过期结果覆盖当前会话。 */
export function renderPhysicsInWorker(model: PhysicsModel, signal: AbortSignal): Promise<PhysicsRendering> {
  throwIfAborted(signal);
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  const fonts = [new URL("physics-fonts/NewCM10-Regular.otf", base).href, new URL("physics-fonts/NewCMMath-Regular.otf", base).href];
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./physics.worker.ts", import.meta.url), { type: "module" });
    const dispose = () => { signal.removeEventListener("abort", aborted); worker.terminate(); };
    const aborted = () => { dispose(); reject(signal.reason ?? new DOMException("已停止生成", "AbortError")); };
    signal.addEventListener("abort", aborted, { once: true });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; value?: PhysicsRendering; error?: string }>) => {
      dispose();
      if (event.data.ok && event.data.value) resolve(event.data.value);
      else reject(new Error(event.data.error || "物理图生成失败"));
    };
    worker.onerror = () => { dispose(); reject(new Error("物理图后台线程启动失败")); };
    if (signal.aborted) { aborted(); return; }
    worker.postMessage({ model, fonts, assetBase: base.href, families: { text: "New Computer Modern", math: "New Computer Modern Math" } });
  });
}
