import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "public-assets-"));
const outfile = join(dir, "plugin.mjs");
try {
  const result = await build({ entryPoints: ["vite.public-assets.ts"], bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, result.outputFiles[0].contents);
  const { releasePublicAssets } = await import(pathToFileURL(outfile).href);
  const emitted = [];
  await releasePublicAssets().generateBundle.call({ emitFile: item => emitted.push(item.fileName) });
  assert.ok(emitted.includes('physics-fonts/NewCMMath-Regular.otf'));
  assert.ok(emitted.includes('physics-packages/typed-physics-0.3.0.bin'));
  assert.ok(!emitted.some(name => name.startsWith('__probe_build/') || name.startsWith('__typst_probe/')));
  const lean = [];
  await releasePublicAssets(false).generateBundle.call({ emitFile: item => lean.push(item.fileName) });
  assert.ok(!lean.some(name => name.startsWith('physics-fonts/') || name.startsWith('physics-packages/')));
  assert.ok(!lean.some(name => name.startsWith('__probe_build/') || name.startsWith('__typst_probe/')));
  console.log('public asset packaging checks passed');
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
