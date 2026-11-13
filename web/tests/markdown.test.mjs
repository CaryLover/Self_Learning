import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "learning-markdown-"));
const outfile = join(dir, "markdown.cjs");
try {
  const bundle = await build({ entryPoints: ["src/lib/markdown.ts"], bundle: true, platform: "node", format: "cjs", loader: { ".css": "empty" }, write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { renderMarkdown } = (await import(pathToFileURL(outfile).href)).default;
  const literal = "%%ZXZMATH0%% 和 %%ZXZINLINE0%%";
  assert.match(renderMarkdown(literal), /%%ZXZMATH0%% 和 %%ZXZINLINE0%%/);
  const mixed = renderMarkdown(`${literal}，公式 $x+1$，代码 \`a<b\`。`);
  assert.match(mixed, /%%ZXZMATH0%% 和 %%ZXZINLINE0%%/);
  assert.match(mixed, /class="katex"/);
  assert.match(mixed, /<code>a&lt;b<\/code>/);
  const encoded = renderMarkdown('&#37;&#37;ZXZMATH0&#37;&#37; 和 $x+1$');
  assert.match(encoded, /%%ZXZMATH0%%/);
  assert.match(encoded, /class="katex"/);
  assert.doesNotMatch(renderMarkdown('<script>alert(1)</script>'), /<script>/);
  const links = 'www.example.com [外链](//example.com) ![图](//example.com/image.png) <mailto:test@example.com>';
  assert.match(renderMarkdown(links), /<a\b/);
  assert.match(renderMarkdown(links), /<img\b/);
  assert.doesNotMatch(renderMarkdown(links, { textOnly: true }), /<(?:a|img)\b/);
  console.log("markdown rendering checks passed");
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
