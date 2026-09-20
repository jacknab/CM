import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Unit tests must never reach a real database. Some modules under test import src/db.ts, which
    // throws at load when DATABASE_URL is unset — a dummy URL lets them load (the pool connects lazily).
    env: { DATABASE_URL: "postgres://test:test@127.0.0.1:5432/certxa_unit_tests" },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../../shared"),
    },
  },
});
