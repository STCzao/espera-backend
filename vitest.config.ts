import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // Integration tests hit a real Postgres (see vitest.integration.config.ts)
    // and run via `npm run test:integration` — kept out of the default,
    // DB-independent suite so `npm test` never needs Docker running.
    exclude: ["tests/integration/**", "node_modules/**"],
    setupFiles: ["tests/setup/env.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
