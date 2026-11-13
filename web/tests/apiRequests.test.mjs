import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "api-requests-"));
const outfile = join(dir, "api.mjs");
try {
  const bundle = await build({ entryPoints: ["src/lib/api.ts"], bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { chatRequest, ApiError } = await import(pathToFileURL(outfile).href);
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const text = await chatRequest({
    endpoint: "https://example.com/v1/chat/completions",
    apiKey: "test-key",
    model: "test-model",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    maxTokens: 1,
  });
  assert.equal(text, "ok");
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].max_tokens, 1);
  assert.equal(bodies[0].stream, false);

  globalThis.fetch = async () => new Response(JSON.stringify({ error: "insecure_target" }), { status: 400, headers: { "Content-Type": "application/json" } });
  await assert.rejects(
    chatRequest({ endpoint: "https://example.com/v1/chat/completions", apiKey: "test-key", model: "test-model", messages: [], stream: false }),
    (error) => error instanceof ApiError && error.status === 400 && /代理只允许 HTTPS/.test(error.message),
  );
  console.log("api request checks passed");
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
