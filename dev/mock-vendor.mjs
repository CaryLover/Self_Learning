/**
 * 本地模拟厂商（OpenAI 兼容）—— 无需真实 API key 的本地联调用。
 *
 *   node dev/mock-vendor.mjs            # 默认 127.0.0.1:8791
 *   PORT=8791 node dev/mock-vendor.mjs
 *
 * 行为规则（按系统提示词内容自动切换角色）：
 *   - 系统提示含「画图讲解」→ 返回 ```html 讲解页
 *   - 系统提示含「巩固练习」 → 返回练习题 JSON
 *   - 系统提示含「苏格拉底」且消息含【结束本次学习】→ 返回 @@REPORT@@ JSON
 *   - 系统提示含「苏格拉底」 → 返回引导话术 + @@SKILLMAP@@ JSON（流式）
 *   - 其余 → 普通文本回复
 * 所有响应带 CORS 头，浏览器可直连（便于前端单独调试）。
 */

import http from "node:http";

const PORT = Number(process.env.PORT || 8791);

let lastSystemPrompt = "";
let lastMessageCount = 0;
let lastImageParts = 0;
const recentRequests = []; // 最近几次请求的摘要（联调验证用）

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
};

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...CORS });
  res.end(JSON.stringify(obj));
}

const ELI5_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><style>
body{font-family:sans-serif;background:#fff6ea;color:#4a3520;max-width:860px;margin:0 auto;padding:24px}
h1{color:#f2711c}svg{width:100%;height:auto;background:#ffe8d6;border-radius:16px}
li{margin:8px 0;font-size:18px}</style></head>
<body><h1>为什么先乘除后加减？</h1>
<svg viewBox="0 0 400 200"><rect x="10" y="10" width="180" height="80" rx="12" fill="#ffb703"/>
<text x="100" y="55" text-anchor="middle" font-size="20">先算乘除</text>
<rect x="210" y="10" width="180" height="80" rx="12" fill="#8ecae6"/>
<text x="300" y="55" text-anchor="middle" font-size="20">再算加减</text>
<rect x="10" y="110" width="380" height="70" rx="12" fill="#fb8500"/>
<text x="200" y="150" text-anchor="middle" font-size="18" fill="#fff">乘除是"打包"，加减是"收货"</text></svg>
<ul><li>乘法是把相同的东西打包。</li><li>先把包打好，再数总数。</li><li>所以 2+3×4 = 2+12 = 14。</li></ul>
<p>一句话：先打包，再收货！</p></body></html>`;

const PRACTICES = [
  { question: "计算：3 + 4 × 2 = ？", difficulty: "持平", answer: "11", analysis: "先算 4×2=8，再加 3。" },
  { question: "小明买了 2 支 5 元的笔和 1 本 12 元的书，一共花了多少钱？", difficulty: "进阶", answer: "22 元", analysis: "先算笔：2×5=10，再加书 12 元。" },
  { question: "把 20 - 6 ÷ 2 × 3 按正确顺序算出来。", difficulty: "培优", answer: "11", analysis: "先除后乘：6÷2=3，3×3=9，20-9=11。注意乘除从左到右。" },
];

const SKILLMAP = {
  topic: "先乘除后加减",
  overall: 20,
  skills: [
    { name: "知道运算顺序规则", level: 1, focus: true },
    { name: "会算同级从左到右", level: 0 },
    { name: "有小括号的处理", level: 0 },
    { name: "混合运算应用题", level: 0 },
  ],
};

function socraticReply(history) {
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  if (lastUser.includes("【结束本次学习】")) {
    return (
      "@@REPORT@@\n```json\n" +
      JSON.stringify({
        knowledge: [
          {
            name: "运算顺序（先乘除后加减）",
            score: 55,
            status: "能复述规则，但在混合运算中偶尔出错",
            advice: "每天做 3 道两级混合运算，重点练乘除从左到右",
          },
        ],
      }) +
      "\n```"
    );
  }
  return `好问题！我们先做个小探测：你觉得 2 + 3 × 4 应该等于 20 还是 14？为什么？\n@@SKILLMAP@@\n\`\`\`json\n${JSON.stringify(SKILLMAP)}\n\`\`\``;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // 调试端点：回显最近一次请求的系统提示词（仅本地联调使用）
  if (url.pathname === "/__last-prompt") {
    return json(res, 200, {
      system: lastSystemPrompt,
      messageCount: lastMessageCount,
      imageParts: lastImageParts,
      recentRequests,
    });
  }

  const auth = req.headers.authorization ?? "";
  const hasKey = auth.startsWith("Bearer ") && auth.length > 10;

  if (url.pathname.endsWith("/models")) {
    if (!hasKey) return json(res, 401, { error: { message: "missing api key" } });
    return json(res, 200, {
      data: [{ id: "mock-chat-mini" }, { id: "mock-chat-plus" }, { id: "mock-vl-mini" }, { id: "mock-embed" }],
    });
  }

  if (url.pathname.endsWith("/chat/completions") && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      if (!hasKey) return json(res, 401, { error: { message: "missing api key" } });
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        return json(res, 400, { error: { message: "bad json" } });
      }
      const sys = parsed.messages?.find((m) => m.role === "system")?.content ?? "";
      const history = parsed.messages ?? [];
      lastSystemPrompt = sys;
      lastMessageCount = history.length;
      // 统计多模态图片片段数量（用于联调验证）
      lastImageParts = history.reduce((n, m) => {
        if (!Array.isArray(m.content)) return n;
        return n + m.content.filter((p) => p && p.type === "image_url").length;
      }, 0);
      recentRequests.push({
        imageParts: lastImageParts,
        messages: history.length,
        systemMentionsImages: /关于图片|图片输入/.test(sys),
        stream: !!parsed.stream,
      });
      if (recentRequests.length > 10) recentRequests.shift();

      let reply;
      if (sys.includes("画图讲解")) reply = "```html\n" + ELI5_HTML + "\n```";
      else if (sys.includes("巩固练习")) reply = "```json\n" + JSON.stringify(PRACTICES) + "\n```";
      else if (sys.includes("苏格拉底")) reply = socraticReply(history);
      else reply = "你好！我是模拟厂商。";

      if (parsed.stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          ...CORS,
        });
        // 分片流式输出
        const pieces = reply.match(/[\s\S]{1,18}/g) ?? [];
        for (const p of pieces) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
          await new Promise((r) => setTimeout(r, 15));
        }
        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        json(res, 200, { choices: [{ message: { content: reply } }] });
      }
    });
    return;
  }

  json(res, 404, { error: { message: "not found" } });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock vendor listening on http://127.0.0.1:${PORT}`);
});
