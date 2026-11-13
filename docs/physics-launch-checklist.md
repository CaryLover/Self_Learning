# 物理预览上线前检查清单

状态：**未上线，未获最终授权**。本清单记录 2026-11-13 的构建与依赖检查结果；真正开启生产构建前，仍需完成许可证结论、生产冒烟和用户确认。

## 1. 构建产物

使用 `VITE_ENABLE_PHYSICS=true npx vite build --outDir ../dev/physics-preview-build --emptyOutDir` 构建，未部署。

| 资源 | 大小 | 说明 |
|---|---:|---|
| `physics-runtime/typst-compiler.gz.bin` | 10,839.74 kB | 压缩编译器，运行时解压并校验 SHA-256；小于 Pages 25 MiB 单文件限制 |
| `assets/typst_ts_renderer_bg-*.wasm` | 972.43 kB | 渲染器 |
| `physics-fonts/NewCM10-Regular.otf` | 586.33 kB | GUST Font License，NOTICE 随包 |
| `physics-fonts/NewCMMath-Regular.otf` | 1,150.84 kB | 同上 |
| `physics-packages/typed-physics-0.3.0.bin` | 103.61 kB | MIT |
| `physics-packages/cetz-0.5.2.bin` | 218.96 kB | **LGPL-3.0-or-later，待许可证结论** |
| `physics-packages/oxifmt-1.0.0.bin` | 20.12 kB | MIT OR Apache-2.0 |
| `assets/physics.worker-*.js` | 50.82 kB | 后台编译线程 |
| 主 bundle | 227.92 kB（gzip 79.16 kB） | 比默认构建增加约 5 kB |

发布目录含 `physics-packages/NOTICE.md` 和 `physics-fonts/NOTICE`，记录来源、哈希与许可证。压缩编译器约 10.8 MB，总新增资源约 15 MB；首次使用物理工具时才请求。

## 2. 许可证

- Typst 编译器/渲染器：Typst 本体为 Apache-2.0；`typst.ts` 相关 npm 包按其包内许可证执行，需在发布时保留 NOTICE。
- `typed-physics`：MIT；`oxifmt`：MIT/Apache-2.0；字体：GUST Font License；NOTICE 已随资源保留。
- **CeTZ 0.5.2 为 LGPL-3.0-or-later**。当前 `.bin` 保留未修改的完整包归档（含源码和许可证），但浏览器会校验固定哈希，使用者不能自行替换该库。需要确认这种“随应用分发不可替换的 LGPL 库”是否满足 LGPL 的修改/重链接义务，或在发布前替换为许可证更宽松的绘图方案。**这是当前阻止上线的主要未决项**。
- 生产包是否需要在站内提供第三方许可证页面、源码获取链接，需与上述结论一起决定。

## 3. 生产启用步骤（尚未执行）

1. 解决 CeTZ LGPL 结论或替换方案；
2. 用 `VITE_ENABLE_PHYSICS=true` 构建，确认主 bundle 含预览标记、物理资源齐全且没有密钥；
3. 单独部署 Pages（不要与默认构建混用），记录部署 ID；
4. 线上用真实 key 做冒烟：
   - 高中斜面、悬挂各 1 次；
   - 初中斜面走文字退路、初中悬挂/纯电阻电路可进入；
   - 超范围热传导/滑轮走未核验文字退路；
   - 390 宽度手机检查图例、箭头、按钮；
5. 检查首次加载时间、压缩编译器请求、失败重试和回滚；
6. 明确支持范围，不宣称覆盖全部初高中物理。

## 4. 回滚

保留当前默认构建（`index-CFxkUWdm.js` / `index-u5UlLPFP.css`，Pages `96c8b2cc`）作为回滚目标；物理预览出现问题时重新部署默认 `dist` 即可。不要在未保留默认构建的情况下直接覆盖线上目录。

## 5. 结论

- **可以准备**：构建产物、文件大小、字体/包 NOTICE、默认构建回滚路径。
- **不能上线**：CeTZ LGPL 未决；本轮没有做生产物理冒烟；用户尚未明确授权开启物理预览。
- 建议继续保持默认生产构建不含物理资源，直到上述两项完成。
