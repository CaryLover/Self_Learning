import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import type { Plugin } from "vite";

/** Compress WASM before upload: the uncompressed compiler exceeds Pages' per-file limit. */
export function compilerAsset(emit: boolean): Plugin {
  let compressed: Buffer | undefined;
  const bytes = () => {
    if (!compressed) compressed = gzipSync(readFileSync(resolve(process.cwd(), "node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm")), { level: 9 });
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
