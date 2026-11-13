import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import type { Plugin } from "vite";

/** Compress WASM before upload: the uncompressed compiler exceeds Pages' per-file limit. */
export function compilerAsset(emit: boolean): Plugin {
  let compressed: Buffer | undefined;
  const bytes = () => {
    if (!compressed) {
      const compiler = readFileSync(resolve(process.cwd(), "node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm"));
      const digest = createHash("sha256").update(compiler).digest("hex");
      if (digest !== "1fc968438a672366dfec39c96c842c26ed29caff4eb1bcaab19a6c60867de5fd") throw new Error("物理编译器版本或文件校验不匹配，请重新安装项目依赖");
      compressed = gzipSync(compiler, { level: 9 });
    }
    if (compressed.length > 25 * 1024 * 1024) throw new Error("Compressed compiler exceeds the Pages asset limit");
    return compressed;
  };
  return {
    name: "physics-compiler-asset",
    configureServer(server) {
      server.middlewares.use("/physics-runtime/typst-compiler.gz.bin", (_request, response) => {
        response.setHeader("Content-Type", "application/octet-stream");
        response.setHeader("Cache-Control", "no-store");
        response.end(bytes());
      });
    },
    generateBundle() {
      if (emit) this.emitFile({ type: "asset", fileName: "physics-runtime/typst-compiler.gz.bin", source: bytes() });
    },
  };
}
