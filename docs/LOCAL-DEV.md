# 本地开发指南

## 组件与端口

| 服务 | 命令 | 地址 |
|---|---|---|
| 前端 dev server | `cd web && npm run dev` | http://localhost:5173 |
| 转发代理（wrangler dev） | `cd worker && npm run dev` | http://127.0.0.1:8787 |
| 模拟厂商（无需真实 key） | `node dev/mock-vendor.mjs` | http://127.0.0.1:8791 |

> wrangler dev 启动时可用 `--var` 覆盖白名单做联调，例如放行本地模拟厂商：
> `npx wrangler dev --var "ALLOWED_HOSTS:127.0.0.1:8791" --var "ALLOWED_ORIGINS:http://localhost:5173"`

## 无 key 全流程体验（模拟厂商）

`dev/mock-vendor.mjs` 是一个 OpenAI 兼容的假厂商，会按系统提示词自动切换角色：

- 系统提示含「画给孩子看」→ 返回讲解页 HTML（内嵌 SVG）
- 含「巩固练习」→ 返回练习题 JSON
- 含「苏格拉底」→ 返回引导提问 + 技能地图 JSON（流式）
- 收到【结束本次学习】→ 返回掌握报告 JSON

前端设置：代理 `http://127.0.0.1:8787`，SiliconFlow 地址改为 `http://127.0.0.1:8791/v1`，key 随意（≥10 字符）。

## 直连真实厂商（跳过代理调试）

浏览器直连仅对放行 CORS 的厂商可行（如 SiliconFlow 当前放行）。家长设置里**代理地址留空**即直连。
其余厂商必须走代理（服务端到服务端不受浏览器 CORS 约束）。

## 类型检查与构建

```bash
cd web && npm run typecheck && npm run build    # 前端
cd worker && npm run typecheck && npm run build # Worker dry-run 打包
```

## 关键实现速览

| 模块 | 位置 | 说明 |
|---|---|---|
| SSE 解析 | `web/src/lib/api.ts` | fetch + ReadableStream，逐行解析 `data:`，忽略 `reasoning_content` |
| 协议块 | `web/src/lib/extract.ts` | `@@SKILLMAP@@` / `@@REPORT@@` + ```json 围栏的拆分与容错解析 |
| 上下文截断 | `web/src/lib/context.ts` | 首轮主题锚定 + 最近 N 轮，字符预算默认 14000 |
| 提示词 | `web/src/prompts/` | 学段参数（语气/深度/难度边界）；底线规则为最高优先级 |
| Markdown+KaTeX | `web/src/lib/markdown.ts` | 自研数学预处理器（`$...$`/`$$...$$`/`\(...\)`/`\[...\]`），价格防误判 |
| 会话存储 | `web/src/lib/db.ts` | IndexedDB（刷新续学）；设置在 localStorage `zxz.settings.v1` |
| 沙箱讲解页 | `web/src/components/Eli5View.tsx` | `<iframe sandbox="" srcDoc>`，禁脚本禁同源 |
| 代理 | `worker/src/index.ts` | Origin/Host 白名单、每 IP 限流、SSE 透传，不读不存 key |
