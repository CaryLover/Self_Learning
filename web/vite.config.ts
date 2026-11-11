import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base './'：让产物可部署在任意子路径（Cloudflare Pages / 本地双击预览均可）
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2020" },
});
