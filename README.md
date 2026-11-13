# 🌱 自学小站

面向 **K12 全科**孩子的免费 AI 自学网站：输入题目或知识点，用两种方式辅助自学——

- **🎨 ELI5 看图讲解**（讲懂）：模型生成"大图 + 少字"的卡通讲解页（内嵌 SVG），再自动出 3~5 道巩固练习（持平 → 进阶 → 培优，附折叠的参考答案与解析）。
- **🧑‍🏫 苏格拉底辅导**（练会）：诊断起点 → 技能地图（0-5 级可视化）→ 一次一问的辅导循环 → 间隔复习 → 结业测评 → **掌握报告**。**任何情况下不直接给答案**，只引导孩子自己想出来。

**免费**：网站零服务器成本（Cloudflare 免费层托管），模型调用费用由**家长自己的 API key**承担（BYOK），家长按厂商定价自行控制成本。

## 目录结构

```
自学程序/
├── web/                  # 前端（Vite + React + TS，静态站点）
│   └── src/
│       ├── components/   # 聊天、技能地图、掌握报告、讲解页、练习卡片、家长设置
│       ├── lib/          # SSE 客户端、模型管理、localStorage/IndexedDB、上下文截断
│       ├── prompts/      # ELI5 两段式 + 苏格拉底提示词（中文化，含学段参数）
│       └── themes/       # 小学/初中/高中三套主题（CSS 变量）
├── worker/               # Cloudflare Workers 无状态转发代理（开源可审计）
├── dev/                  # 本地联调工具（模拟厂商，无需真实 key）
├── docs/                 # 部署与本地开发指南
└── 自学小站-v1.0开发计划.md
```

## 快速开始（本地体验）

```bash
# 1. 启动模拟厂商（无需真实 API key）
node dev/mock-vendor.mjs

# 2. 启动转发代理
cd worker && npm install && npm run dev     # http://127.0.0.1:8787

# 3. 启动前端
cd web && npm install && npm run dev        # http://localhost:5173
```

打开 http://localhost:5173 → 家长设置 → 代理地址填 `http://127.0.0.1:8787` →
SiliconFlow 卡片启用、地址改为 `http://127.0.0.1:8791/v1`、key 随便填 → 返回学习页即可体验完整流程。

接入真实厂商时，把厂商地址改回预置地址、填入真实 key 即可。详见 [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md)。

## 上线部署

见 [docs/DEPLOY.md](docs/DEPLOY.md)：Cloudflare Pages（前端）+ Workers（代理），全部免费层即可。

## 安全设计

- **密钥与请求**：API key 保存在本机浏览器的 localStorage，可随时删除。调用模型时，密钥随请求发送给所选模型服务；配置代理时，请求会先经过代理。
- **代理转发**：项目提供的 Worker 转发授权头和请求内容；源码中的日志不记录密钥或对话正文。代理拒绝非本机目标的明文 HTTP，避免授权头明文传输；本地联调仍允许 127.0.0.1/localhost。自行配置其他代理或模型服务时，应了解其数据处理方式。
- **防滥用**：Worker 校验 Origin 白名单；配置白名单后，缺少 Origin 的请求也会被拒绝；并提供基于单个运行实例内存的尽力限流。这些措施不能代替认证或全局限流。
- **讲解页沙箱**：模型生成的 HTML 在禁用脚本的 `sandbox` iframe 中渲染，资源策略限制远程子资源加载。

## 厂商支持（7 家预置）

DeepSeek / 智谱 GLM / Moonshot Kimi / MiniMax / 通义 DashScope / SiliconFlow（推荐默认）/ ModelScope。
全部走 OpenAI 兼容接口；GLM 提供内置模型清单兜底，ModelScope 测试按钮用 1-token 对话实现。
