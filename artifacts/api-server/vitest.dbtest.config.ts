import { defineConfig } from "vitest/config";
import path from "path";

// Database tests (src/**/*.dbtest.ts) — run only through scripts/lcf-dbtest.sh, which makes a disposable database
// (lcf_test_*) with the production structure and passes it as LCF_TEST_DB. Never a real database.
const url = process.env.LCF_TEST_DB ?? "";
if (!/\/lcf_test_[0-9]{14}_[0-9]+_[0-9]+_[a-z]+(\?|$)/.test(url)) {
  throw new Error("Refusing: LCF_TEST_DB must be a disposable lcf_test_* database (use scripts/lcf-dbtest.sh)");
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.dbtest.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: { DATABASE_URL: url, HAIRCUT_FORMULAS: "on" },
  },
  resolve: { alias: { "@shared": path.resolve(__dirname, "../../shared") } },
});
