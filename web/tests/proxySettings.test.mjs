import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "proxy-settings-"));
const outfile = join(dir, "store.mjs");
try {
  const bundle = await build({ entryPoints: ["src/lib/store.ts"], bundle: true, platform: "node", format: "esm", define: { "import.meta.env.VITE_DEFAULT_PROXY_URL": "undefined" }, write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const { loadSettings, saveSettings, DEFAULT_PROXY_URL } = await import(pathToFileURL(outfile).href);
  assert.equal(loadSettings().proxyUrl, DEFAULT_PROXY_URL);
  saveSettings({ ...loadSettings(), proxyUrl: '', proxyExplicit: true });
  assert.equal(loadSettings().proxyUrl, '');
  saveSettings({ ...loadSettings(), proxyUrl: 'http://127.0.0.1:8787', proxyExplicit: true });
  assert.equal(loadSettings().proxyUrl, 'http://127.0.0.1:8787');
  const old = { ...loadSettings(), proxyUrl: '' };
  delete old.proxyExplicit;
  saveSettings(old);
  assert.equal(loadSettings().proxyUrl, DEFAULT_PROXY_URL);
  console.log('proxy settings checks passed');
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
