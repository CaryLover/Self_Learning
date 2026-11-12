import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { releasePublicAssets } from "./vite.public-assets";
import { compilerAsset } from "./vite.compiler-asset";

// base './'：让产物可部署在任意子路径（Cloudflare Pages / 本地双击预览均可）
export default defineConfig(({ command }) => ({
  base: "./",
  publicDir: command === "build" ? false : "public",
  plugins: [react(), releasePublicAssets(), compilerAsset(false)],
  worker: { format: "es" },
  build: { target: "es2020" },
}));
