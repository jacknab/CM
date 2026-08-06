import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["../booking/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../booking/src"),
      "@shared": path.resolve(__dirname, "../../shared"),
    },
  },
});
