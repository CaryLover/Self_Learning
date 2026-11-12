import { defineConfig } from "vite";
import { resolve } from "node:path";
import { releasePublicAssets } from "./vite.public-assets";
import { compilerAsset } from "./vite.compiler-asset";

// Separate proof-of-concept build; never overwrites the deployed application's dist.
export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [releasePublicAssets(), compilerAsset(true)],
  worker: { format: "es" },
  build: {
    outDir: "../dev/probe-build-compressed",
    emptyOutDir: false,
    rollupOptions: { input: resolve(process.cwd(), "typst-probe.html") },
  },
});
