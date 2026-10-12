/**
 * Build used when this app runs inside the Certxa server.
 *
 * The app's own files are published under /_site/ so they cannot collide with
 * the booking app's /assets or the PHP site's /assets on the same domain.
 * The server build produces only the page renderer (entry-server), not the
 * standalone Express server from src/server/entry.ts — the Certxa API server
 * does the serving.
 */
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from "vite";
import baseConfig from "./vite.config";

export default defineConfig((env: ConfigEnv) => {
  const base = (baseConfig as (e: ConfigEnv) => UserConfig)(env);
  if (!env.isSsrBuild) return mergeConfig(base, { base: "/_site/" });
  return {
    ...base,
    base: "/_site/",
    build: {
      outDir: "dist/render",
      emptyOutDir: true,
      copyPublicDir: false,
      ssr: "src/entry-server.tsx",
      rollupOptions: {
        output: {
          format: "es",
          entryFileNames: "entry-server.mjs",
          chunkFileNames: "[name]-[hash].mjs",
          banner: "import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);",
        },
      },
    },
  };
});
