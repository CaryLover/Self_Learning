import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "physics-worker-client-"));
const outfile = join(dir, "worker-client.mjs");
try {
  const bundle = await build({ entryPoints: ["src/lib/physics/workerClient.ts"], bundle: true, platform: "browser", format: "esm", define: { "import.meta.env.BASE_URL": '"/"' }, write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { renderPhysicsInWorker, PhysicsWorkerError } = await import(pathToFileURL(outfile).href);
  globalThis.window = { location: { href: "http://localhost/" } };
  let worker;
  globalThis.Worker = class {
    constructor() { worker = this; }
    postMessage() {}
    terminate() { this.terminated = true; }
  };
  const model = { kind: "hanging-at-rest" };
  const controller = new AbortController();
  const success = renderPhysicsInWorker(model, controller.signal);
  const value = { model, svg: "<svg/>", result: {}, assumptions: [] };
  worker.onmessage({ data: { ok: true, value } });
  assert.deepEqual(await success, value);
  assert.equal(worker.terminated, true);
  const failure = renderPhysicsInWorker(model, controller.signal);
  worker.onmessage({ data: { ok: false, error: "物理编译器加载失败" } });
  await assert.rejects(failure, error => error instanceof PhysicsWorkerError && error.message === "物理编译器加载失败");
  assert.equal(worker.terminated, true);

  const unreadable = renderPhysicsInWorker(model, controller.signal);
  worker.onmessageerror();
  await assert.rejects(unreadable, error => error instanceof PhysicsWorkerError && /无法读取/.test(error.message));
  assert.equal(worker.terminated, true);

  const cancelled = new AbortController();
  const pending = renderPhysicsInWorker(model, cancelled.signal);
  cancelled.abort();
  await assert.rejects(pending, error => error.name === "AbortError" && !(error instanceof PhysicsWorkerError));
  assert.equal(worker.terminated, true);

  globalThis.Worker = class {
    constructor() { worker = this; }
    postMessage() { throw new Error("invalid data"); }
    terminate() { this.terminated = true; }
  };
  await assert.rejects(renderPhysicsInWorker(model, new AbortController().signal), error => error instanceof PhysicsWorkerError && /无法向物理工具发送/.test(error.message));
  assert.equal(worker.terminated, true);

  globalThis.Worker = class { constructor() { throw new Error("worker unavailable"); } };
  await assert.rejects(renderPhysicsInWorker(model, new AbortController().signal), error => error instanceof PhysicsWorkerError && /后台线程启动失败/.test(error.message));
  console.log("physics worker error checks passed");
} finally {
  delete globalThis.window;
  delete globalThis.Worker;
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
