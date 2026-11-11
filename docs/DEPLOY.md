# 部署指南（Cloudflare Pages + Workers）

全部使用 Cloudflare 免费层：静态托管 + Worker 每天 10 万次请求，个人使用绰绰有余。
只需一个 Cloudflare 账号（免费注册：<https://dash.cloudflare.com/sign-up>）。

## 一、部署转发代理（Workers）

```bash
cd worker
npm install
npx wrangler login        # 会打开浏览器授权
```

编辑 `worker/wrangler.toml`：

1. `name` 改成你自己的名字（如 `my-zixue-relay`），这决定代理地址 `https://<name>.<你的子域>.workers.dev`；
2. **强烈建议**把 `[vars]` 的 `ALLOWED_ORIGINS` 改成你的站点地址（部署完 Pages 后回来填）：

   ```toml
   [vars]
   ALLOWED_ORIGINS = "https://你的站点.pages.dev,http://localhost:5173"
   ALLOWED_HOSTS = ""          # 留空 = 内置 7 家厂商白名单
   RATE_LIMIT_PER_MIN = "60"
   ```

部署：

```bash
npx wrangler deploy
```

记下输出的代理地址（形如 `https://my-zixue-relay.xxx.workers.dev`）。

> **验证**：浏览器访问代理根地址，应返回 `{"name":"zixue-relay","version":"1.0.0",...}`。

## 二、部署前端（Pages）

方式 A：**Git 集成（推荐，自动更新）**

1. 把本项目推到 GitHub；
2. Cloudflare 控制台 → Workers & Pages → Create → Pages → Connect to Git；
3. 构建配置：
   - Framework preset: `Vite`（或 None）
   - Build command: `cd web && npm install && npm run build`
   - Build output directory: `web/dist`
4. 保存部署，得到站点地址（形如 `https://xxx.pages.dev`）。

方式 B：**直接上传（无 Git）**

```bash
cd web && npm run build
npx wrangler pages deploy dist --project-name zixue-xiaozhan
```

## 三、回填 Origin 白名单

拿到 Pages 站点地址后，把 `worker/wrangler.toml` 的 `ALLOWED_ORIGINS` 补上该地址，再 `npx wrangler deploy` 一次。

## 四、家长侧配置（每台设备一次）

1. 打开站点 → 🔒 家长设置；
2. 代理地址填第一步的 Workers 地址 → 点「测试代理」确认 ✅；
3. 任选一家厂商：启用 → 点「获取 key ↗」注册并创建 API key → 粘贴 → 「测试」→「获取模型」→ 勾选孩子可用的模型 → 设一个「默认」；
4. 建议在各厂商后台设置**消费限额 / 余额告警**。

## 常见问题

| 现象 | 处理 |
|---|---|
| 测试代理 ❌ | 检查地址是否以 `https://` 开头、Worker 是否部署成功；大陆网络对 workers.dev 波动时稍后重试 |
| 某厂商测试 ❌ 401 | key 填错或未开通该模型权限；DashScope 注意 key 与地域绑定（国际版需改地址为 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`） |
| 拉取模型为空/报错 | 个别厂商（如 GLM）列表接口只返回付费模型，直接使用内置清单即可 |
| 想用其他厂商 | 管理员可在 `worker/wrangler.toml` 的 `ALLOWED_HOSTS` 加域名；前端修改厂商地址即可 |
| 大陆访问 workers.dev 不稳 | 见开发计划风险表：可迁移国内托管（需备案）或换自建代理；Pages 域名通常可用 |

## 自定义域名（可选）

Pages 项目 → Custom domains 绑定自有域名；Worker 也可在 dashboard 加 route 或 Custom Domain。
绑定后把两处地址同步更新到 `ALLOWED_ORIGINS` 与家长设置的代理地址。
