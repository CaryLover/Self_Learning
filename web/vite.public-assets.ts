import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

/** Exclude temporary browser probes while preserving the remaining public paths. */
export function releasePublicAssets(includePhysics = true): Plugin {
  const physicsDirs = new Set(["physics-fonts", "physics-packages"]);
  return {
    name: "release-public-assets",
    apply: "build",
    async generateBundle() {
      const root = join(process.cwd(), "public");
      const visit = async (directory: string): Promise<void> => {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          if (directory === root && (entry.name === "__probe_build" || entry.name === "__typst_probe" || (!includePhysics && physicsDirs.has(entry.name)))) continue;
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await visit(path);
          else if (entry.isFile()) this.emitFile({ type: "asset", fileName: relative(root, path).split(sep).join("/"), source: await readFile(path) });
        }
      };
      try { await readdir(root); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      await visit(root);
    },
  };
}
