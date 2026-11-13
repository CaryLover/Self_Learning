import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { releasePublicAssets } from "./vite.public-assets";
import { compilerAsset } from "./vite.compiler-asset";

// base './'：让产物可部署在任意子路径（Cloudflare Pages / 本地双击预览均可）
export default defineConfig(({ command, mode }) => {
  const physicsPreview = loadEnv(mode, process.cwd(), "VITE_").VITE_ENABLE_PHYSICS === "true";
  return {
  base: "./",
  publicDir: command === "build" ? false : "public",
  plugins: [react(), releasePublicAssets(), compilerAsset(physicsPreview)],
  define: { __PHYSICS_PREVIEW__: JSON.stringify(physicsPreview) },
  worker: { format: "es" },
  build: { target: "es2020" },
  };
});
