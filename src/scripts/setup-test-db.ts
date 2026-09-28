import { execSync } from "node:child_process";

/**
 * Applies pending migrations to the integration-test database before
 * `npm run test:integration` — kept as a script (not a bare `prisma migrate
 * deploy` in package.json) so DATABASE_URL for the test DB never depends on
 * a shell export the developer might forget, and never risks running
 * against whatever DATABASE_URL happens to be set for local dev.
 *
 * Usage: npm run test:integration:setup
 *   (optionally set TEST_DATABASE_URL to point elsewhere)
 */
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/espera_test";

if (!/test/i.test(testDatabaseUrl)) {
  throw new Error(
    `Refusing to migrate a database whose name doesn't contain "test": ${testDatabaseUrl}`,
  );
}

// No interpolated/user-controlled input in this command — the shell is only
// needed for npx.cmd resolution on Windows.
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testDatabaseUrl },
});
