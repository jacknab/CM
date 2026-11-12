import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["../booking/src/**/*.test.ts", "../booking/src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../booking/src"),
      "@shared": path.resolve(__dirname, "../../shared"),
    },
  },
});
