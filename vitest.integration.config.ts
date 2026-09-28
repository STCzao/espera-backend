import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/integration-env.ts"],
    clearMocks: true,
    restoreMocks: true,
    // Real Postgres round-trips are slower than the in-memory-fake suite.
    testTimeout: 15_000,
    // These tests share one real database and mutate rows by primary key —
    // running files in parallel workers risks unrelated tests racing on the
    // same connection pool/table locks.
    fileParallelism: false,
  },
});
