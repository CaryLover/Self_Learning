import { stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = '../dev/probe-build-compressed';
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (entry.isFile()) assert.ok((await stat(path)).size <= 25 * 1024 * 1024, `Asset too large: ${path}`);
  }
}
await check(root);
const run = spawnSync(process.execPath, ['tests/typstProbe.mjs'], { stdio: 'inherit', env: { ...process.env, PHYSICS_COMPRESSED_PROBE: '1' } });
assert.equal(run.status, 0, 'Compressed compiler failed the physics probe');
console.log('compressed physics asset checks passed');
