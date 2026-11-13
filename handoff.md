# 自学小站 · 项目交接文档（handoff.md）

> **最新交接：2026-11-13。** 本节反映当前工作区；下方保留了 2026-11-12 的历史交接，若有冲突，以本节、当前代码及用户最新要求为准。请先读完整个最新交接，再查看 `ELI5与物理融合修改计划.md`、`docs/physics-probe.md` 和实际代码。

## 最新交接：目标、状态和接手步骤

### 1. 用户的真实目标与协作要求

- 这是面向小学、初中、高中的**全科自学网站**。用户希望融合两项能力：由 ELI5 组织通俗易懂、以图为主的讲解；由 typed-physics 在其确实支持的条件下负责计算和绘图。将核对后的工具事实交给 ELI5 讲解。不要把项目演变成穷举物理题、不断追加专门题库的项目。
- 不能声称网站的提示词会在运行时调用本机 ELI5 技能。项目是依据可见技能定义构造提示词与产品流程；不同模型和生成过程无法保证结果逐字相同。
- 苏格拉底模式、各学科普通讲解、年级适配、图片输入和已有数据需要继续保留。不要擅自改变原有产品目标和视觉风格。
- 用户要求连续自主开发：正常实现、检查和修复过程中不要反复停下来询问“下一步做什么”。只有确需用户作决定、授权或交互时才提问，并明确说出原因。用户已经表示不再反复手动验证已有物理模型；自动化测试可以继续，使用中出现问题由用户反馈。
- 网站部署不因开发自动获得授权；2026-11-13 已按用户的明确指示部署默认构建和 Worker。物理融合预览仍未上线。

### 2. 版本管理：先保护工作区

- 2026-11-13 代码提交：`8aee16e 完善图片题条件核对与无障碍提示`；此前 `2f1cda9 完善跨学科图形选择与练习自包含`、`eafe784 加固会话恢复、存储与代理安全`、`747a6a8`。均位于分支 `eli5-physics-fusion`；`master` 仍停在 `969604b`，未自动合并。
- 同日已按用户指示部署：前端 Pages 部署 `a5a3b1ed`，生产域 `zixue.oj-codes.com` / `zixue-xiaozhan.pages.dev`，主 bundle `index-DesKJqge.js`、CSS `index-D_cmSXp6.css`，按需加载 `PracticeCards`、`Eli5View`、`ChatView`、`SettingsView` 分块，线上 ELI5 提示词版本 `2.5`；Worker `zixue-relay` 版本 `2fcd4a44-c611-42ff-bee7-e7ecfea5f51a`。默认构建不包含物理 Worker、物理字体/包和压缩编译器；包含报告打印、顶栏深浅色开关，以及“首次发送才创建最近学习记录”的会话行为。
- 记录部署的文档修改通常比代码提交晚一个提交；以 `git log -2 --oneline` 为准。
- 先运行 `git status --short`、`git log -2 --oneline` 和 `git diff` 熟悉现状；还要检查 `git status` 中的 `??` 新文件，普通 `git diff` 不包含它们。若把项目交给其他环境，请确保完整携带所有已修改及未跟踪的项目源文件；忽略目录和敏感配置按需单独处理，勿把 API key 等秘密写入提交。
- 当前环境可以写入 `.git`；继续提交时沿用项目的中文提交习惯，保留已有历史。提交前已扫描常见的硬编码密钥模式，未发现真实密钥；仍不要提交 `.env`、真实 API key 等。若要把成果合回 `master`，需由用户确认后再操作。
- `node_modules/`、`dev/typst-cache/` 等被 `.gitignore` 忽略，迁移后可能需要重新安装依赖和准备资源。不要把本机缓存视为已经提交的源码。

### 3. 当前实现：以代码为准

1. **通用 ELI5**：提示词分层，当前新会话提示词版本为 `2.5`；讲解与练习流程已抽离。支持图片传递、练习失败单独重试、生成中断恢复、条件不明时停止练习。提示词按学科选择图形形式，图片题先列出从图中读到的关键文字、数字和条件，练习题面要求自包含（拒绝“如图/图中/原题/原图”等依赖讲解页或图片的写法，不合规会有限重试）。练习检查的是标签和格式，不证明答案或实际难度正确。讲解页和练习设有超长输出上限，异常大的结果会先重试，仍不合规则提示重新生成；练习反复失败时可保留讲解、跳过练习结束本次学习。旧会话保留原版本。
2. **预览分流**：显式设置 `VITE_ENABLE_PHYSICS=true` 的预览构建，对初高中纯文字内容先调用模型判别。非物理内容继续普通 ELI5；可处理候选进入物理流程；超范围走未核验的文字退路；条件不足进入待复核，保留重试入口，并可让使用者主动改用仅文字的普通讲解——该退路不生成物理图，页面持续标注未经物理核验。分流状态可以附带简短说明，但同时给出 `model` 的矛盾结构会转入复核。小学及图片输入目前不自动走物理工具。默认生产构建不启用此入口，也不包含物理 Worker、物理字体/包和压缩编译器；不要误称线上已经启用。
3. **工具融合**：模型只提取受限结构，程序验证后构建自己的 Typst 源码；使用真实 typed-physics 后台线程进行支持范围内的计算和绘图，再核对结果，固定图和关键结果，并将结构化事实交给 ELI5 生成补充讲解。**不能执行模型自由生成的 Typst 代码**。固定页面顶部显示转义并限长的原题，恢复讲解时按同一题目重建页面。补充讲解失败或模型判定无法讲解时，可以重试，也可以保留已验证的图、结果和固定练习并跳过补充讲解。模型对题意的判断、补充讲解及图形语义仍不能被格式校验证明正确。
4. **当前适配**：光滑固定斜面、竖直悬挂静止、有限规模理想直流纯电阻串并联网络；另有一个限定条件的人板静力原型，**人板使用自建静力计算，并非 typed-physics**。当前支持范围有限，不能以此推断涵盖初高中物理。电路的串并联结构和数值有额外独立检查，但原文引用不能证明模型正确理解拓扑。
5. **数值与条件边界**：电阻和电压、以及其他模型中题面给定的质量、角度、重力加速度和拉力，需核对连续原文、直接数值及已支持单位；表达式、负号、截断数值、无法确认的单位等会进入待复核。条件类原文依据还要求片段正面写出条件词（光滑+固定、静止/不动、竖直+绷紧/悬挂、只受/仅受等），片段存在或上下文暗示不等于条件成立。支持部分科学计数法，不做一般单位换算。允许采用未给出的重力加速度假设时须明确展示假设。原文匹配仍无法证明数值归属于正确对象，也不能证明模型理解了题意。
6. **可靠性和隔离**：后台线程失败与模型连接错误分别提示；可重试并在合适情况下复用已验证工具结果。恢复缓存候选时重验模型、结果和固定页面结构；损坏则丢弃候选。读取本机会话时先把旧版本或损坏结构收敛为可渲染的数据，丢弃无效消息、练习和超长页面；无法识别的记录不打开。应用外层有渲染错误边界，单条坏记录不会导致整页白屏。转发代理拒绝非本机目标的明文 HTTP；本地联调仍允许 loopback。SVG 的每个几何元素和题意是否一致仍不能自动保证。ELI5 iframe 限制外部子资源；纯文字退路与练习禁止图片和外链。
7. **输入与使用体验**：透明图转 JPEG 前铺白底，图片处理期间阻止提交；切换到不支持图片的模型时保留原输入并提示。新会话记录原图数量，缺图时阻止不完整重试。讲解需要补充信息或生成失败时，可把原题放回输入框修改后重发（图片仍需重新上传）；生成期间关闭或刷新页面会先提示一次。本机存储写入失败时会提示记录可能无法保存，但界面继续可用。设置页的厂商测试、拉模型和代理检查有约 20 秒超时，测试请求限制 1 个输出 token。掌握报告可打印或保存为 PDF，打印页不含脚本和外链。外观支持浅色/深色/跟随系统，顶栏昵称与设置之间有滑动开关；深色保留三学段配色，模型生成的讲解页仍按原内容显示。模式切换不再立即创建空白会话；“最近学习”只显示已有消息的会话，首次发送后才写入列表，旧空白记录会被隐藏。讲解、苏格拉底和设置界面按需加载，首屏主包约 220KB（gzip 约 77KB），KaTeX/练习卡在打开对应界面时才加载。KaTeX 已升级到 0.19.1，生产依赖审计 0 漏洞；聊天记录、技能条、报告进度条和首次引导补充了读屏语义。设置页切换期间保留学习任务，生成期间阻止删除对应会话。API key 保存在本地，但请求时会按设置发往模型服务及所选代理，不能表述为永不离开浏览器。

### 4. 从哪里读代码

- 通用流程：`web/src/prompts/eli5Core.ts`、`eli5.ts`、`web/src/lib/eli5Pipeline.ts`、`web/src/components/LearnView.tsx`、`Eli5View.tsx`。
- 融合与验证：`web/src/prompts/physics.ts`，以及 `web/src/lib/physics/` 下的 `pipeline.ts`、`extraction.ts`、`browserEngine.ts`、`physics.worker.ts`、`workerClient.ts`、`eli5Explain.ts`、`circuit*.ts`、`personBoard.ts`。
- 恢复与安全：`web/src/lib/recoverSession.ts`、`sessionData.ts`、`sessionImages.ts`、`vision.ts`、`explainDocument.ts`、`htmlToText.ts`、`markdown.ts`。
- 测试与记录：`web/tests/`、`dev/mock-vendor.mjs`、`docs/physics-probe.md`、`docs/eli5-development-evaluation.md`。本地模拟模型只验证流程，不是实际模型质量评测。

### 5. 已做验证、运行命令与尚未完成的事

在交接前的当前工作区，`web` 目录执行 `npm test` 通过，包含 TypeScript、通用讲解、会话结构收敛、融合分流（含待复核退路与跳过补充讲解）、物理条件证据核对、模型边界、真实电路库编译及默认/预览构建检查；另执行 `npm run test:typst-probe` 通过，使用真实 Typst/typed-physics 检查支持案例。`git diff --check` 通过，仅有 Windows 换行提示。曾用本地模拟服务和独立浏览器验证若干分流、失败重试、图片处理及 iframe 子资源隔离；这些不是完整的真实模型输出或最终视觉验收。用户过去反馈过部分图和练习，不能据此推断整体正确率。

2026-11-13 线上部署验证：`zixue.oj-codes.com` 与 `zixue-xiaozhan.pages.dev` 均引用主 bundle `index-DesKJqge.js` 与 `index-D_cmSXp6.css`；主 JS 约 220KB（gzip 约 77KB），不含 KaTeX；`PracticeCards`（约 370KB，含 KaTeX）、`Eli5View`、`ChatView`、`SettingsView` 为按需分块且可正常请求。bundle 含“本机存储不可用或已满”“请求超时”“还差一点信息”“图形形式要服从学科”“题面必须自包含”“关键文字”“打印 / 保存为 PDF”“跟随系统”“深色模式”“模式说明”等新标记，CSS 含 `data-theme=dark` 和 `theme-switch`；Worker 健康检查在自定义域和 workers.dev 均返回 200；无 `Origin` 的 `/proxy` 请求返回 403 `origin_required`；带生产 `Origin` 的请求成功转发到 DeepSeek 并返回 401（未带 key，属预期）；HTTP 目标返回 400 `insecure_target`；响应含 `Access-Control-Allow-Origin` 与 `Vary: Origin`。物理编译器和物理 Worker 路径未部署，物理字体/包已从默认发布包移除；请求这些路径会被 Pages 回退成 index.html（200/text/html），默认构建不会请求它们。

PowerShell 常用命令（在项目根目录执行；不含上线）：

```powershell
git status --short
Set-Location -LiteralPath '.\web'
npm install
npm test
npm run test:typst-probe
npm run dev
# 需要体验物理预览时，在启动该 PowerShell 进程前设置：
$env:VITE_ENABLE_PHYSICS = 'true'
npm run dev
```

`npm test` 会构建默认和预览版本，可能较慢；相关资源、版本和更多本地探针说明见 `docs/physics-probe.md`。如果依赖或网络不可用，要报告具体失败，不要声称测试通过；无需让用户重复手工安装已正常可用的资源。

后续优先围绕整个融合产品继续开发：检查真实输入到分流、工具、ELI5 和练习的一致性；完善超出支持范围和失败恢复；继续提高全科学习体验及安全性。必要时扩展通用的工具适配，不能为了覆盖示例而不断硬编码题型。正式启用前仍需对真实模型、独立案例、实际视觉、浏览器和部署资源做验证，并审查依赖与字体许可；目前没有足够证据宣称特定正确率或已达到上线标准。真实模型评估是否安排要尊重用户不再反复手动测试的决定，不得假称已经完成。

---

## 历史交接（2026-11-12，保留供参考）

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
- **暗色模式**：设置页提供浅色 / 深色 / 跟随系统；深色保留三学段配色，讲解 iframe 和固定物理页仍按生成内容显示（通常为浅色纸张）。

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
- 暗色模式已提供浅色/深色/跟随系统三档；旧会话和模型生成的讲解页仍按原内容显示。
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
