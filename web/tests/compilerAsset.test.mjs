import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import assert from "node:assert/strict";

const base = resolve(tmpdir());
const dir = resolve(await mkdtemp(join(base, "compiler-asset-test-")));
const rel = relative(base, dir);
if (!rel || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("测试目录不在临时目录内");
const cwd = process.cwd();
try {
  const outfile = join(dir, "plugin.mjs");
  const bundle = await build({ entryPoints: ["vite.compiler-asset.ts"], bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { compilerAsset } = await import(pathToFileURL(outfile).href);
  const fixture = join(dir, "node_modules", "@myriaddreamin", "typst-ts-web-compiler", "pkg");
  await mkdir(fixture, { recursive: true });
  await writeFile(join(fixture, "typst_ts_web_compiler_bg.wasm"), "wrong compiler");
  process.chdir(dir);
  let emitted = false;
  assert.throws(() => compilerAsset(true).generateBundle.call({ emitFile() { emitted = true; } }), /物理编译器版本或文件校验不匹配/);
  assert.equal(emitted, false);
  console.log("compiler asset integrity checks passed");
} finally {
  process.chdir(cwd);
  await rm(dir, { recursive: true, force: true });
}
