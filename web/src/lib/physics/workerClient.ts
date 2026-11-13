import type { PhysicsModel, PhysicsRendering } from "./pipeline";
import { throwIfAborted } from "../abort";
import { PhysicsWorkerError } from "./workerError";
export { PhysicsWorkerError } from "./workerError";

/** 每次任务使用独立线程；中断时立即终止，防止过期结果覆盖当前会话。 */
export function renderPhysicsInWorker(model: PhysicsModel, signal: AbortSignal): Promise<PhysicsRendering> {
  throwIfAborted(signal);
  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  const fonts = [new URL("physics-fonts/NewCM10-Regular.otf", base).href, new URL("physics-fonts/NewCMMath-Regular.otf", base).href];
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./physics.worker.ts", import.meta.url), { type: "module" });
    } catch {
      reject(new PhysicsWorkerError("物理图后台线程启动失败"));
      return;
    }
    const dispose = () => { signal.removeEventListener("abort", aborted); worker.terminate(); };
    const aborted = () => { dispose(); reject(signal.reason ?? new DOMException("已停止生成", "AbortError")); };
    signal.addEventListener("abort", aborted, { once: true });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; value?: PhysicsRendering; error?: string }>) => {
      dispose();
      if (event.data.ok && event.data.value) resolve(event.data.value);
      else reject(new PhysicsWorkerError(event.data.error || "物理图生成失败"));
    };
    worker.onerror = () => { dispose(); reject(new PhysicsWorkerError("物理图后台线程启动失败")); };
    worker.onmessageerror = () => { dispose(); reject(new PhysicsWorkerError("无法读取物理工具的结果")); };
    if (signal.aborted) { aborted(); return; }
    try {
      worker.postMessage({ model, fonts, assetBase: base.href, families: { text: "New Computer Modern", math: "New Computer Modern Math" } });
    } catch {
      dispose();
      reject(new PhysicsWorkerError("无法向物理工具发送题目"));
    }
  });
}
