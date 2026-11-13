import { renderHanging, renderIncline, renderCircuit } from "./browserEngine";
import type { PhysicsModel } from "./pipeline";
import { solvePersonBoard } from "./personBoard";

const scope = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage: (message: unknown) => void };
scope.onmessage = async (event: MessageEvent<{ model: PhysicsModel; assetBase: string }>) => {
  try {
    const { model, assetBase } = event.data;
    let value;
    switch (model.kind) {
      case "person-board-rest": value = { ...solvePersonBoard(model), svg: "" }; break;
      case "hanging-at-rest": value = await renderHanging(model, assetBase); break;
      case "resistive-circuit": value = await renderCircuit(model, assetBase); break;
      case "smooth-incline": value = await renderIncline(model, assetBase); break;
      default: {
        const unsupported: never = model;
        throw new Error(`不支持的物理模型：${unsupported}`);
      }
    }
    scope.postMessage({ ok: true, value });
  } catch (error) {
    scope.postMessage({ ok: false, error: error instanceof Error ? error.message : "物理图生成失败" });
  }
};
