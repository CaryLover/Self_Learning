# 本地开发指南

## 组件与端口

| 服务 | 命令 | 地址 |
|---|---|---|
| 前端 dev server | `cd web && npm run dev` | http://localhost:5173 |
| 转发代理（wrangler dev） | `cd worker && npm run dev` | http://127.0.0.1:8787 |
| 模拟厂商（无需真实 key） | `node dev/mock-vendor.mjs` | http://127.0.0.1:8791 |

项目中的代理配置将 `http://localhost:5173` 列为本地允许来源，但未列入 `http://127.0.0.1:5197` 等其他地址。使用默认线上代理调试时，可在 `web` 目录运行 `npm run dev -- --host localhost --port 5173 --strictPort`，然后打开 `http://localhost:5173/`。来源包含主机名和端口，`localhost` 与 `127.0.0.1` 不相同；它们的浏览器设置和 API key 也分别保存，需要在对应地址重新配置。实际线上代理的来源配置可能与项目文件不同，如仍失败，请检查代理的部署配置和界面错误信息。独立物理验证页使用的 5197 端口只用于模拟测试，不保证能调用线上代理。

> wrangler dev 启动时可用 `--var` 覆盖白名单做联调，例如放行本地模拟厂商：
> `npx wrangler dev --var "ALLOWED_HOSTS:127.0.0.1:8791" --var "ALLOWED_ORIGINS:http://localhost:5173"`

## 无 key 全流程体验（模拟厂商）

`dev/mock-vendor.mjs` 是一个 OpenAI 兼容的假厂商，会按系统提示词自动切换角色：

- 系统提示含「画图讲解」→ 返回讲解页 HTML（内嵌 SVG）
- 含「巩固练习」→ 返回练习题 JSON
- 含「苏格拉底」→ 返回引导提问 + 技能地图 JSON（流式）
- 收到【结束本次学习】→ 返回掌握报告 JSON

前端设置：代理 `http://127.0.0.1:8787`，SiliconFlow 地址改为 `http://127.0.0.1:8791/v1`，key 随意（≥10 字符）。

启动模拟厂商后，也可打开开发服务器的 `eli5-probe.html`。此页面使用模拟模型和一张测试图片，验证讲解及练习请求都包含图片，并检查讲解与练习是否生成；不调用真实模型，也不验证模型对图片内容的理解。

### 高中物理开发测试

物理入口仅在 Vite 开发模式可用，正式构建不会启用。将学段设为高中后，在看图讲解中输入：

```text
【物理测试】质量4 kg的物块在30°固定光滑斜面上，只受重力和支持力。重力加速度9.81 m/s²。
```

模拟厂商仅对上述完整条件返回固定样例，其余情况返回待复核。真实模型会根据题目提取候选条件，但题意、箭头及讲解仍需人工审核；该入口不是正式教学功能。使用照片、初中学段或不支持的物理关系会停在待复核状态。

还可测试固定竖直绳悬挂静止的模型：

```text
【物理测试】质量2 kg的物块用固定、竖直绷紧的绳悬挂并静止，物块只受重力和绳的拉力。重力加速度10 m/s²。
```

也可以运行 `dev/start-physics-probe.ps1`，打开显示的独立测试页。这是固定样例和模拟模型，检查浏览器编译、图文模板以及条件不足拦截，不调用厂商 API。用户在独立页看到通过，不代表所有物理题均已验证。

## 直连真实厂商（跳过代理调试）

浏览器直连仅对放行 CORS 的厂商可行（如 SiliconFlow 当前放行）。家长设置里**代理地址留空**即直连。
其余厂商必须走代理（服务端到服务端不受浏览器 CORS 约束）。
主动清空代理地址后，该直连选择会保留；旧版本中未主动设置过的空代理地址仍按原有迁移规则使用默认代理。

## 类型检查与构建

```bash
cd web && npm run typecheck && npm run build    # 前端
cd worker && npm run typecheck && npm run build # Worker dry-run 打包
npm run test:eli5 && npm run test:eli5-view && npm run test:proxy-settings # 在 web 目录检查讲解、恢复和代理设置
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
