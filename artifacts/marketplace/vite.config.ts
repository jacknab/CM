import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT ?? "4174";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    // Own subdirectory inside api-server's shared dist/public tree so this
    // package's hashed assets never collide with booking's or
    // website-builder's own asset filenames living in the same directory.
    outDir: path.resolve(import.meta.dirname, "../api-server/dist/public/mp-assets"),
    assetsDir: "assets",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/main.tsx"),
    },
  },
  ssr: {
    // Built for plain Node, not for another Vite server — externalize
    // nothing so the output is a single self-contained module the API
    // server can dynamically import() without needing React etc. as its
    // own runtime dependencies.
    noExternal: true,
    target: "node",
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
