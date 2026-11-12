/// <reference types="vite/client" />
import { TypstSnippet } from "@myriaddreamin/typst.ts/contrib/snippet";
import { loadFonts } from "@myriaddreamin/typst.ts";
import { MemoryAccessModel } from "@myriaddreamin/typst.ts/fs/memory";
import { FetchPackageRegistry } from "@myriaddreamin/typst.ts/fs/package";
import type { PackageSpec } from "@myriaddreamin/typst.ts/internal.types";
import rendererWasm from "@myriaddreamin/typst-ts-renderer/wasm?url";
import { makeInclineSource, verifyInclineResult } from "./typedSource";
import { makeHangingSource, verifyHangingResult, type HangingModel } from "./hanging";
import type { SmoothInclineModel } from "./model";
import type { PhysicsForce } from "./pipeline";

const packages = [
  ["typed-physics-0.3.0", "077c7e6adfb1df71e6246d399809f2e84f4cff6548a932801184a8779a016e22"],
  ["cetz-0.5.2", "77cf8490114ae04c6e665a11efa691d284a0cadb9719771b5708c1197292f23f"],
  ["oxifmt-1.0.0", "7d17a1fc8ad01740ec3cb2b03c7360a4225ff9318e5710765fa98ea6fd59594f"],
] as const;

/** 原型 API：调用方必须提供可合法分发、包含数学字体的同源字体。 */
async function renderPrepared<T extends SmoothInclineModel | HangingModel, R>(prepared: { source: string; model: T; assumptions: string[] }, verify: (model: T, value: unknown) => boolean, fontUrls: string[], families: { text: string; math: string }, assetBase?: string) {
  if (!fontUrls.length) throw new Error("缺少用于物理图的字体");
  if (![families.text, families.math].every(value => /^[A-Za-z0-9 -]{1,80}$/.test(value))) throw new Error("字体名称无效");
  const fonts = fontUrls.map(value => {
    const url = new URL(value, globalThis.location.href);
    if (url.origin !== globalThis.location.origin) throw new Error("字体必须来自本站");
    return url.href;
  });
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
  typst.setCompilerInitOptions({ getModule: () => compilerBytes, beforeBuild: [loadFonts(fonts, { assets: false })] });
  typst.setRendererInitOptions({ getModule: () => rendererWasm });
  typst.use(TypstSnippet.withAccessModel(memory), TypstSnippet.withPackageRegistry(new LocalRegistry(memory)));
  const source = `#set page(width: auto, height: auto, margin: 10pt)\n#set text(font: "${families.text}")\n#show math.equation: set text(font: "${families.math}")\n` + prepared.source;
  const svg = await typst.svg({ mainContent: source });
  const compiler = await typst.getCompiler();
  compiler.addSource('/physics.typ', source);
  const output = await compiler.runWithWorld({ mainFilePath: '/physics.typ' }, async world => {
    await world.compile();
    return world.query({ selector: '<physics-result>', field: 'value' });
  });
  if (!Array.isArray(output) || output.length !== 1 || !verify(prepared.model, output[0])) throw new Error("物理计算结果未通过核对");
  return { svg, result: output[0] as R, model: prepared.model, assumptions: prepared.assumptions };
}

/** 原型 API：调用方必须提供可合法分发、包含数学字体的同源字体。 */
export async function renderIncline(input: unknown, fontUrls: string[], families: { text: string; math: string }, assetBase?: string) {
  return renderPrepared<SmoothInclineModel, { status: string; model: string; normal: number; acceleration: number; forces: PhysicsForce[] }>(makeInclineSource(input), verifyInclineResult, fontUrls, families, assetBase);
}

export async function renderHanging(input: unknown, fontUrls: string[], families: { text: string; math: string }, assetBase?: string) {
  return renderPrepared<HangingModel, { status: string; model: string; tension: number; forces: PhysicsForce[] }>(makeHangingSource(input), verifyHangingResult, fontUrls, families, assetBase);
}
