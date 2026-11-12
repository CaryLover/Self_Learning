import { renderHanging, renderIncline } from "./browserEngine";
import type { PhysicsModel } from "./pipeline";
import { solvePersonBoard } from "./personBoard";

const scope = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage: (message: unknown) => void };
scope.onmessage = async (event: MessageEvent<{ model: PhysicsModel; fonts: string[]; families: { text: string; math: string }; assetBase: string }>) => {
  try {
    const { model, fonts, families, assetBase } = event.data;
    const value = model.kind === "person-board-rest" ? { ...solvePersonBoard(model), svg: "" } : model.kind === "hanging-at-rest" ? await renderHanging(model, fonts, families, assetBase) : await renderIncline(model, fonts, families, assetBase);
    scope.postMessage({ ok: true, value });
  } catch (error) {
    scope.postMessage({ ok: false, error: error instanceof Error ? error.message : "物理图生成失败" });
  }
};
