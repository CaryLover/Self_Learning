# 物理预览上线前检查清单

状态：**未上线，未获最终授权**。2026-11-13 已移除 CeTZ、字体和渲染器依赖，物理图改为应用自绘 SVG；本清单记录当前构建、许可证和生产启用前仍需完成的检查。

## 1. 构建产物

使用 `VITE_ENABLE_PHYSICS=true npx vite build --outDir ../dev/physics-preview-build --emptyOutDir` 构建，未部署。

| 资源 | 大小 | 说明 |
|---|---:|---|
| `physics-runtime/typst-compiler.gz.bin` | 10,839.74 kB | 压缩编译器，运行时解压并校验 SHA-256；小于 Pages 25 MiB 单文件限制 |
| `physics-packages/typed-physics-0.3.0.bin` | 94.28 kB | 修改版 typed-physics 0.3.0（MIT），仅保留计算模块 |
| `assets/physics.worker-*.js` | 35.90 kB | 后台编译线程 |
| 主 bundle | 227.92 kB（gzip 79.17 kB） | 比默认构建增加约 5 kB |

不再包含 CeTZ、oxifmt、Typst 渲染器 WASM 或 New Computer Modern 字体。发布目录含 `physics-packages/NOTICE.md`，记录修改、来源、哈希和 MIT 许可证；压缩编译器约 10.8 MB，首次使用物理工具时才请求。

## 2. 许可证

- `typed-physics` 0.3.0：MIT。当前 `.bin` 是修改版：删除导入 CeTZ 的绘图入口，保留 mechanics/electricity 的声明、求解和结果模块；LICENSE 随包保留。
- Typst 编译器：Typst 本体 Apache-2.0；`typst.ts` 相关 npm 包按其包内许可证执行，发布时保留 NOTICE。
- **CeTZ 已移除**，因此不再有 LGPL-3.0-or-later 的打包/重链接问题。
- 物理图由应用自己的 `diagram.ts` 生成普通 SVG（斜面、悬挂、电路），不执行模型生成的 Typst 图形源码。
- 生产包是否需要在站内提供第三方许可证页面，可作为发布前的文案工作；当前 NOTICE 已足以说明 MIT/Typst 来源。

## 3. 生产启用步骤（尚未执行）

1. 用 `VITE_ENABLE_PHYSICS=true` 构建，确认主 bundle 含预览标记、物理资源齐全且没有密钥；
2. 单独部署 Pages（不要与默认构建混用），记录部署 ID；
3. 线上用真实 key 做冒烟：
   - 高中斜面、悬挂各 1 次；
   - 初中斜面走文字退路、初中悬挂/纯电阻电路可进入；
   - 超范围热传导/滑轮走未核验文字退路；
   - 390 宽度手机检查图例、箭头、按钮；
4. 检查首次加载时间、压缩编译器请求、失败重试和回滚；
5. 明确支持范围，不宣称覆盖全部初高中物理。

## 4. 回滚

保留当前默认构建（`index-DTKk0Auu.js` / `index-CQ2cw51t.css`，Pages `c4e5ad8c`）作为回滚目标；物理预览出现问题时重新部署默认 `dist` 即可。

## 5. 结论

- **技术阻塞已解除**：CeTZ 和字体已移除，计算路径用修改版 typed-physics，图形由应用自绘；测试与本地预览已验证斜面、悬挂和电路。
- **仍需完成**：生产物理冒烟、手机/读屏人工验收、用户明确授权开启物理预览。
- 建议继续保持默认生产构建不含物理资源，直到上述三项完成。
