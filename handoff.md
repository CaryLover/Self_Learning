# 自学小站 · 项目交接文档（handoff.md）

> 用途：交接给其他 AI 助手（如 ChatGPT）继续开发/设计。请先完整阅读本文再动手。
> 更新日期：2026-11-12

---

## 1. 项目是什么

「自学小站」是一个面向 K12 全科的免费 AI 自学网站，两种学习模式：

- **🎨 看图讲解（ELI5）**：孩子输入题目/知识点，模型生成"大图+少字"的 HTML 讲解页（内嵌 SVG、无脚本），在 `sandbox` iframe 中渲染；随后自动生成 3~5 道练习题（持平→进阶→培优，答案折叠）。
- **🧑‍🏫 苏格拉底辅导**：诊断 → 技能地图（0-5 级可视化）→ 一次一问的辅导循环 → 间隔复习 → 结业测评 → 掌握报告（0-100 分）。**铁律：任何情况下不直接给答案。**

**免费**：网站零服务器成本（Cloudflare 免费层）；模型费用由家长自己的 API key 承担（BYOK），key 只存浏览器 localStorage。

### 线上信息（生产环境）

| 项 | 值 |
|---|---|
| 网站 | https://zixue.oj-codes.com |
| 转发代理 | https://relay.oj-codes.com |
| 旧地址（仍可用） | zixue-xiaozhan.pages.dev / zixue-relay.lukasaoka2018.workers.dev |
| Pages 项目名 | `zixue-xiaozhan` |
| Worker 名 | `zixue-relay` |
| CF 账户 ID | `6506c2778404062aa3ba503e067f6979` |
| 域名 zone ID | `4ac08b1caf4e2ab292f3c24bdfc97536`（oj-codes.com） |

---

## 2. 目录与文件

```
D:\老树屿陆\AI课程的构建\自学程序\
├── 自学小站-v1.0开发计划.md   # 需求源头，先读这个
├── handoff.md                 # 本文
├── web/                       # 前端（Vite + React + TS）
│   └── src/
│       ├── App.tsx            # 路由(hash)、顶栏、首次引导弹窗编排
│       ├── main.tsx           # 入口；import Tabler 图标字体
│       ├── components/
│       │   ├── LearnView.tsx          # 学习页主编排（两种模式的调用逻辑都在这里，约 900 行）
│       │   ├── ChatView.tsx           # 苏格拉底聊天 + 侧栏(技能地图/结束按钮)
│       │   ├── Eli5View.tsx           # 讲解页 iframe + 练习卡片
│       │   ├── SettingsView.tsx       # 「系统设置」页（单元一孩子信息 + 单元二厂商/API）
│       │   ├── OnboardingDialog.tsx   # 首次进入的强制信息确认弹窗
│       │   ├── MessageBubble.tsx / SkillMapPanel.tsx / PracticeCards.tsx / MasteryReportCard.tsx
│       ├── lib/
│       │   ├── api.ts        # fetch + SSE 解析、错误映射、测试/拉模型
│       │   ├── providers.ts  # 7 家厂商预置（端点/key 提示/内置模型清单）
│       │   ├── store.ts      # localStorage 设置；DEFAULT_PROXY_URL 在这里
│       │   ├── vision.ts     # 多模态模型名判断 + 图片压缩；effectiveVision 支持手动覆盖
│       │   ├── grade.ts      # 年级清单 + curriculumRule()（防超纲约束文案）
│       │   ├── context.ts    # 上下文截断（首轮锚定 + 最近轮）
│       │   ├── markdown.ts   # markdown-it + KaTeX（自研 $...$ 预处理器）
│       │   ├── extract.ts    # 协议块拆分(@@SKILLMAP@@/@@REPORT@@) + JSON 容错
│       │   ├── encourage.ts  # 鼓励贴纸/每日一句
│       │   ├── db.ts         # IndexedDB 会话
│       │   └── types.ts / id.ts
│       ├── prompts/
│       │   ├── eli5.ts       # 两段式（讲解 HTML + 练习 JSON）
│       │   └── socratic.ts   # 系统提示词（底线规则置顶、图片输入说明、报告评分硬规则）
│       └── themes/index.css  # 唯一的样式文件（约 3200 行，全部视觉在这里）
├── worker/                    # CF Workers 转发代理
│   ├── src/index.ts           # Origin/主机白名单 + 限流 + SSE 透传，不读不存 key
│   └── wrangler.toml          # ALLOWED_ORIGINS 等
├── dev/mock-vendor.mjs        # 本地模拟厂商（无 key 联调；/__last-prompt 回显最近请求）
├── docs/                      # DEPLOY.md / LOCAL-DEV.md / security/(注入证据)
└── README.md
```

---

## 3. 构建与部署命令（Windows / Git Bash）

```bash
# 前端类型检查 + 构建
cd web && npm run build          # = tsc --noEmit && vite build

# 部署前端（自动同步 Cloudflare）
cd web && npx wrangler pages deploy dist --project-name zixue-xiaozhan --branch main

# Worker 类型检查 / 打包 / 部署
cd worker && npx tsc --noEmit
cd worker && npx wrangler deploy --dry-run --outdir dist
cd worker && npx wrangler deploy

# 本地三件套联调（无需真实 key）
node dev/mock-vendor.mjs                                        # 127.0.0.1:8791
cd worker && npx wrangler dev --var "ALLOWED_HOSTS:127.0.0.1:8791" --var "ALLOWED_ORIGINS:http://localhost:5173"
cd web && npm run dev                                           # localhost:5173
# 前端设置里：代理填 http://127.0.0.1:8787，厂商地址改 http://127.0.0.1:8791/v1，key 随意(≥10字符)
```

---

## 4. 当前视觉系统（v3 + 扁平化，round 25）

**核心概念「一店三装，学段即人格」**：三学段共享同一套结构，靠色板区分人格（token 都在 `themes/index.css` 顶部的 `html[data-grade=...]` 块）：

| | 小学 primary | 初中 junior | 高中 senior |
|---|---|---|---|
| paper | `#fff9ee` 暖奶白 | `#f3faf7` 薄荷 | `#fafafa` 纯白 |
| accent | `#ff7a3c` 珊瑚橙（辅 `#25b8a5`） | `#0e9f7e` 青绿 | `#18181b` 墨黑 |
| radius | 16/22 | 11/15 | 6/8 |

**已按 front-art-design 技能执行的约束（不要回退）**：
- UI 图标一律 Tabler 线性 webfont（`<i class="ti ti-xxx">`，已在 main.tsx import），**不允许再往 UI chrome 里加 emoji**；仅儿童向"内容"（鼓励贴纸、头像、✅/❌ 状态）可用 emoji。
- 字重只有 **400 / 500** 两档。
- 扁平：无硬投影、无渐变、无纹理图案、无旋转/位移装饰；1px 边框；焦点圈（`box-shadow: 0 0 0 3px`）保留。
- **未做暗色模式**（面向儿童的产品，有意暂缓）。

**布局要点**：模式切换在顶部 modelbar；模型选择在输入框底栏（Codex 式 composer-box）；侧栏只读显示学段；顶栏右侧 = 40px 圆头像+昵称（无胶囊）+ 46px 齿轮图标按钮。

---

## 5. 关键业务协议（改代码前必读）

1. **苏格拉底回复协议**：模型每次回复末尾输出 `@@SKILLMAP@@` + ```json 围栏（含全部子技能、level 0-5、focus 标记）；前端 `splitProtocolBlock` 剥离后渲染。收到「【结束本次学习】」输出 `@@REPORT@@` + ```json。
2. **报告评分硬规则**（round 20）：无作答证据时 score 必须 0~10、status 以「未作答，无法评定」开头；前端在 0 次作答时点结束会先 `confirm()`。
3. **底线**：苏格拉底绝不直接给答案（提示词最高优先级区块）。
4. **防超纲**：`grade.ts` 的 `curriculumRule(grade, gradeLevel)` 注入两种模式的系统提示词（小学禁方程、初中禁高中内容、高中禁大学内容）。
5. **多模态**：`vision.ts` 按模型名判断 + 设置页"眼睛"图标手动覆盖（存 `models[id].vision`）；图片压缩最长边 1280 JPEG；Ctrl+V 粘贴与 📎 选择共用 `addFiles()`。
6. **代理安全**：Worker 白名单（Origin + 主机域名）；前端 `buildRequestUrl` 把目标 URL 编码进 `?u=` 参数。

---

## 6. 已知事项 / 待办

- **CF 账号曾在 2026-09 被入侵**（恶意 Worker 路由注入盗币脚本），已清除。用户被建议：改密码、开 2FA、审计 API token、轮换模型 key——**不确定用户是否已全部完成，交接时可在对话中提醒**。
- 暗色模式未做（有意暂缓）。
- 曾出现"沉浸式翻译插件"注入按钮干扰布局 → 建议用户把本站加入插件忽略名单。
- v1.1 候选（计划文档 §3.5）：拍题 OCR、语音输入、家长管控、多档案、在线批改、报告导出、用量统计。

---

## 7. 给接手者的提示（踩过的坑）

1. **CDN 缓存**：部署后立即用 `?cb=时间戳` 或 Ctrl+F5 验证；curl 拿到的 HTML 是新的但浏览器可能仍渲染旧 bundle。
2. **僵尸 vite**：5173 端口可能有旧进程（HMR 表现"没生效"）——`netstat -ano | grep :5173` 找 PID `taskkill //PID x //F`，或用 `curl localhost:5173/src/<file>` 直接看实际服务的源码。
3. **正则批量改 CSS 有风险**：一次"扁平化"正则把三个学段的 token 块合并成了一个（后值覆盖前值 → 全站变 senior 黑）。批量改 CSS 后必须用浏览器 computed style 按学段逐一验证。
4. **本会话模型无图像输入**：视觉验收靠 computed style + DOM 检查，截图存于 `C:\Users\Lu Chunrui\.zcode\cli\artifacts\...`；有视觉能力的模型可直接看这些截图快速复核。
5. **视觉复验路径**：`zxz.ui.v1` 里改 grade（primary/junior/senior）→ reload 即可切换主题；`zxz.settings.v1` 里 profile/providers 控制档案与模型。
6. **部署后字符串校验**：`curl 站点 | grep -o 'assets/index-*.js'` 拿新 bundle 名，再 `curl bundle | grep -c 关键词` 确认上线。
