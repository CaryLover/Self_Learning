import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "chat-a11y-"));
const outfile = join(dir, "chat.cjs");
try {
  const bundle = await build({
    stdin: {
      contents: `export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'; export { ChatView } from './src/components/ChatView.tsx'; export { MessageBubble } from './src/components/MessageBubble.tsx';`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    outfile,
    loader: { ".css": "empty" },
  });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { createElement, renderToStaticMarkup, ChatView, MessageBubble } = (await import(pathToFileURL(outfile).href)).default;

  const renderChat = (props) =>
    renderToStaticMarkup(
      createElement(ChatView, {
        messages: [],
        streamText: "",
        busy: false,
        reportBusy: false,
        skillMap: undefined,
        report: undefined,
        showMap: false,
        reportMeta: {},
        onEnd() {},
        onStop() {},
        ...props,
      }),
    );

  const streaming = renderChat({ busy: true, streamText: "老师正在说" });
  assert.match(streaming, /role="log"/);
  assert.match(streaming, /aria-busy="true"/);
  assert.match(streaming, /老师正在回复/);
  assert.match(streaming, /class="msg-row assistant" aria-hidden="true"/);
  assert.doesNotMatch(streaming, /正在思考/);

  const thinking = renderChat({ busy: true });
  assert.match(thinking, /老师正在思考/);
  assert.doesNotMatch(thinking, /class="dots"/);

  const idle = renderChat({
    messages: [{ id: "m1", role: "assistant", content: "先说说你的想法。", ts: 1 }],
  });
  assert.match(idle, /aria-busy="false"/);
  assert.doesNotMatch(idle, /老师正在回复|老师正在思考/);
  assert.doesNotMatch(idle, /class="msg-row assistant" aria-hidden="true"/);
  assert.match(idle, /先说说你的想法/);

  const image = renderToStaticMarkup(
    createElement(MessageBubble, {
      msg: { id: "m2", role: "user", content: "", images: ["data:image/png;base64,AA=="], ts: 2 },
    }),
  );
  assert.match(image, /alt="附图 1"/);

  console.log("chat accessibility checks passed");
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir).catch(() => {});
}
