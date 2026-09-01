import "./env";

// Integration tests write real rows to whatever DATABASE_URL resolves to —
// refuse to run against anything that doesn't look like a test database, in
// case a developer's shell already has DATABASE_URL exported for local dev.
if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error(
    `Refusing to run integration tests against a non-test database: ${process.env.DATABASE_URL}`,
  );
}
