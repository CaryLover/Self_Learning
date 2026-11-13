# 物理预览上线记录

状态：**已于 2026-11-13 按用户明确授权上线（有限支持范围）**。Pages 部署 `76b49aa4`，生产域 `zixue.oj-codes.com`。物理预览仍标注“题目理解、图形和讲解仍需人工审核；当前只覆盖有限题型”。

## 1. 构建产物

使用 `VITE_ENABLE_PHYSICS=true npm run build` 构建并部署。

| 资源 | 大小 | 说明 |
|---|---:|---|
| `physics-runtime/typst-compiler.gz.bin` | 10,839.74 kB | 压缩编译器，运行时解压并校验 SHA-256；小于 Pages 25 MiB 单文件限制 |
| `physics-packages/typed-physics-0.3.0.bin` | 94.28 kB | 修改版 typed-physics 0.3.0（MIT），仅保留计算模块 |
| `assets/physics.worker-*.js` | 35.90 kB | 后台编译线程 |
| 主 bundle | 227.92 kB（gzip 79.17 kB） | 比默认构建增加约 5 kB |

不包含 CeTZ、oxifmt、Typst 渲染器 WASM 或 New Computer Modern 字体。`physics-packages/NOTICE.md` 记录修改、来源、哈希和 MIT 许可证。

## 2. 许可证

- `typed-physics` 0.3.0：MIT。当前 `.bin` 是修改版：删除导入 CeTZ 的绘图入口，保留 mechanics/electricity 的声明、求解和结果模块；LICENSE 随包保留。
- Typst 编译器：Typst 本体 Apache-2.0；`typst.ts` 相关 npm 包按其包内许可证执行，发布时保留 NOTICE。
- **CeTZ 已移除**，不再有 LGPL-3.0-or-later 的打包/重链接问题。
- 斜面、悬挂和纯电阻电路图由应用自己的 `diagram.ts` 生成普通 SVG；不执行模型生成的 Typst 图形源码。

## 3. 上线后冒烟

2026-11-13 在生产域使用真实 key 完成：

- 高中斜面：进入物理工具，N≈13.81 N、a≈3.352 m/s²，自绘 SVG、3 道练习正常；
- 高中悬挂：进入物理工具，T=30 N，图中可见绳索；
- 纯电阻串并联电路：进入电路工具，R≈6 Ω、I≈2 A；
- 热传导：未使用物理工具，显示未核验文字退路；
- 390 宽度：页面无横向溢出，物理预览提示和输入框可见。

已知风险：

- 部署后第一次冷加载编译器曾出现一次“物理编译器加载失败”，重试后成功；随后浏览器内下载约 4 秒。首次失败可能与部署传播/冷启动有关，仍需观察。
- 自绘图的手机、读屏和打印/缩放 A+B+C 已由使用者人工验收，未报告问题；更完整题型、其他浏览器和逐箭头视觉审核仍未完成，不能把本次冒烟当成全部题型通过。
- 支持范围仍是光滑固定斜面、竖直悬挂静止、有限纯电阻网络和限定人板静力；其他物理题走未核验文字退路或待复核。

## 4. 回滚

上一版默认构建为 `index-DTKk0Auu.js` / `index-CQ2cw51t.css`，Pages `c4e5ad8c`；需要回滚时重新部署默认 `dist`（不带 `VITE_ENABLE_PHYSICS`）。不要删除旧部署记录。

## 5. 后续

- 监控首次编译器加载失败、等待时间和失败重试；
- 继续补做更多独立题型和其他浏览器；年级边界问题见 `docs/known-issues.md` KI-001。
- 继续明确有限支持范围，不宣称覆盖全部初高中物理。
