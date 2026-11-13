import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const base = resolve(tmpdir());
const dir = resolve(await mkdtemp(join(base, "physics-preview-build-")));
const pathFromBase = relative(base, dir);
if (!pathFromBase || pathFromBase === ".." || pathFromBase.startsWith(`..${sep}`)) throw new Error("测试目录不在临时目录内");
try {
  for (const enabled of [false, true]) {
    const output = join(dir, enabled ? "preview" : "default");
    const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--outDir", output, "--emptyOutDir"], { cwd: process.cwd(), env: { ...process.env, VITE_ENABLE_PHYSICS: String(enabled) }, encoding: "utf8", timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`构建失败：${result.stderr || result.stdout || result.error?.message}`);
    const assets = await readdir(join(output, "assets"));
    const worker = assets.some(name => name.startsWith("physics.worker-"));
    const lesson = assets.some(name => name.startsWith("eli5Explain-"));
    const compiler = join(output, "physics-runtime", "typst-compiler.gz.bin");
    const compilerStat = await stat(compiler).catch(() => null);
    const fontsStat = await stat(join(output, "physics-fonts")).catch(() => null);
    const packagesStat = await stat(join(output, "physics-packages")).catch(() => null);
    assert.equal(worker, enabled);
    assert.equal(lesson, enabled);
    assert.equal(!!compilerStat, enabled);
    assert.equal(!!fontsStat, enabled);
    assert.equal(!!packagesStat, enabled);
    if (compilerStat) {
      assert.ok(compilerStat.size < 25 * 1024 * 1024);
      const prefix = await readFile(compiler);
      assert.equal(prefix[0], 0x1f);
      assert.equal(prefix[1], 0x8b);
      assert.equal(createHash('sha256').update(gunzipSync(prefix)).digest('hex'), '1fc968438a672366dfec39c96c842c26ed29caff4eb1bcaab19a6c60867de5fd');
      assert.ok((await stat(join(output, 'physics-packages', 'typed-physics-0.3.0.bin'))).isFile());
      assert.ok((await stat(join(output, 'physics-fonts', 'NewCMMath-Regular.otf'))).isFile());
      const probe = spawnSync(process.execPath, ['tests/typstProbe.mjs'], { cwd: process.cwd(), env: { ...process.env, PHYSICS_COMPRESSED_PROBE: '1', PHYSICS_COMPRESSED_PATH: compiler }, encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
      if (probe.status !== 0) throw new Error(`压缩编译器验证失败：${probe.stderr || probe.stdout || probe.error?.message}`);
    }
  }
  console.log("physics preview build checks passed");
} finally {
  await rm(dir, { recursive: true, force: true });
}
