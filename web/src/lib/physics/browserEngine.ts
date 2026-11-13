/// <reference types="vite/client" />
import { TypstSnippet } from "@myriaddreamin/typst.ts/contrib/snippet";
import { MemoryAccessModel } from "@myriaddreamin/typst.ts/fs/memory";
import { FetchPackageRegistry } from "@myriaddreamin/typst.ts/fs/package";
import type { PackageSpec } from "@myriaddreamin/typst.ts/internal.types";
import { makeInclineSource, verifyInclineResult } from "./typedSource";
import { makeHangingSource, verifyHangingResult, type HangingModel } from "./hanging";
import type { SmoothInclineModel } from "./model";
import type { PhysicsForce } from "./pipeline";
import { makeCircuitSource, verifyCircuitResult, type CircuitModel, type CircuitResult } from "./circuit";
import { circuitDiagram, hangingDiagram, inclineDiagram } from "./diagram";

const packages = [
  ["typed-physics-0.3.0", "3a29a1e71fe48d9af56b241b84f9770b68f7af6f7404e8497974d0a9f7eabc3c"],
] as const;

/** 仅用 typed-physics 的求解模块；图形由 diagram.ts 生成，不加载 CeTZ 或渲染器。 */
async function solvePrepared<T extends SmoothInclineModel | HangingModel | CircuitModel, R>(prepared: { source: string; model: T; assumptions: string[] }, verify: (model: T, value: unknown) => boolean, assetBase?: string) {
  const base = new URL(assetBase ?? import.meta.env.BASE_URL, globalThis.location.href);
  if (base.origin !== globalThis.location.origin) throw new Error("物理资源必须来自本站");
  if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持物理编译器解压，请更换较新的浏览器");
  const compilerResponse = await fetch(new URL("physics-runtime/typst-compiler.gz.bin", base));
  if (!compilerResponse.ok || !compilerResponse.body) throw new Error("物理编译器加载失败");
  const compilerBytes = await new Response(compilerResponse.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const compilerHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", compilerBytes)), b => b.toString(16).padStart(2, "0")).join("");
  if (compilerHash !== "1fc968438a672366dfec39c96c842c26ed29caff4eb1bcaab19a6c60867de5fd") throw new Error("物理编译器校验失败");
  const archives = new Map<string, Uint8Array>();
  await Promise.all(packages.map(async ([name, expected]) => {
    const response = await fetch(new URL(`physics-packages/${name}.bin`, base));
    if (!response.ok) throw new Error(`物理资源加载失败：${name}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    if (actual !== expected) throw new Error(`物理资源校验失败：${name}`);
    archives.set(name, bytes);
  }));
  const memory = new MemoryAccessModel();
  class LocalRegistry extends FetchPackageRegistry {
    pullPackageData(spec: PackageSpec) { return spec.namespace === "preview" ? archives.get(`${spec.name}-${spec.version}`) : undefined; }
  }
  const typst = new TypstSnippet();
  typst.setCompilerInitOptions({ getModule: () => compilerBytes });
  typst.use(TypstSnippet.withAccessModel(memory), TypstSnippet.withPackageRegistry(new LocalRegistry(memory)));
  const compiler = await typst.getCompiler();
  compiler.addSource('/physics.typ', prepared.source);
  const output = await compiler.runWithWorld({ mainFilePath: '/physics.typ' }, async world => {
    await world.compile();
    return world.query({ selector: '<physics-result>', field: 'value' });
  });
  if (!Array.isArray(output) || output.length !== 1 || !verify(prepared.model, output[0])) throw new Error("物理计算结果未通过核对");
  return { result: output[0] as R, model: prepared.model, assumptions: prepared.assumptions };
}

export async function renderIncline(input: unknown, assetBase?: string) {
  const solved = await solvePrepared<SmoothInclineModel, { status: string; model: string; normal: number; acceleration: number; forces: PhysicsForce[] }>(makeInclineSource(input), verifyInclineResult, assetBase);
  return { ...solved, svg: inclineDiagram(solved.model, solved.result) };
}

export async function renderHanging(input: unknown, assetBase?: string) {
  const solved = await solvePrepared<HangingModel, { status: string; model: string; tension: number; forces: PhysicsForce[] }>(makeHangingSource(input), verifyHangingResult, assetBase);
  return { ...solved, svg: hangingDiagram(solved.model, solved.result) };
}

export async function renderCircuit(input: unknown, assetBase?: string) {
  const solved = await solvePrepared<CircuitModel, CircuitResult>(makeCircuitSource(input), verifyCircuitResult, assetBase);
  return { ...solved, svg: circuitDiagram(solved.model, solved.result) };
}
