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
  const { loadSettings, saveSettings, loadUiPrefs, saveUiPrefs, DEFAULT_PROXY_URL } = await import(pathToFileURL(outfile).href);
  assert.equal(loadSettings().proxyUrl, DEFAULT_PROXY_URL);
  storage.set('zxz.ui.v1', JSON.stringify({ grade: 'college', mode: 'unknown' }));
  assert.deepEqual(loadUiPrefs(), { grade: 'primary', mode: 'eli5', theme: 'light' });
  storage.set('zxz.ui.v1', JSON.stringify({ grade: 'senior', mode: 'socratic' }));
  assert.deepEqual(loadUiPrefs(), { grade: 'senior', mode: 'socratic', theme: 'light' });
  assert.equal(saveUiPrefs({ grade: 'senior', mode: 'socratic', theme: 'dark' }), true);
  assert.deepEqual(loadUiPrefs(), { grade: 'senior', mode: 'socratic', theme: 'dark' });
  saveSettings({ ...loadSettings(), proxyUrl: '', proxyExplicit: true });
  assert.equal(loadSettings().proxyUrl, '');
  saveSettings({ ...loadSettings(), proxyUrl: 'http://127.0.0.1:8787', proxyExplicit: true });
  assert.equal(loadSettings().proxyUrl, 'http://127.0.0.1:8787');
  const old = { ...loadSettings(), proxyUrl: '' };
  delete old.proxyExplicit;
  saveSettings(old);
  assert.equal(loadSettings().proxyUrl, DEFAULT_PROXY_URL);
  assert.equal(saveSettings(loadSettings()), true);
  // 兼容损坏存档：profile 里嵌套了整份 settings，根上又出现 gradeLevel/nickname 等对象。
  const good = loadSettings();
  const nested = {
    ...good,
    profile: { nickname: '阳阳', avatar: '🐼', onboarded: true, gradeLevel: '四年级' },
    providers: {
      ...good.providers,
      deepseek: { ...good.providers.deepseek, enabled: true, apiKey: 'sk-test-0123456789', defaultModel: 'deepseek-flash' },
    },
    proxyUrl: 'https://relay.oj-codes.com',
  };
  storage.set('zxz.settings.v1', JSON.stringify({ profile: nested, gradeLevel: nested, nickname: nested, onboarded: nested, providers: nested.providers, proxyUrl: nested.proxyUrl }));
  const repaired = loadSettings();
  assert.equal(repaired.profile.nickname, '阳阳');
  assert.equal(repaired.profile.gradeLevel, '四年级');
  assert.equal(repaired.profile.onboarded, true);
  assert.equal(repaired.profile.profile, undefined);
  assert.equal(repaired.providers.deepseek.apiKey, 'sk-test-0123456789');
  assert.equal(repaired.providers.deepseek.defaultModel, 'deepseek-flash');
  assert.equal(repaired.proxyUrl, 'https://relay.oj-codes.com');
  // providers/proxyUrl 只在嵌套对象里时也要能恢复。
  storage.set('zxz.settings.v1', JSON.stringify({ profile: nested }));
  const fromNested = loadSettings();
  assert.equal(fromNested.profile.nickname, '阳阳');
  assert.equal(fromNested.providers.deepseek.apiKey, 'sk-test-0123456789');
  assert.equal(fromNested.proxyUrl, 'https://relay.oj-codes.com');
  assert.equal(saveUiPrefs({ grade: 'primary', mode: 'eli5', theme: 'light' }), true);
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('storage blocked'); }, removeItem: () => {} };
  assert.equal(saveSettings(loadSettings()), false);
  assert.equal(saveUiPrefs({ grade: 'junior', mode: 'eli5', theme: 'light' }), false);
  console.log('proxy settings checks passed');
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
